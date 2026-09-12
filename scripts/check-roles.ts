/**
 * Post-deploy wiring proof. Reads state from the DEPLOYED contracts (addresses come
 * from .env, the same source the app uses) rather than trusting the deployment JSON.
 *
 * Usage: npm run check:roles
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
  const registryAddr = need("NEXT_PUBLIC_WORLD_ID_REGISTRY");
  const receiptsAddr = need("NEXT_PUBLIC_WAREHOUSE_RECEIPT");
  const vaultAddr = need("NEXT_PUBLIC_GODAAM_VAULT");
  const usdcAddr = need("NEXT_PUBLIC_MOCK_USDC");
  const attestor = need("WORLD_ATTESTOR_ADDRESS");
  const forwarderExpected = process.env.CRE_FORWARDER_ADDRESS ?? "";

  const registry: any = await ethers.getContractAt("WorldIdRegistry", registryAddr);
  const receipts: any = await ethers.getContractAt("WarehouseReceipt", receiptsAddr);
  const vault: any = await ethers.getContractAt("GodaamVault", vaultAddr);
  const usdc: any = await ethers.getContractAt("MockUSDC", usdcAddr);

  const ISSUER_ROLE = await receipts.ISSUER_ROLE();
  const CONTROLLER_ROLE = await receipts.CONTROLLER_ROLE();

  const issuerOk = await receipts.hasRole(ISSUER_ROLE, attestor);
  const controllerOk = await receipts.hasRole(CONTROLLER_ROLE, vaultAddr);
  const onchainAttestor = await registry.attestor();
  const onchainForwarder = await vault.creForwarder();
  const workflowOwner = await vault.workflowOwner();
  const vaultBal = await usdc.balanceOf(vaultAddr);
  const decimals = await usdc.decimals();

  const pad = (s: string) => s.padEnd(42);
  console.log(`hasRole(ISSUER_ROLE, attestor)      ${pad(attestor)} ${issuerOk}`);
  console.log(`hasRole(CONTROLLER_ROLE, vault)     ${pad(vaultAddr)} ${controllerOk}`);
  console.log(`registry.attestor()                 ${pad(onchainAttestor)} ${onchainAttestor.toLowerCase() === attestor.toLowerCase()}`);
  console.log(`vault.creForwarder()                ${pad(onchainForwarder)} ${forwarderExpected ? onchainForwarder.toLowerCase() === forwarderExpected.toLowerCase() : "(no expectation set)"}`);
  console.log(`vault.workflowOwner()               ${pad(workflowOwner)} ${workflowOwner === ethers.ZeroAddress ? "(zero = owner check disabled)" : ""}`);
  console.log(`vault gUSDC balance                 ${pad(ethers.formatUnits(vaultBal, decimals))} ${vaultBal === 1_000_000n * 10n ** BigInt(decimals)}`);

  const allOk =
    issuerOk &&
    controllerOk &&
    onchainAttestor.toLowerCase() === attestor.toLowerCase() &&
    vaultBal === 1_000_000n * 10n ** BigInt(decimals);
  console.log(`\nall expected: ${allOk}`);
  if (!allOk) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.shortMessage ?? e.message);
  process.exitCode = 1;
});
