// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet-only USDC stand-in (6 decimals) with an open faucet.
contract MockUSDC is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 5_000e6;

    mapping(address => uint256) public lastFaucetClaim;

    error FaucetCooldown(uint256 availableAt);

    constructor(address initialOwner) ERC20("Godaam USD", "gUSDC") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Anyone on testnet can top up once per day.
    function faucet() external {
        uint256 availableAt = lastFaucetClaim[msg.sender] + 1 days;
        if (lastFaucetClaim[msg.sender] != 0 && block.timestamp < availableAt) {
            revert FaucetCooldown(availableAt);
        }
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
