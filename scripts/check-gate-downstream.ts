/**
 * Step 4: prove the gate is load-bearing on a LIVE chain.
 *
 * "No verification -> no collateral -> no loan."
 *
 * Uses raw eth_call with a `from` override via provider.call(), NOT
 * contract.fn.staticCall({ from }). The latter routes through hardhat's signer
 * management, which rejects an unknown `from` with "transaction from mismatch"
 * before the call ever reaches the node - a revert that looks like the gate
 * holding but proves nothing about the contract.
 */
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing ${k}`); return v; };

/** Decode a custom error selector against a contract's ABI. */
function decodeRevert(iface: ethers.Interface, data: string): string {
  if (!data || data === "0x") return "(empty revert data)";
  try {
    const e = iface.parseError(data);
    if (e) return `${e.name}(${e.args.map(String).join(", ")})`;
  } catch { /* fall through */ }
  try { return `Error("${ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10))[0]}")`; }
  catch { return `unknown revert data ${data.slice(0, 26)}...`; }
}

async function expectRevert(
  label: string, iface: ethers.Interface,
  tx: { to: string; data: string; from: string }
): Promise<boolean> {
  try {
    const out = await ethers.provider.call(tx);
    console.log(`  ${label.padEnd(32)} !! RETURNED ${out.slice(0, 20)} - GATE NOT HOLDING`);
    return false;
  } catch (e: any) {
    const data = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    const decoded = typeof data === "string" ? decodeRevert(iface, data) : (e.shortMessage ?? e.message);
    console.log(`  ${label.padEnd(32)} REVERTED  ${decoded}`);
    return true;
  }
}

async function main() {
  const registry: any = await ethers.getContractAt("WorldIdRegistry", need("NEXT_PUBLIC_WORLD_ID_REGISTRY"));
  const receipts: any = await ethers.getContractAt("WarehouseReceipt", need("NEXT_PUBLIC_WAREHOUSE_RECEIPT"));
  const vault: any = await ethers.getContractAt("GodaamVault", need("NEXT_PUBLIC_GODAAM_VAULT"));
  const attestor = need("WORLD_ATTESTOR_ADDRESS");
  const receiptsAddr = await receipts.getAddress();
  const vaultAddr = await vault.getAddress();

  const unverified = ethers.Wallet.createRandom().address;
  console.log(`unverified address  ${unverified}`);
  console.log(`isVerified()        ${await registry.isVerified(unverified)}`);
  console.log(`kycGranted()        ${await receipts.kycGranted(unverified)}\n`);

  const ok: boolean[] = [];

  ok.push(await expectRevert("1. grantKyc", receipts.interface, {
    to: receiptsAddr, from: attestor,
    data: receipts.interface.encodeFunctionData("grantKyc", [unverified]),
  }));

  ok.push(await expectRevert("2. issue receipt", receipts.interface, {
    to: receiptsAddr, from: attestor,
    data: receipts.interface.encodeFunctionData("issue", [unverified, {
      cropType: "Wheat", grade: "FAQ-A", quantityKg: 42_000,
      storageLocation: "WDRA Warehouse, Baramati, MH",
      expiry: Math.floor(Date.now() / 1000) + 180 * 24 * 3600,
      appraisedValue: 400n * 10n ** 6n,
      atsTokenAddress: ethers.ZeroAddress, atsTokenId: "0.0.0",
    }]),
  }));

  // A brand-new address has no Hedera account, and Hashio rejects the call with
  // "Sender account not found" before it reaches the contract. Use the attestor: it
  // is a funded, existing Hedera account that was never attested in the registry.
  const existingUnverified = attestor;
  console.log(`\n   (requestLoan sender: ${existingUnverified}, isVerified=${await registry.isVerified(existingUnverified)})`);
  ok.push(await expectRevert("3. requestLoan", vault.interface, {
    to: vaultAddr, from: existingUnverified,
    data: vault.interface.encodeFunctionData("requestLoan", [1n]),
  }));

  // Control: the same call from a VERIFIED address must NOT revert with a gate error,
  // otherwise the three reverts above might be caused by something unrelated.
  const verified = new ethers.Wallet(need("DEPLOYER_PRIVATE_KEY")).address;
  console.log(`\ncontrol - already-verified address ${verified}`);
  console.log(`  isVerified()  ${await registry.isVerified(verified)}`);
  try {
    await ethers.provider.call({
      to: receiptsAddr, from: attestor,
      data: receipts.interface.encodeFunctionData("grantKyc", [verified]),
    });
    console.log(`  grantKyc                         OK - gate opens for a verified address`);
  } catch (e: any) {
    const d = e?.data ?? e?.info?.error?.data;
    console.log(`  grantKyc                         reverted: ${typeof d === "string" ? decodeRevert(receipts.interface, d) : e.shortMessage}`);
  }

  console.log(`\nall three refused: ${ok.every(Boolean)}`);
  if (!ok.every(Boolean)) process.exitCode = 1;
}

main().catch((e) => { console.error(e.shortMessage ?? e.message); process.exitCode = 1; });
