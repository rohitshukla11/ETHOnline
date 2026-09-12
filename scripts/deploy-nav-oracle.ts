/**
 * Deploys CollateralNavOracle against a live Chainlink feed on Hedera testnet, then
 * exercises both the fresh and the stale path on the deployed contract.
 *
 * Usage: npm run deploy:nav
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

/** Chainlink HBAR/USD on Hedera testnet. */
const HBAR_USD = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";

const SOURCE = ["None", "Appraisal", "ChainlinkFeed"];

function show(nav: any) {
  const dec = Number(nav.referenceDecimals);
  console.log(`    navUsd6              ${nav.navUsd6}  (= $${Number(nav.navUsd6) / 1e6})`);
  console.log(`    appraisalUsdPerTonne ${nav.appraisalUsdPerTonne}  (= $${Number(nav.appraisalUsdPerTonne) / 1e6}/tonne)`);
  console.log(`    quantityKg           ${nav.quantityKg}`);
  console.log(`    referenceAnswer      ${nav.referenceAnswer}${dec ? `  (= ${Number(nav.referenceAnswer) / 10 ** dec})` : ""}`);
  console.log(`    referenceDecimals    ${dec}`);
  console.log(`    referenceUpdatedAt   ${nav.referenceUpdatedAt}${Number(nav.referenceUpdatedAt) ? `  (${Math.floor((Date.now() / 1000 - Number(nav.referenceUpdatedAt)) / 60)} min ago)` : ""}`);
  console.log(`    cropSource           ${SOURCE[Number(nav.cropSource)]}`);
  console.log(`    referenceSource      ${SOURCE[Number(nav.referenceSource)]}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`deploying as ${deployer.address}`);
  console.log(`feed         ${HBAR_USD} (Chainlink HBAR/USD, Hedera testnet)\n`);

  const oracle: any = await (
    await ethers.deployContract("CollateralNavOracle", [deployer.address, HBAR_USD])
  ).waitForDeployment();
  const addr = await oracle.getAddress();
  const deployTx = oracle.deploymentTransaction();
  console.log(`CollateralNavOracle  ${addr}`);
  console.log(`deploy tx            ${deployTx?.hash}\n`);

  // Receipt #1: 42,000 kg of wheat. $273/tonne is the operator's appraisal, not a feed.
  await (await oracle.setAppraisal(1n, 273_000_000n, 42_000n)).wait();
  console.log(`appraisal set: receipt #1, $273/tonne, 42000 kg\n`);

  console.log(`--- A. fresh feed (maxAnswerAge = ${await oracle.maxAnswerAge()}s) ---`);
  show(await oracle.navOf(1n));

  // Force the live answer to read stale without touching the feed.
  console.log(`\n--- B. same feed, maxAnswerAge lowered to 60s ---`);
  await (await oracle.setMaxAnswerAge(60n)).wait();
  show(await oracle.navOf(1n));

  await (await oracle.setMaxAnswerAge(10800n)).wait();
  console.log(`\nmaxAnswerAge restored to ${await oracle.maxAnswerAge()}s`);
  console.log(`\nconstructor args for verify: ${deployer.address} ${HBAR_USD}`);
}

main().catch((e) => {
  console.error(e.shortMessage ?? e.message);
  process.exitCode = 1;
});
