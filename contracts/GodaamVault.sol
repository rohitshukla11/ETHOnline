// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IReceiver} from "./interfaces/IReceiver.sol";
import {WarehouseReceipt} from "./WarehouseReceipt.sol";
import {WorldIdRegistry} from "./WorldIdRegistry.sol";

/// @title GodaamVault
/// @notice Collateralised lending vault for tokenized warehouse receipts.
/// @dev Loan sizing is NOT decided here. The vault only escrows collateral and emits a
///      request; a Chainlink CRE Confidential Workflow (`handlerInTee`) reads the farmer's
///      private risk inputs inside a TEE, computes a score + max LTV, and writes back only
///      the approved terms through the CRE forwarder. The vault refuses to disburse
///      anything that did not come from that forwarder.
contract GodaamVault is IReceiver, IERC721Receiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Requested,
        Active,
        Repaid,
        Liquidated,
        Rejected
    }

    struct Loan {
        address borrower;
        uint256 receiptId;
        uint256 collateralValue; // 6dp appraised value at request time
        uint256 principal; // 6dp disbursed
        uint256 totalOwed; // principal + interest
        uint256 repaid;
        uint256 installmentAmount;
        uint64 startedAt;
        uint64 installmentPeriod;
        uint16 aprBps;
        uint16 ltvBps;
        uint16 riskScore; // 0-1000, returned by the TEE (no raw inputs)
        uint8 installmentCount;
        uint8 installmentsPaid;
        bytes32 privateInputCommitment; // keccak of the raw inputs, proves what the TEE saw
        Status status;
    }

    /// @dev Payload the confidential workflow ABI-encodes as its report.
    struct RiskAssessment {
        uint256 loanId;
        bool approved;
        uint256 approvedPrincipal;
        uint16 aprBps;
        uint16 ltvBps;
        uint16 riskScore;
        uint8 installmentCount;
        uint64 installmentPeriod;
        bytes32 privateInputCommitment;
    }

    IERC20 public immutable stablecoin;
    WarehouseReceipt public immutable receipts;
    WorldIdRegistry public immutable worldIdRegistry;

    /// @notice Chainlink CRE forwarder that is allowed to deliver risk assessments.
    address public creForwarder;
    /// @notice Expected workflow owner encoded in the forwarder metadata.
    address public workflowOwner;

    address public liquidationTreasury;
    uint64 public gracePeriod = 7 days;

    uint256 public nextLoanId = 1;
    mapping(uint256 loanId => Loan) private _loans;
    mapping(uint256 receiptId => uint256 loanId) public activeLoanOfReceipt;

    event LoanRequested(
        uint256 indexed loanId, address indexed borrower, uint256 indexed receiptId, uint256 collateralValue
    );
    event LoanApproved(
        uint256 indexed loanId, uint256 principal, uint16 aprBps, uint16 ltvBps, uint16 riskScore, uint256 totalOwed
    );
    event LoanRejected(uint256 indexed loanId, uint16 riskScore);
    event InstallmentPaid(uint256 indexed loanId, uint8 installmentNumber, uint256 amount, uint256 remaining);
    event LoanRepaid(uint256 indexed loanId, uint256 totalPaid);
    event CollateralReleased(uint256 indexed loanId, uint256 indexed receiptId, address indexed to);
    event LoanLiquidated(uint256 indexed loanId, uint256 indexed receiptId, address liquidator, uint256 shortfall);
    event CreForwarderUpdated(address forwarder, address workflowOwner);

    error NotForwarder();
    error NotWorkflowOwner();
    error NotVerified(address account);
    error NotReceiptOwner();
    error ReceiptAlreadyPledged(uint256 receiptId);
    error BadStatus(uint256 loanId, Status actual);
    error ExceedsCollateralCap(uint256 requested, uint256 cap);
    error InsufficientLiquidity(uint256 needed, uint256 available);
    error NotBorrower();
    error NothingDue();
    error NotLiquidatable(uint256 loanId, uint64 liquidatableAt);

    constructor(
        address initialOwner,
        IERC20 _stablecoin,
        WarehouseReceipt _receipts,
        WorldIdRegistry _worldIdRegistry,
        address _liquidationTreasury
    ) Ownable(initialOwner) {
        stablecoin = _stablecoin;
        receipts = _receipts;
        worldIdRegistry = _worldIdRegistry;
        liquidationTreasury = _liquidationTreasury;
    }

    modifier onlyForwarder() {
        if (msg.sender != creForwarder) revert NotForwarder();
        _;
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setCreForwarder(address forwarder, address owner_) external onlyOwner {
        creForwarder = forwarder;
        workflowOwner = owner_;
        emit CreForwarderUpdated(forwarder, owner_);
    }

    function setGracePeriod(uint64 newGracePeriod) external onlyOwner {
        gracePeriod = newGracePeriod;
    }

    function setLiquidationTreasury(address treasury) external onlyOwner {
        liquidationTreasury = treasury;
    }

    /// @notice Seed the lending pool with gUSDC.
    function fund(uint256 amount) external {
        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ------------------------------------------------------------------
    // 1. Request - escrow collateral, ask the TEE
    // ------------------------------------------------------------------

    /// @notice Pledge a receipt and open a loan request for the confidential workflow.
    /// @dev The farmer's private risk inputs are never passed here. They go straight to the
    ///      CRE secrets/TEE payload off-chain; only `loanId` ties the two together.
    function requestLoan(uint256 receiptId) external nonReentrant returns (uint256 loanId) {
        if (!worldIdRegistry.isVerified(msg.sender)) revert NotVerified(msg.sender);
        if (receipts.ownerOf(receiptId) != msg.sender) revert NotReceiptOwner();
        if (activeLoanOfReceipt[receiptId] != 0) revert ReceiptAlreadyPledged(receiptId);

        uint256 collateralValue = receipts.appraisedValueOf(receiptId);
        loanId = nextLoanId++;

        _loans[loanId] = Loan({
            borrower: msg.sender,
            receiptId: receiptId,
            collateralValue: collateralValue,
            principal: 0,
            totalOwed: 0,
            repaid: 0,
            installmentAmount: 0,
            startedAt: 0,
            installmentPeriod: 0,
            aprBps: 0,
            ltvBps: 0,
            riskScore: 0,
            installmentCount: 0,
            installmentsPaid: 0,
            privateInputCommitment: bytes32(0),
            status: Status.Requested
        });
        activeLoanOfReceipt[receiptId] = loanId;

        receipts.safeTransferFrom(msg.sender, address(this), receiptId);
        receipts.setTokenFrozen(receiptId, true);

        emit LoanRequested(loanId, msg.sender, receiptId, collateralValue);
    }

    // ------------------------------------------------------------------
    // 2. CRE Confidential Workflow callback
    // ------------------------------------------------------------------

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override onlyForwarder {
        if (workflowOwner != address(0) && _workflowOwnerFrom(metadata) != workflowOwner) revert NotWorkflowOwner();
        RiskAssessment memory a = abi.decode(report, (RiskAssessment));
        _applyAssessment(a);
    }

    function _applyAssessment(RiskAssessment memory a) internal {
        Loan storage loan = _loans[a.loanId];
        if (loan.status != Status.Requested) revert BadStatus(a.loanId, loan.status);

        loan.riskScore = a.riskScore;
        loan.privateInputCommitment = a.privateInputCommitment;

        if (!a.approved || a.approvedPrincipal == 0) {
            loan.status = Status.Rejected;
            activeLoanOfReceipt[loan.receiptId] = 0;
            emit LoanRejected(a.loanId, a.riskScore);
            _releaseCollateral(a.loanId, loan.receiptId, loan.borrower);
            return;
        }

        // The TEE may underwrite ABOVE bare collateral value, but never above the LTV band
        // it certified for this borrower. 250% is the hard protocol ceiling.
        uint256 cap = (loan.collateralValue * a.ltvBps) / 10_000;
        if (a.approvedPrincipal > cap || a.ltvBps > 25_000) {
            revert ExceedsCollateralCap(a.approvedPrincipal, cap);
        }

        uint256 available = stablecoin.balanceOf(address(this));
        if (available < a.approvedPrincipal) revert InsufficientLiquidity(a.approvedPrincipal, available);

        uint64 term = a.installmentPeriod * a.installmentCount;
        uint256 interest = (a.approvedPrincipal * a.aprBps * term) / (10_000 * 365 days);
        uint256 totalOwed = a.approvedPrincipal + interest;

        loan.principal = a.approvedPrincipal;
        loan.totalOwed = totalOwed;
        loan.aprBps = a.aprBps;
        loan.ltvBps = a.ltvBps;
        loan.installmentCount = a.installmentCount;
        loan.installmentPeriod = a.installmentPeriod;
        loan.installmentAmount = totalOwed / a.installmentCount;
        loan.startedAt = uint64(block.timestamp);
        loan.status = Status.Active;

        stablecoin.safeTransfer(loan.borrower, a.approvedPrincipal);

        emit LoanApproved(a.loanId, a.approvedPrincipal, a.aprBps, a.ltvBps, a.riskScore, totalOwed);
    }

    /// @dev CRE forwarder metadata layout: [32B workflowId][10B workflowName][20B workflowOwner][2B reportId].
    function _workflowOwnerFrom(bytes calldata metadata) internal pure returns (address owner_) {
        if (metadata.length < 62) return address(0);
        owner_ = address(bytes20(metadata[42:62]));
    }

    // ------------------------------------------------------------------
    // 3. Repayment
    // ------------------------------------------------------------------

    function amountDue(uint256 loanId) public view returns (uint256) {
        Loan storage loan = _loans[loanId];
        if (loan.status != Status.Active) return 0;
        uint256 remaining = loan.totalOwed - loan.repaid;
        return loan.installmentAmount < remaining ? loan.installmentAmount : remaining;
    }

    function nextDueDate(uint256 loanId) public view returns (uint64) {
        Loan storage loan = _loans[loanId];
        if (loan.status != Status.Active) return 0;
        return loan.startedAt + (uint64(loan.installmentsPaid) + 1) * loan.installmentPeriod;
    }

    /// @notice Pay the next installment (or the remaining balance, whichever is smaller).
    function repayInstallment(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.status != Status.Active) revert BadStatus(loanId, loan.status);
        uint256 due = amountDue(loanId);
        if (due == 0) revert NothingDue();

        stablecoin.safeTransferFrom(msg.sender, address(this), due);
        loan.repaid += due;
        loan.installmentsPaid += 1;

        emit InstallmentPaid(loanId, loan.installmentsPaid, due, loan.totalOwed - loan.repaid);

        if (loan.repaid >= loan.totalOwed) _settle(loanId, loan);
    }

    /// @notice Pay everything outstanding at once.
    function repayFull(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.status != Status.Active) revert BadStatus(loanId, loan.status);
        uint256 remaining = loan.totalOwed - loan.repaid;
        if (remaining == 0) revert NothingDue();

        stablecoin.safeTransferFrom(msg.sender, address(this), remaining);
        loan.repaid = loan.totalOwed;
        loan.installmentsPaid = loan.installmentCount;

        emit InstallmentPaid(loanId, loan.installmentCount, remaining, 0);
        _settle(loanId, loan);
    }

    function _settle(uint256 loanId, Loan storage loan) internal {
        loan.status = Status.Repaid;
        activeLoanOfReceipt[loan.receiptId] = 0;
        emit LoanRepaid(loanId, loan.repaid);
        _releaseCollateral(loanId, loan.receiptId, loan.borrower);
    }

    function _releaseCollateral(uint256 loanId, uint256 receiptId, address to) internal {
        receipts.setTokenFrozen(receiptId, false);
        receipts.safeTransferFrom(address(this), to, receiptId);
        emit CollateralReleased(loanId, receiptId, to);
    }

    // ------------------------------------------------------------------
    // 4. Liquidation
    // ------------------------------------------------------------------

    function isLiquidatable(uint256 loanId) public view returns (bool) {
        Loan storage loan = _loans[loanId];
        if (loan.status != Status.Active) return false;
        return block.timestamp > nextDueDate(loanId) + gracePeriod;
    }

    /// @notice Permissionless default handling: seize the tokenized receipt via the ATS
    ///         controller path and hand it to the liquidation treasury for auction.
    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.status != Status.Active) revert BadStatus(loanId, loan.status);
        uint64 liquidatableAt = nextDueDate(loanId) + gracePeriod;
        if (block.timestamp <= liquidatableAt) revert NotLiquidatable(loanId, liquidatableAt);

        loan.status = Status.Liquidated;
        activeLoanOfReceipt[loan.receiptId] = 0;

        uint256 shortfall = loan.totalOwed - loan.repaid;

        // Controller transfer bypasses the freeze and the borrower's consent, exactly as an
        // ATS issuer would force-transfer a defaulted security.
        receipts.forcedTransfer(loan.receiptId, liquidationTreasury, "GODAAM_DEFAULT_LIQUIDATION");
        receipts.setTokenFrozen(loan.receiptId, false);

        emit LoanLiquidated(loanId, loan.receiptId, msg.sender, shortfall);
    }

    /// @notice Post-seizure redemption of an unsellable/expired receipt (ATS controllerRedeem).
    function burnSeizedReceipt(uint256 receiptId, string calldata reason) external onlyOwner {
        receipts.controllerRedeem(receiptId, reason);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return _loans[loanId];
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
