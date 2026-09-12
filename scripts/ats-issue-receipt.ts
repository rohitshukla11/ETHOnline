/**
 * Issues the real warehouse-receipt security token on Hedera testnet using the
 * Asset Tokenization Studio SDK, then mirrors it into WarehouseReceipt.sol so the vault
 * can enforce the same compliance rules atomically.
 *
 * Usage: npx tsx scripts/ats-issue-receipt.ts
 */
import "dotenv/config";
import {
  Network,
  Security,
  Equity,
  CreateEquityRequest,
  GetAccountBalanceRequest,
  ControlListRequest,
  InitializationRequest,
  ConnectRequest,
  IssueRequest,
  ForceTransferRequest,
  SupportedWallets,
} from "@hashgraph/asset-tokenization-sdk";

const required = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};

export type ReceiptSpec = {
  cropType: string;
  grade: string;
  quantityKg: number;
  storageLocation: string;
  expiryUnix: number;
  farmerAccountId: string; // Hedera 0.0.x of the verified farmer
};

export async function initAts() {
  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const mirrorNode = {
    name: "hedera-mirror",
    baseUrl: "https://testnet.mirrornode.hedera.com/api/v1/",
  };
  const rpcNode = {
    name: "hashio",
    baseUrl: process.env.HEDERA_TESTNET_RPC ?? "https://testnet.hashio.io/api",
  };

  // Factories/Resolvers aren't constructible from the package entrypoint; the
  // factory + resolver pair goes in via `configuration` instead.
  await Network.init(
    new InitializationRequest({
      network,
      mirrorNode,
      rpcNode,
      configuration: {
        factoryAddress: required("ATS_FACTORY_ADDRESS"),
        resolverAddress: required("ATS_RESOLVER_ADDRESS"),
      },
    })
  );

  await Network.connect(
    new ConnectRequest({
      account: {
        accountId: required("HEDERA_OPERATOR_ID"),
        privateKey: {
          key: required("HEDERA_OPERATOR_KEY"),
          type: "ED25519",
        },
      },
      network,
      mirrorNode,
      rpcNode,
      // NOTE: this SDK exposes no headless/operator-key wallet. SupportedWallets is
      // { METAMASK, HWALLETCONNECT, DFNS, FIREBLOCKS, AWSKMS }, so a server-side
      // issuance flow must go through a custodial signer (DFNS / Fireblocks / AWS KMS)
      // via `custodialWalletSettings`. The operator-key path below will NOT sign
      // headlessly and is unverified against a live network.
      wallet: SupportedWallets.METAMASK,
    })
  );
}

/** Step 1: deploy the ATS security token representing this receipt. */
export async function issueReceiptToken(spec: ReceiptSpec) {
  const symbol = `GWR-${spec.cropType.slice(0, 3).toUpperCase()}`;
  const request = new CreateEquityRequest({
    name: `Godaam Receipt ${spec.cropType} ${spec.grade}`,
    symbol,
    isin: `IN${Date.now().toString().slice(-10)}`,
    decimals: 0,
    // Compliance switches - all ON, this is a regulated collateral instrument.
    isWhiteList: true,
    isControllable: true,
    isMultiPartition: false,
    arePartitionsProtected: false,
    clearingActive: false,
    internalKycActivated: true,
    diamondOwnerAccount: required("HEDERA_OPERATOR_ID"),
    numberOfShares: String(spec.quantityKg),
    nominalValue: "1",
    currency: "0x554e4b", // "UNK"
    votingRight: false,
    informationRight: false,
    liquidationRight: true,
    subscriptionRight: false,
    conversionRight: false,
    redemptionRight: true,
    putRight: false,
    dividendRight: 1,
    configId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    configVersion: 0,
    externalPausesIds: [],
    externalControlListsIds: [],
    externalKycListsIds: [],
    erc20VotesActivated: false,
    regulationType: 0,
    regulationSubType: 0,
    isCountryControlListWhiteList: false,
    countries: "",
    info: `${spec.storageLocation} | expires ${spec.expiryUnix}`,
  });

  const { security } = await Equity.create(request);
  console.log(`ATS security token created: ${security.evmDiamondAddress} (${security.diamondAddress})`);
  return security;
}

/** Step 2: whitelist the farmer. Call ONLY after World ID Selfie Check passed. */
export async function grantAtsKyc(securityId: string, farmerAccountId: string) {
  await Security.addToControlList(
    new ControlListRequest({ securityId, targetId: farmerAccountId })
  );
  console.log(`Whitelisted ${farmerAccountId} on ${securityId}`);
}

/** Step 3: issue the units to the farmer. */
export async function mintToFarmer(securityId: string, farmerAccountId: string, amount: number) {
  await Security.issue(
    new IssueRequest({ securityId, targetId: farmerAccountId, amount: String(amount) })
  );
  console.log(`Issued ${amount} units to ${farmerAccountId}`);
}

/** Lifecycle op: freeze / force-transfer on default (controller powers). */
export async function forceTransferOnDefault(
  securityId: string,
  from: string,
  to: string,
  amount: number
) {
  await Security.controllerTransfer(
    new ForceTransferRequest({
      securityId,
      sourceId: from,
      targetId: to,
      amount: String(amount),
    })
  );
  console.log(`Controller-transferred ${amount} from ${from} to ${to} (default liquidation)`);
}

export async function balanceOf(securityId: string, accountId: string) {
  const res = await Security.getBalanceOf(
    new GetAccountBalanceRequest({ securityId, targetId: accountId })
  );
  return res.value;
}

async function main() {
  await initAts();
  const spec: ReceiptSpec = {
    cropType: "Wheat",
    grade: "FAQ-A",
    quantityKg: 42_000,
    storageLocation: "WDRA Warehouse, Baramati, MH",
    expiryUnix: Math.floor(Date.now() / 1000) + 180 * 24 * 3600,
    farmerAccountId: required("HEDERA_OPERATOR_ID"),
  };

  const security = await issueReceiptToken(spec);
  await grantAtsKyc(security.diamondAddress!, spec.farmerAccountId);
  await mintToFarmer(security.diamondAddress!, spec.farmerAccountId, spec.quantityKg);
  console.log(`Balance: ${await balanceOf(security.diamondAddress!, spec.farmerAccountId)}`);

  console.log(
    `\nSet these before running demo-lifecycle.ts:\n` +
      `ATS_TOKEN_ID=${security.diamondAddress}\n` +
      `ATS_TOKEN_EVM_ADDRESS=${security.evmDiamondAddress}`
  );
}

if (process.argv[1]?.includes("ats-issue-receipt")) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
