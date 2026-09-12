import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "@/lib/chains";
import { addresses, worldIdRegistryAbi, warehouseReceiptAbi } from "@/lib/contracts";
import { verifyWorldProof } from "@/lib/worldid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verifies a World ID Orb proof, then attests the nullifier onchain and grants ATS KYC.
 * The proof is checked server-side; the client can never self-declare verification.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.address || !body?.proof || !body?.nullifier_hash) {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const result = await verifyWorldProof(
    {
      proof: body.proof,
      merkle_root: body.merkle_root,
      nullifier_hash: body.nullifier_hash,
      verification_level: body.verification_level,
    },
    body.address
  );

  if (!result.success) {
    return NextResponse.json({ error: result.detail, code: result.code }, { status: 403 });
  }

  const key = process.env.WORLD_ATTESTOR_PRIVATE_KEY as Hex | undefined;
  if (!key) {
    return NextResponse.json({ error: "Attestor key not configured" }, { status: 500 });
  }

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
  const publicClient = createPublicClient({ chain: hederaTestnet, transport: http() });

  // Reject a nullifier already bound to a different wallet before spending gas.
  const existingOwner = await publicClient.readContract({
    address: addresses.worldIdRegistry,
    abi: worldIdRegistryAbi,
    functionName: "nullifierOwner",
    args: [result.nullifierHash],
  });
  if (
    existingOwner !== "0x0000000000000000000000000000000000000000" &&
    existingOwner.toLowerCase() !== String(body.address).toLowerCase()
  ) {
    return NextResponse.json(
      { error: "This identity is already registered to another address" },
      { status: 409 }
    );
  }

  const txHash = await wallet.writeContract({
    address: addresses.worldIdRegistry,
    abi: worldIdRegistryAbi,
    functionName: "attestVerification",
    args: [body.address, result.nullifierHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Verification immediately unlocks the ATS compliance whitelist.
  const kycHash = await wallet.writeContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "grantKyc",
    args: [body.address],
  });
  await publicClient.waitForTransactionReceipt({ hash: kycHash });

  return NextResponse.json({
    verified: true,
    verificationLevel: result.verificationLevel,
    txHash,
    kycTxHash: kycHash,
  });
}
