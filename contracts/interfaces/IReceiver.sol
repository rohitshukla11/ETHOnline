// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Chainlink CRE forwarder callback interface.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
