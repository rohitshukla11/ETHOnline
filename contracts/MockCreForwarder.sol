// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GodaamVault} from "./GodaamVault.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @notice Local stand-in for the Chainlink CRE forwarder, used by tests and by
///         `scripts/simulate-cre-report.ts` so the TEE output path is demoable end-to-end
///         before the workflow is promoted to a live CRE deployment.
contract MockCreForwarder {
    event ReportForwarded(address indexed receiver, bytes metadata, bytes report);

    function forward(address receiver, bytes calldata metadata, bytes calldata report) external {
        IReceiver(receiver).onReport(metadata, report);
        emit ReportForwarded(receiver, metadata, report);
    }

    /// @dev Builds forwarder metadata in the CRE layout the vault parses.
    function buildMetadata(bytes32 workflowId, bytes10 workflowName, address workflowOwner, bytes2 reportId)
        external
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(workflowId, workflowName, workflowOwner, reportId);
    }
}
