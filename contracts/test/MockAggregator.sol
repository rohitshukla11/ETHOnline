// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only Chainlink aggregator stub. Never deployed to a live network.
contract MockAggregator {
    int256 public a;
    uint8 public d;
    uint256 public u;

    constructor(int256 _a, uint8 _d) {
        a = _a;
        d = _d;
        u = block.timestamp;
    }

    function setAnswer(int256 _a) external {
        a = _a;
        u = block.timestamp;
    }

    function setUpdatedAt(uint256 _u) external {
        u = _u;
    }

    function decimals() external view returns (uint8) {
        return d;
    }

    function description() external pure returns (string memory) {
        return "MOCK / USD";
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, a, u, u, 1);
    }
}
