/**
 * Fast-forwards a live loan past its grace period is impossible on a real network, so this
 * script deploys a short-cycle loan (grace period = 60s, installment = 60s) on Hedera
 * testnet and liquidates it for the demo video.
 *
 * Usage: npx hardhat run scripts/demo-liquidation.ts --network hederaTestnet
 */
import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const USDC = (n: number) => BigInt(n) * 10n ** 6n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const d = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "deployments", `${network.name}.json`), "utf8")
  );
  const [admin, maybeFarmer] = await ethers.getSigners();
  const farmer = maybeFarmer ?? admin;

  const registry = await ethers.getContractAt("WorldIdRegistry", d.WorldIdRegistry);
  const receipts = await ethers.getContractAt("WarehouseReceipt", d.WarehouseReceipt);
  const vault = await ethers.getContractAt("GodaamVault", d.GodaamVault);
  const forwarder = await ethers.getContractAt("MockCreForwarder", d.CreForwarder);

  console.log("Setting grace period to 60s for the demo...");
  await (await vault.setGracePeriod(60)).wait();

  if (!(await registry.isVerified(farmer.address))) {
    await (
      await registry.attestVerification(
        farmer.address,
        BigInt(ethers.keccak256(ethers.toUtf8Bytes(`selfie:${farmer.address}`)))
      )
    ).wait();
  }
  if (!(await receipts.kycGranted(farmer.address))) {
    await (await receipts.grantKyc(farmer.address)).wait();
  }

  const rc = await (
    await receipts.issue(farmer.address, {
      cropType: "Soybean",
      grade: "FAQ-B",
      quantityKg: 18_000,
      storageLocation: "WDRA Warehouse, Indore, MP",
      expiry: Math.floor(Date.now() / 1000) + 90 * 24 * 3600,
      appraisedValue: USDC(200),
      atsTokenAddress: ethers.ZeroAddress,
      atsTokenId: process.env.ATS_TOKEN_ID || "0.0.0",
    })
  ).wait();
  // Match the ReceiptIssued topic, not the topic count - the ERC-721 Transfer
  // emitted alongside it also has 4 topics and would yield `from` instead.
  const issuedTopic = receipts.interface.getEvent("ReceiptIssued")!.topicHash;
  const receiptId = receipts.interface.parseLog(
    rc!.logs.find((l) => l.address === d.WarehouseReceipt && l.topics[0] === issuedTopic)!
  )!.args[0] as bigint;
  console.log(`Issued receipt #${receiptId}`);

  // requestLoan pulls the receipt with safeTransferFrom, so the vault needs approval.
  await (await receipts.connect(farmer).setApprovalForAll(d.GodaamVault, true)).wait();
  const reqRc = await (await vault.connect(farmer).requestLoan(receiptId)).wait();
  const loanId = vault.interface.parseLog(
    reqRc!.logs.find((l) => l.address === d.GodaamVault)!
  )!.args[0] as bigint;
  console.log(`Loan #${loanId} requested`);

  const report = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint256,bool,uint256,uint16,uint16,uint16,uint8,uint64,bytes32)"],
    [
      [
        loanId,
        true,
        USDC(240),
        1900,
        12_000,
        455,
        3,
        60n, // 60s installments
        ethers.keccak256(ethers.toUtf8Bytes("tee-input-commitment")),
      ],
    ]
  );
  const metadata = await forwarder.buildMetadata(
    ethers.id("godaam-risk-scoring"),
    ethers.hexlify(ethers.toUtf8Bytes("godaam-ris")),
    process.env.CRE_WORKFLOW_OWNER || ethers.ZeroAddress,
    "0x0001"
  );
  await (await forwarder.forward(d.GodaamVault, metadata, report)).wait();
  console.log(`Disbursed 240 gUSDC. Borrower now goes silent...`);

  console.log(`Next due: ${new Date(Number(await vault.nextDueDate(loanId)) * 1000).toISOString()}`);
  console.log("Waiting for default + grace window (~130s)...");
  for (let i = 0; i < 14; i++) {
    await sleep(10_000);
    const ok = await vault.isLiquidatable(loanId);
    console.log(`  t+${(i + 1) * 10}s liquidatable=${ok}`);
    if (ok) break;
  }

  console.log("Liquidating (called by a third party, not the lender)...");
  const liqRc = await (await vault.liquidate(loanId)).wait();
  console.log(`Liquidated. tx=${liqRc!.hash}`);
  console.log(`Receipt #${receiptId} now owned by ${await receipts.ownerOf(receiptId)}`);
  console.log(`HashScan: https://hashscan.io/testnet/transaction/${liqRc!.hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
