import { NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "@/lib/chains";
import { addresses, worldIdRegistryAbi, warehouseReceiptAbi } from "@/lib/contracts";
import { verifyWorldProof } from "@/lib/worldid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verifies a World ID proof, then attests the nullifier onchain and grants KYC on
 * WarehouseReceipt.
 *
 * NOT the ATS token. These are two separate compliance mechanisms on two separate
 * assets: WarehouseReceipt.grantKyc is World-ID-gated and enforced by this protocol;
 * the ATS equity's gate is its own approval list, administered by the token issuer
 * through Asset Tokenization Studio. See docs/deployments.md.
 * The proof is checked server-side; the client can never self-declare verification.
 *
 * `worldIdResult` is IDKit's completion payload, forwarded verbatim. It is NOT
 * reshaped here: the v4 body schema belongs to the SDK, and hand-rebuilding it is how
 * the mixed-mode bug in worldcoin/idkit#204 gets reintroduced. `address` is carried
 * separately because it is what the nullifier gets bound to onchain - the signal is
 * already inside the proof.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.address || !body?.worldIdResult) {
    return NextResponse.json(
      {
        error:
          "Malformed request. Expected { address, worldIdResult } where worldIdResult " +
          "is the completion payload from IDKit.",
      },
      { status: 400 }
    );
  }

  const result = await verifyWorldProof(body.worldIdResult);

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

  // Verification immediately unlocks WarehouseReceipt's KYC whitelist - the EVM
  // collateral record. The ATS security token has its own approval list, which is not
  // touched here.
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
