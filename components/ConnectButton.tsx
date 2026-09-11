"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hederaTestnet } from "@/lib/chains";

export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const connector = connectors[0];
    return (
      <button
        className="btn"
        disabled={isPending || !connector}
        onClick={() => connector && connect({ connector })}
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  if (chainId !== hederaTestnet.id) {
    return (
      <button className="btn" onClick={() => switchChain({ chainId: hederaTestnet.id })}>
        Switch to Hedera Testnet
      </button>
    );
  }

  return (
    <button className="btn-ghost font-mono text-xs" onClick={() => disconnect()}>
      {address?.slice(0, 6)}...{address?.slice(-4)}
    </button>
  );
}
