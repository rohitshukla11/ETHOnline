// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title WorldIdRegistry
/// @notice Onchain record of World ID Selfie Check verifications for Godaam farmers.
/// @dev The zero-knowledge proof itself is verified off-chain against the World
///      Developer Portal `/api/v2/verify` endpoint, because the World ID Router is not
///      deployed on Hedera. The backend attestor submits only the nullifier hash, which
///      is what actually enforces one-human-one-account here.
contract WorldIdRegistry is Ownable {
    struct Verification {
        uint256 nullifierHash;
        uint64 verifiedAt;
        bool revoked;
    }

    /// @notice Signer allowed to attest verifications (the Next.js server route).
    address public attestor;

    mapping(address account => Verification) private _verifications;
    mapping(uint256 nullifierHash => address account) public nullifierOwner;

    event AttestorUpdated(address indexed attestor);
    event FarmerVerified(address indexed account, uint256 indexed nullifierHash, uint64 verifiedAt);
    event FarmerRevoked(address indexed account, uint256 indexed nullifierHash);

    error NotAttestor();
    error AlreadyVerified(address account);
    error NullifierAlreadyUsed(uint256 nullifierHash, address owner);
    error NotVerified(address account);

    constructor(address initialOwner, address initialAttestor) Ownable(initialOwner) {
        attestor = initialAttestor;
        emit AttestorUpdated(initialAttestor);
    }

    modifier onlyAttestor() {
        if (msg.sender != attestor && msg.sender != owner()) revert NotAttestor();
        _;
    }

    function setAttestor(address newAttestor) external onlyOwner {
        attestor = newAttestor;
        emit AttestorUpdated(newAttestor);
    }

    /// @notice Record a successful Selfie Check for `account`.
    function attestVerification(address account, uint256 nullifierHash) external onlyAttestor {
        if (_verifications[account].nullifierHash != 0 && !_verifications[account].revoked) {
            revert AlreadyVerified(account);
        }
        address existing = nullifierOwner[nullifierHash];
        if (existing != address(0) && existing != account) {
            revert NullifierAlreadyUsed(nullifierHash, existing);
        }

        _verifications[account] =
            Verification({nullifierHash: nullifierHash, verifiedAt: uint64(block.timestamp), revoked: false});
        nullifierOwner[nullifierHash] = account;

        emit FarmerVerified(account, nullifierHash, uint64(block.timestamp));
    }

    /// @notice Compliance escape hatch: revoke a verification (e.g. fraud report).
    function revokeVerification(address account) external onlyOwner {
        Verification storage v = _verifications[account];
        if (v.nullifierHash == 0) revert NotVerified(account);
        v.revoked = true;
        emit FarmerRevoked(account, v.nullifierHash);
    }

    function isVerified(address account) public view returns (bool) {
        Verification storage v = _verifications[account];
        return v.nullifierHash != 0 && !v.revoked;
    }

    function verificationOf(address account) external view returns (Verification memory) {
        return _verifications[account];
    }
}
