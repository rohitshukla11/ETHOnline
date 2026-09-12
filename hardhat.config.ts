import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const deployer = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    hederaTestnet: {
      url: process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: deployer ? [deployer] : [],
      // Hashio relay rejects EIP-1559 gas estimation on some calls
      gas: 3_000_000,
    },
  },
  etherscan: {
    // HashScan verification via the Sourcify-compatible endpoint
    apiKey: { hederaTestnet: "no-api-key-needed" },
    customChains: [
      {
        network: "hederaTestnet",
        chainId: 296,
        urls: {
          apiURL: "https://server-verify.hashscan.io",
          browserURL: "https://hashscan.io/testnet",
        },
      },
    ],
  },
  sourcify: { enabled: true },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./.hardhat/cache",
    artifacts: "./.hardhat/artifacts",
  },
};

export default config;
