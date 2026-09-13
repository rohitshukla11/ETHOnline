"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { addresses, formatUsdc, godaamVaultAbi, warehouseReceiptAbi } from "@/lib/contracts";

/**
 * The receipts held by the connected wallet.
 *
 * WarehouseReceipt is not ERC721Enumerable and there is no totalSupply, so ownership is
 * found by probing `ownerOf` over a bounded id range rather than by indexing. The
 * alternative was `eth_getLogs` on ReceiptIssued, but Hashio caps log queries at a
 * 7-day window - which would work today and silently return nothing for anyone opening
 * the app a week later. Probing has no time horizon.
 *
 * `balanceOf` gives the stop condition, so the scan costs nothing once every receipt is
 * accounted for.
 */
const MAX_RECEIPT_ID = 24;

export type PickedReceipt = {
  id: bigint;
  cropType: string;
  grade: string;
  quantityKg: bigint;
  storageLocation: string;
  appraised: bigint;
  activeLoanId: bigint;
};

export function useMyReceipts(): { receipts: PickedReceipt[]; isLoading: boolean } {
  const { address } = useAccount();

  const { data: balance } = useReadContract({
    address: addresses.warehouseReceipt,
    abi: warehouseReceiptAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const ids = Array.from({ length: MAX_RECEIPT_ID }, (_, i) => BigInt(i + 1));

  const { data: owners, isLoading: ownersLoading } = useReadContracts({
    allowFailure: true,
    contracts: ids.map((id) => ({
      address: addresses.warehouseReceipt,
      abi: warehouseReceiptAbi,
      functionName: "ownerOf" as const,
      args: [id] as const,
    })),
    query: { enabled: Boolean(address) && (balance ?? 0n) > 0n },
  });

  const owned = (owners ?? [])
    .map((r, i) => ({ id: ids[i], owner: r.status === "success" ? (r.result as string) : null }))
    .filter((r) => r.owner && address && r.owner.toLowerCase() === address.toLowerCase())
    .map((r) => r.id)
    // Stop once every receipt the balance accounts for has been found.
    .slice(0, Number(balance ?? 0n));

  const { data: details, isLoading: detailsLoading } = useReadContracts({
    allowFailure: true,
    contracts: owned.flatMap((id) => [
      {
        address: addresses.warehouseReceipt,
        abi: warehouseReceiptAbi,
        functionName: "receiptOf" as const,
        args: [id] as const,
      },
      {
        address: addresses.warehouseReceipt,
        abi: warehouseReceiptAbi,
        functionName: "appraisedValueOf" as const,
        args: [id] as const,
      },
      {
        address: addresses.godaamVault,
        abi: godaamVaultAbi,
        functionName: "activeLoanOfReceipt" as const,
        args: [id] as const,
      },
    ]),
    query: { enabled: owned.length > 0 },
  });

  const receipts: PickedReceipt[] = owned.flatMap((id, i) => {
    const d = details?.[i * 3];
    const a = details?.[i * 3 + 1];
    const l = details?.[i * 3 + 2];
    if (!d || d.status !== "success") return [];
    const meta = d.result as {
      cropType: string;
      grade: string;
      quantityKg: bigint;
      storageLocation: string;
    };
    return [
      {
        id,
        cropType: meta.cropType,
        grade: meta.grade,
        quantityKg: meta.quantityKg,
        storageLocation: meta.storageLocation,
        appraised: a?.status === "success" ? (a.result as bigint) : 0n,
        activeLoanId: l?.status === "success" ? (l.result as bigint) : 0n,
      },
    ];
  });

  return { receipts, isLoading: ownersLoading || detailsLoading };
}

export function ReceiptCard({
  receipt,
  selected,
  onSelect,
}: {
  receipt: PickedReceipt;
  selected: boolean;
  onSelect: (id: bigint) => void;
}) {
  const pledged = receipt.activeLoanId > 0n;
  return (
    <button
      type="button"
      disabled={pledged}
      onClick={() => onSelect(receipt.id)}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between gap-4 rounded-card border p-4 text-left
        transition-colors ${
          pledged
            ? "cursor-not-allowed border-border bg-surface/50 opacity-55"
            : selected
              ? "border-wheat bg-surface"
              : "border-border bg-surface hover:border-border-strong"
        }`}
    >
      <span className="min-w-0">
        <span className="block text-[17px] text-text">
          Receipt #{receipt.id.toString()} ·{" "}
          <span className="fig">{Number(receipt.quantityKg).toLocaleString()}</span> kg
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">
          {receipt.cropType} · {receipt.grade} · {receipt.storageLocation}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {pledged ? (
          <span className="text-[13px] text-muted">
            Pledged to loan #{receipt.activeLoanId.toString()}
          </span>
        ) : (
          <>
            <span className="fig block text-[17px] text-text">
              {formatUsdc(receipt.appraised).replace(" gUSDC", "")}
            </span>
            <span className="block text-[12px] text-muted">appraised</span>
          </>
        )}
      </span>
    </button>
  );
}
