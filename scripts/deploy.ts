import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying to ${network.name} as ${deployer.address}`);

  const attestor = process.env.WORLD_ATTESTOR_ADDRESS ?? deployer.address;

  const registry = await (
    await ethers.deployContract("WorldIdRegistry", [deployer.address, attestor])
  ).waitForDeployment();
  console.log(`WorldIdRegistry      ${await registry.getAddress()}`);

  const usdc = await (
    await ethers.deployContract("MockUSDC", [deployer.address])
  ).waitForDeployment();
  console.log(`MockUSDC (gUSDC)     ${await usdc.getAddress()}`);

  const receipts = await (
    await ethers.deployContract("WarehouseReceipt", [
      deployer.address,
      await registry.getAddress(),
    ])
  ).waitForDeployment();
  console.log(`WarehouseReceipt     ${await receipts.getAddress()}`);

  const vault = await (
    await ethers.deployContract("GodaamVault", [
      deployer.address,
      await usdc.getAddress(),
      await receipts.getAddress(),
      await registry.getAddress(),
      deployer.address, // liquidation treasury
    ])
  ).waitForDeployment();
  console.log(`GodaamVault          ${await vault.getAddress()}`);

  // The vault needs ATS controller powers: freeze collateral, force-transfer on default.
  const CONTROLLER_ROLE = await receipts.CONTROLLER_ROLE();
  await (await receipts.grantRole(CONTROLLER_ROLE, await vault.getAddress())).wait();
  console.log("Granted CONTROLLER_ROLE to GodaamVault");

  // Local/dev: wire a mock forwarder so the TEE report path works without a live CRE node.
  let forwarderAddress = process.env.CRE_FORWARDER_ADDRESS ?? "";
  if (!forwarderAddress) {
    const mock = await (await ethers.deployContract("MockCreForwarder")).waitForDeployment();
    forwarderAddress = await mock.getAddress();
    console.log(`MockCreForwarder     ${forwarderAddress}`);
  }
  await (
    await vault.setCreForwarder(
      forwarderAddress,
      process.env.CRE_WORKFLOW_OWNER || ethers.ZeroAddress
    )
  ).wait();

  // Seed the lending pool.
  const seed = 1_000_000n * 10n ** 6n;
  await (await usdc.mint(await vault.getAddress(), seed)).wait();
  console.log(`Seeded vault with ${seed / 10n ** 6n} gUSDC`);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    WorldIdRegistry: await registry.getAddress(),
    MockUSDC: await usdc.getAddress(),
    WarehouseReceipt: await receipts.getAddress(),
    GodaamVault: await vault.getAddress(),
    CreForwarder: forwarderAddress,
  };
  const file = path.join(process.cwd(), "deployments", `${network.name}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${file}`);
  console.log(
    "\nCopy into .env:\n" +
      `NEXT_PUBLIC_WORLD_ID_REGISTRY=${out.WorldIdRegistry}\n` +
      `NEXT_PUBLIC_MOCK_USDC=${out.MockUSDC}\n` +
      `NEXT_PUBLIC_WAREHOUSE_RECEIPT=${out.WarehouseReceipt}\n` +
      `NEXT_PUBLIC_GODAAM_VAULT=${out.GodaamVault}\n` +
      `CRE_FORWARDER_ADDRESS=${out.CreForwarder}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
