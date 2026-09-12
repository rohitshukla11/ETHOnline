// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal Chainlink AggregatorV3 surface. Declared locally rather than importing the
// chainlink contracts package, so this file adds no dependency to the build.
// (Plain comments, not NatSpec: an @-prefixed package name is parsed as a doc tag.)
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title CollateralNavOracle
/// @notice Net asset value for a tokenized warehouse receipt, combining an off-chain crop
///         appraisal with a Chainlink reference price.
///
/// @dev STANDALONE BY DESIGN. `GodaamVault` is deployed and Sourcify-verified at
///      `exact_match`; editing it would forfeit that. This reads the vault's world rather
///      than changing it, and a future vault version can consume it through
///      `navOf(receiptId)` without either contract being rewritten.
///
///      ---------------------------------------------------------------------------
///      WHAT THIS ORACLE DOES NOT DO, STATED PLAINLY
///
///      Chainlink publishes no grain price feed on Hedera testnet. The available feeds
///      are HBAR/USD, USDC/USD, ETH/USD, BTC/USD, LINK/USD, DAI/USD and USDT/USD - all
///      crypto and stablecoin pairs, none agricultural.
///
///      So the crop valuation is NOT oracle-derived. `appraisalUsdPerTonne` is an
///      administered figure set by the warehouse operator, exactly as a physical
///      warehouse receipt's appraisal is today. The Chainlink feed supplies the
///      *settlement currency* reference price, which is a real dependency - loans are
///      denominated in a stablecoin and liquidation proceeds settle in it - but it is
///      not a grain price and this contract never pretends otherwise.
///
///      Dressing HBAR/USD up as a wheat price would be the same defect class as a
///      hand-encoded LTV: a plausible number with the wrong provenance. `navOf` returns
///      the appraisal source alongside the value so a caller cannot mistake one for the
///      other.
///
///      A production deployment would source the crop price from an agricultural feed
///      (eNAM or Agmarknet mandi rates in the Indian case), delivered by a Chainlink
///      Functions job or a CRE workflow. That is a data-partnership problem, not a
///      contract problem.
///      ---------------------------------------------------------------------------
contract CollateralNavOracle {
    /// @notice Where a component of the valuation came from.
    enum PriceSource {
        None,
        /// @dev Administered by the warehouse operator. Not oracle-derived.
        Appraisal,
        /// @dev Read from a Chainlink aggregator within the staleness window.
        ChainlinkFeed
    }

    struct Nav {
        uint256 navUsd6; // 6dp, same unit as gUSDC
        uint256 appraisalUsdPerTonne; // 6dp
        uint256 quantityKg;
        int256 referenceAnswer; // raw feed answer
        uint8 referenceDecimals;
        uint256 referenceUpdatedAt;
        PriceSource cropSource; // always Appraisal - see the note above
        PriceSource referenceSource; // ChainlinkFeed, or None when stale
    }

    address public owner;

    /// @notice Chainlink aggregator for the settlement currency, e.g. USDC/USD.
    AggregatorV3Interface public referenceFeed;

    /// @notice Reject a feed answer older than this. A stale price is worse than none:
    ///         it looks current and silently misprices collateral.
    uint256 public maxAnswerAge = 3 hours;

    /// @notice Operator-administered crop appraisal, 6dp USD per tonne.
    mapping(uint256 receiptId => uint256 usdPerTonne) public appraisalUsdPerTonne;
    mapping(uint256 receiptId => uint256 kg) public quantityKg;
    mapping(uint256 receiptId => uint64 at) public appraisedAt;

    event ReferenceFeedUpdated(address feed, string description);
    event MaxAnswerAgeUpdated(uint256 seconds_);
    event AppraisalSet(uint256 indexed receiptId, uint256 usdPerTonne, uint256 quantityKg);

    error NotOwner();
    error NoFeedConfigured();
    error NoAppraisal(uint256 receiptId);
    error StaleAnswer(uint256 updatedAt, uint256 maxAge);
    error NonPositiveAnswer(int256 answer);

    constructor(address initialOwner, AggregatorV3Interface feed) {
        owner = initialOwner;
        referenceFeed = feed;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setReferenceFeed(AggregatorV3Interface feed) external onlyOwner {
        referenceFeed = feed;
        emit ReferenceFeedUpdated(address(feed), feed.description());
    }

    function setMaxAnswerAge(uint256 newMaxAge) external onlyOwner {
        maxAnswerAge = newMaxAge;
        emit MaxAnswerAgeUpdated(newMaxAge);
    }

    /// @notice Record the operator's appraisal for a receipt.
    /// @param usdPerTonne 6dp USD per tonne
    /// @param kg          quantity in kilograms, matching the ATS token's share count
    function setAppraisal(uint256 receiptId, uint256 usdPerTonne, uint256 kg) external onlyOwner {
        appraisalUsdPerTonne[receiptId] = usdPerTonne;
        quantityKg[receiptId] = kg;
        appraisedAt[receiptId] = uint64(block.timestamp);
        emit AppraisalSet(receiptId, usdPerTonne, kg);
    }

    /// @notice The Chainlink reference price, reverting rather than returning a stale one.
    function referencePrice() public view returns (int256 answer, uint8 decimals_, uint256 updatedAt) {
        if (address(referenceFeed) == address(0)) revert NoFeedConfigured();
        (, int256 a,, uint256 u,) = referenceFeed.latestRoundData();
        if (a <= 0) revert NonPositiveAnswer(a);
        if (block.timestamp > u + maxAnswerAge) revert StaleAnswer(u, maxAnswerAge);
        return (a, referenceFeed.decimals(), u);
    }

    /// @notice Net asset value of a receipt, 6dp, with the provenance of each component.
    /// @dev `cropSource` is always `Appraisal`. It is never `ChainlinkFeed`, because no
    ///      agricultural feed exists on this chain. Callers should surface that.
    function navOf(uint256 receiptId) external view returns (Nav memory nav) {
        uint256 perTonne = appraisalUsdPerTonne[receiptId];
        if (perTonne == 0) revert NoAppraisal(receiptId);

        uint256 kg = quantityKg[receiptId];
        // 1 tonne = 1000 kg. Both operands are 6dp, so the result stays 6dp.
        nav.navUsd6 = (perTonne * kg) / 1000;
        nav.appraisalUsdPerTonne = perTonne;
        nav.quantityKg = kg;
        nav.cropSource = PriceSource.Appraisal;

        // The reference price does not scale the NAV - it is reported so a caller can see
        // the settlement currency has not depegged. Folding a USDC/USD wobble into a grain
        // valuation would be exactly the false-provenance move this contract avoids.
        (bool ok, bytes memory ret) =
            address(this).staticcall(abi.encodeWithSelector(this.referencePrice.selector));
        if (ok) {
            (int256 a, uint8 d, uint256 u) = abi.decode(ret, (int256, uint8, uint256));
            nav.referenceAnswer = a;
            nav.referenceDecimals = d;
            nav.referenceUpdatedAt = u;
            nav.referenceSource = PriceSource.ChainlinkFeed;
        } else {
            // Stale, unconfigured or non-positive. Report None rather than a number.
            nav.referenceSource = PriceSource.None;
        }
    }
}
