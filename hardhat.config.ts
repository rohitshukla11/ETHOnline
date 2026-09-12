import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

const deployer = process.env.DEPLOYER_PRIVATE_KEY;
// Declared in .env.example; read here so the two cannot drift apart.
const hederaChainId = Number(process.env.HEDERA_CHAIN_ID ?? 296);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    hederaTestnet: {
      url: process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api",
      chainId: hederaChainId,
      accounts: deployer ? [deployer] : [],
      // Hashio relay rejects EIP-1559 gas estimation on some calls
      gas: 3_000_000,
    },
  },
  // No `etherscan` block: HashScan's in-app form is disabled and the legacy
  // verify.hashscan.io / server-verify.hashscan.io endpoints are deprecated
  // forwarders. Verification goes to Sourcify, which supports Hedera testnet
  // (chain 296) natively; HashScan reads the status from Sourcify.
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./.hardhat/cache",
    artifacts: "./.hardhat/artifacts",
  },
};

export default config;
