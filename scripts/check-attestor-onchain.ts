/**
 * Step 7: run the two calls that reverted with AccessControlUnauthorizedAccount in
 * the original audit, signed by the ATTESTOR key, against a real chain.
 *
 * These are exactly the calls the server routes make:
 *   /api/worldid/verify  -> registry.attestVerification + receipts.grantKyc
 *   /api/receipts/issue  -> receipts.issue
 *
 * The routes themselves cannot be driven end-to-end yet because
 * NEXT_PUBLIC_WORLD_APP_ID is blank, so World's /api/v2/verify rejects before the
 * onchain leg is reached. The role separation is what is under test here.
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};

async function main() {
  const provider = ethers.provider;
  const attestor = new ethers.Wallet(need("WORLD_ATTESTOR_PRIVATE_KEY"), provider);
  const farmer = new ethers.Wallet(need("DEPLOYER_PRIVATE_KEY")).address;

  console.log(`signing as attestor ${attestor.address}`);
  console.log(`farmer (subject)    ${farmer}\n`);

  const registry: any = (await ethers.getContractAt(
    "WorldIdRegistry",
    need("NEXT_PUBLIC_WORLD_ID_REGISTRY")
  )).connect(attestor);
  const receipts: any = (await ethers.getContractAt(
    "WarehouseReceipt",
    need("NEXT_PUBLIC_WAREHOUSE_RECEIPT")
  )).connect(attestor);

  // --- 1. attestVerification (registry attestor role) ---
  if (!(await registry.isVerified(farmer))) {
    const nullifier = BigInt(ethers.keccak256(ethers.toUtf8Bytes(`selfie:${farmer}`)));
    const tx = await registry.attestVerification(farmer, nullifier);
    const rc = await tx.wait();
    console.log(`attestVerification  OK   tx=${rc.hash}`);
  } else {
    console.log(`attestVerification  (already verified, skipped)`);
  }

  // --- 2. grantKyc (ISSUER_ROLE) -- reverted in the audit ---
  if (!(await receipts.kycGranted(farmer))) {
    const tx = await receipts.grantKyc(farmer);
    const rc = await tx.wait();
    console.log(`grantKyc            OK   tx=${rc.hash}`);
  } else {
    console.log(`grantKyc            (already granted, skipped)`);
  }

  // --- 3. issue (ISSUER_ROLE) -- reverted in the audit ---
  const tx = await receipts.issue(farmer, {
    cropType: "Wheat (HD-2967)",
    grade: "FAQ-A",
    quantityKg: 42_000,
    storageLocation: "WDRA Warehouse, Baramati, MH",
    expiry: Math.floor(Date.now() / 1000) + 180 * 24 * 3600,
    appraisedValue: 400n * 10n ** 6n,
    atsTokenAddress: process.env.ATS_TOKEN_EVM_ADDRESS || ethers.ZeroAddress,
    atsTokenId: process.env.ATS_TOKEN_ID || "0.0.0",
  });
  const rc = await tx.wait();
  const topic = receipts.interface.getEvent("ReceiptIssued").topicHash;
  const log = rc.logs.find((l: any) => l.topics[0] === topic);
  const tokenId = log ? receipts.interface.parseLog(log).args[0] : "?";
  console.log(`issue               OK   tx=${rc.hash}`);
  console.log(`                    receipt #${tokenId} -> ${await receipts.ownerOf(tokenId)}`);

  console.log(`\nverified=${await registry.isVerified(farmer)} kyc=${await receipts.kycGranted(farmer)}`);
}

main().catch((e) => {
  console.error("FAILED:", e.shortMessage ?? e.message);
  process.exitCode = 1;
});
