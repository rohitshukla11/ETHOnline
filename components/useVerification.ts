"use client";

import { useAccount, useReadContract } from "wagmi";
import { addresses, worldIdRegistryAbi } from "@/lib/contracts";

/** Single source of truth for "is this farmer allowed to do anything". */
export function useVerification() {
  const { address, isConnected } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: addresses.worldIdRegistry,
    abi: worldIdRegistryAbi,
    functionName: "isVerified",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 5000 },
  });

  return {
    address,
    isConnected,
    isVerified: Boolean(data),
    isLoading,
    refetch,
  };
}
