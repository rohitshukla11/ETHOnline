/**
 * Pre-deploy sanity check: are the deployer and attestor accounts reachable over
 * the configured RPC, and funded?
 *
 * Usage: npm run check:balances
 *
 * A failure here is more often the Hashio relay than the config - retry once
 * before debugging. Hashio rate-limits aggressively.
 */
import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const provider = ethers.provider;
  const net = await provider.getNetwork();
  console.log(`network   ${network.name}  chainId=${net.chainId}`);
  console.log(`rpc       ${process.env.HEDERA_TESTNET_RPC ?? "(hardhat default)"}`);
  console.log(`block     ${await provider.getBlockNumber()}`);
  console.log("");

  const accounts: { label: string; address: string; accountId: string }[] = [
    {
      label: "deployer",
      address: new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!).address,
      accountId: process.env.HEDERA_OPERATOR_ID ?? "-",
    },
    {
      label: "attestor",
      address: process.env.WORLD_ATTESTOR_ADDRESS!,
      accountId: "-",
    },
  ];

  let allFunded = true;
  for (const a of accounts) {
    const wei = await provider.getBalance(a.address);
    const hbar = Number(ethers.formatEther(wei));
    const funded = wei > 0n;
    allFunded &&= funded;
    console.log(
      `${a.label.padEnd(9)} ${a.address}  ${hbar.toFixed(4).padStart(12)} HBAR  ` +
        `${funded ? "funded" : "EMPTY - fund at portal.hedera.com"}`
    );
  }

  // The signer hardhat will actually deploy with must be the deployer key.
  const [signer] = await ethers.getSigners();
  const expected = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!).address;
  const signerOk = signer.address.toLowerCase() === expected.toLowerCase();
  console.log("");
  console.log(`hardhat signer  ${signer.address}`);
  console.log(`matches DEPLOYER_PRIVATE_KEY?  ${signerOk}`);

  if (!allFunded || !signerOk) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.shortMessage ?? e.message);
  process.exitCode = 1;
});
