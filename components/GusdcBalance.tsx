"use client";

import { useEffect } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { addresses, erc20Abi, formatUsdc } from "@/lib/contracts";

const bare = (v: bigint | undefined) => formatUsdc(v).replace(" gUSDC", "");

/**
 * Installments total more than the principal, so a farmer who only ever received the
 * disbursement cannot finish repaying. MockUSDC.faucet() mints 5,000 gUSDC once a day on
 * testnet; without a button for it the demo dead-ends on the first installment.
 */
export function GusdcBalance({ compact = false }: { compact?: boolean } = {}) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash });

  const { data: balance, refetch } = useReadContract({
    address: addresses.mockUsdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 5000 },
  });

  useEffect(() => {
    if (!confirming && hash) void refetch();
  }, [confirming, hash, refetch]);

  if (compact) {
    return (
      <p className="text-[14px] text-muted">
        Balance <span className="fig text-text">{bare(balance)}</span> gUSDC{" "}
        <span className="px-1">·</span>
        <button
          type="button"
          className="text-wheat underline-offset-4 hover:underline disabled:opacity-50"
          disabled={isPending || confirming}
          onClick={() =>
            writeContract({
              address: addresses.mockUsdc,
              abi: erc20Abi,
              functionName: "faucet",
            })
          }
        >
          {isPending || confirming ? "Claiming…" : "Get test gUSDC"}
        </button>
      </p>
    );
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-label text-muted">Your balance</p>
        <p className="mt-1 text-metric font-medium tabular-nums">{bare(balance)} gUSDC</p>
      </div>
      <button
        className="btn-ghost whitespace-nowrap"
        disabled={isPending || confirming}
        onClick={() =>
          writeContract({
            address: addresses.mockUsdc,
            abi: erc20Abi,
            functionName: "faucet",
          })
        }
      >
        {isPending || confirming ? "Claiming..." : "Get 5,000 test gUSDC"}
      </button>
    </div>
  );
}
