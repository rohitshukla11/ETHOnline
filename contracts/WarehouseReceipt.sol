// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WorldIdRegistry} from "./WorldIdRegistry.sol";

/// @title WarehouseReceipt
/// @notice EVM-side compliance mirror of the Hedera Asset Tokenization Studio (ATS)
///         security token that represents a certified warehouse receipt.
/// @dev Mirrors the ATS control surface (KYC grant, freeze, controller/forced transfer,
///      controller redeem) so the lending vault can enforce the same compliance rules
///      atomically inside a transaction. `atsTokenAddress` links each receipt back to the
///      real ATS-issued asset on Hedera.
contract WarehouseReceipt is ERC721, AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");

    struct ReceiptData {
        string cropType;
        string grade;
        uint256 quantityKg;
        string storageLocation;
        uint64 expiry;
        uint256 appraisedValue; // 6 decimals, same unit as gUSDC
        address atsTokenAddress; // ATS security token deployed via the SDK
        string atsTokenId; // Hedera entity id, e.g. 0.0.1234567
    }

    uint256 private _nextId = 1;

    mapping(uint256 tokenId => ReceiptData) private _receipts;
    mapping(address account => bool) public kycGranted;
    mapping(address account => bool) public accountFrozen;
    mapping(uint256 tokenId => bool) public tokenFrozen;

    WorldIdRegistry public immutable worldIdRegistry;

    event ReceiptIssued(uint256 indexed tokenId, address indexed to, string atsTokenId, uint256 appraisedValue);
    event KycGranted(address indexed account, uint256 nullifierHash);
    event KycRevoked(address indexed account);
    event AccountFreezeChanged(address indexed account, bool frozen);
    event TokenFreezeChanged(uint256 indexed tokenId, bool frozen);
    event ForcedTransfer(uint256 indexed tokenId, address indexed from, address indexed to, string reason);
    event ControllerRedeemed(uint256 indexed tokenId, address indexed from, string reason);

    error WorldIdVerificationRequired(address account);
    error KycRequired(address account);
    error AccountIsFrozen(address account);
    error TokenIsFrozen(uint256 tokenId);
    error ReceiptExpired(uint256 tokenId);

    constructor(address admin, WorldIdRegistry registry) ERC721("Godaam Warehouse Receipt", "GWR") {
        worldIdRegistry = registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
        _grantRole(CONTROLLER_ROLE, admin);
    }

    // ------------------------------------------------------------------
    // Compliance controls (ATS parity)
    // ------------------------------------------------------------------

    /// @notice Grant KYC. Only possible for an address that passed World ID Selfie Check.
    /// @dev This is the hard link between the World track and the Hedera track: no Selfie
    ///      Check means no KYC grant, which means no receipt can ever be minted or received.
    function grantKyc(address account) external onlyRole(ISSUER_ROLE) {
        if (!worldIdRegistry.isVerified(account)) revert WorldIdVerificationRequired(account);
        kycGranted[account] = true;
        emit KycGranted(account, worldIdRegistry.verificationOf(account).nullifierHash);
    }

    function revokeKyc(address account) external onlyRole(CONTROLLER_ROLE) {
        kycGranted[account] = false;
        emit KycRevoked(account);
    }

    function setAccountFrozen(address account, bool frozen) external onlyRole(CONTROLLER_ROLE) {
        accountFrozen[account] = frozen;
        emit AccountFreezeChanged(account, frozen);
    }

    function setTokenFrozen(uint256 tokenId, bool frozen) external onlyRole(CONTROLLER_ROLE) {
        tokenFrozen[tokenId] = frozen;
        emit TokenFreezeChanged(tokenId, frozen);
    }

    // ------------------------------------------------------------------
    // Issuance & lifecycle
    // ------------------------------------------------------------------

    function issue(address to, ReceiptData calldata data) external onlyRole(ISSUER_ROLE) returns (uint256 tokenId) {
        if (!worldIdRegistry.isVerified(to)) revert WorldIdVerificationRequired(to);
        tokenId = _nextId++;
        _receipts[tokenId] = data;
        _safeMint(to, tokenId);
        emit ReceiptIssued(tokenId, to, data.atsTokenId, data.appraisedValue);
    }

    /// @notice ATS `controllerTransfer` equivalent - bypasses freezes, used for liquidation.
    function forcedTransfer(uint256 tokenId, address to, string calldata reason)
        external
        onlyRole(CONTROLLER_ROLE)
    {
        address from = ownerOf(tokenId);
        _forced = true;
        _transfer(from, to, tokenId);
        _forced = false;
        emit ForcedTransfer(tokenId, from, to, reason);
    }

    /// @notice ATS `controllerRedeem` equivalent - burns a defaulted or expired receipt.
    function controllerRedeem(uint256 tokenId, string calldata reason) external onlyRole(CONTROLLER_ROLE) {
        address from = ownerOf(tokenId);
        _forced = true;
        _burn(tokenId);
        _forced = false;
        emit ControllerRedeemed(tokenId, from, reason);
    }

    function receiptOf(uint256 tokenId) external view returns (ReceiptData memory) {
        _requireOwned(tokenId);
        return _receipts[tokenId];
    }

    function appraisedValueOf(uint256 tokenId) external view returns (uint256) {
        return _receipts[tokenId].appraisedValue;
    }

    // ------------------------------------------------------------------
    // Transfer restrictions
    // ------------------------------------------------------------------

    bool private _forced;

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);

        if (_forced) return from;

        // Burn
        if (to == address(0)) return from;

        if (from != address(0)) {
            if (accountFrozen[from]) revert AccountIsFrozen(from);
            if (tokenFrozen[tokenId]) revert TokenIsFrozen(tokenId);
        }
        if (accountFrozen[to]) revert AccountIsFrozen(to);

        // The vault holds collateral and is exempt from the KYC whitelist.
        if (!hasRole(CONTROLLER_ROLE, to) && !kycGranted[to]) revert KycRequired(to);

        if (_receipts[tokenId].expiry != 0 && block.timestamp > _receipts[tokenId].expiry) {
            revert ReceiptExpired(tokenId);
        }
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
