import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "@/lib/chains";
import { addresses, warehouseReceiptAbi } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues the ATS security token for a warehouse receipt and mints the EVM compliance
 * mirror. The ATS SDK call is done server-side because it needs the Hedera operator key.
 *
 * `scripts/ats-issue-receipt.ts` holds the full ATS flow (createEquity -> control list ->
 * issue). This route reuses it when ATS env vars are present, and otherwise mints only the
 * mirror so the app stays demoable.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.address || !body?.cropType) {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const key = process.env.WORLD_ATTESTOR_PRIVATE_KEY as Hex | undefined;
  if (!key) return NextResponse.json({ error: "Issuer key not configured" }, { status: 500 });

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: hederaTestnet, transport: http() });

  // WarehouseReceipt.issue reverts if the address never passed World ID verification.
  const kyc = await publicClient.readContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "kycGranted",
    args: [body.address],
  });
  if (!kyc) {
    return NextResponse.json(
      { error: "Address is not KYC-granted. Complete World ID Orb verification first." },
      { status: 403 }
    );
  }

  let atsTokenId: string = "0.0.0";
  let atsTokenAddress = "0x0000000000000000000000000000000000000000";

  if (process.env.ATS_FACTORY_ADDRESS && process.env.HEDERA_OPERATOR_KEY) {
    const ats = await import("@/scripts/ats-issue-receipt");
    await ats.initAts();
    const security = await ats.issueReceiptToken({
      cropType: body.cropType,
      grade: body.grade,
      quantityKg: Number(body.quantityKg),
      storageLocation: body.storageLocation,
      expiryUnix: Math.floor(new Date(body.expiry).getTime() / 1000),
      farmerAccountId: body.hederaAccountId,
    });
    await ats.grantAtsKyc(security.diamondAddress!, body.hederaAccountId);
    await ats.mintToFarmer(security.diamondAddress!, body.hederaAccountId, Number(body.quantityKg));
    atsTokenId = security.diamondAddress!;
    atsTokenAddress = security.evmDiamondAddress!;
  }

  const appraisedValue = BigInt(Math.round(Number(body.appraisedValue) * 1e6));

  const txHash = await wallet.writeContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "issue",
    args: [
      body.address,
      {
        cropType: body.cropType,
        grade: body.grade,
        quantityKg: BigInt(body.quantityKg),
        storageLocation: body.storageLocation,
        expiry: BigInt(Math.floor(new Date(body.expiry).getTime() / 1000)),
        appraisedValue,
        atsTokenAddress: atsTokenAddress as Hex,
        atsTokenId,
      },
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const issuedLog = receipt.logs.find(
    (l) => l.topics[0] === keccak256(toHex("ReceiptIssued(uint256,address,string,uint256)"))
  );
  const tokenId = issuedLog ? BigInt(issuedLog.topics[1]!).toString() : null;

  return NextResponse.json({ txHash, tokenId, atsTokenId, atsTokenAddress });
}
