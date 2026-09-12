"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { hederaTestnet } from "@/lib/chains";

/**
 * Wallet connect / chain switch.
 *
 * Three things this deliberately does that the previous version did not:
 *
 *  - Surfaces `useConnect().error`. Without it a failed connect is silent: the
 *    button appears to do nothing and there is no clue whether the wallet is
 *    missing, the request was rejected, or the chain was refused.
 *  - Offers every available connector rather than only `connectors[0]`. With
 *    several injected wallets installed, index 0 is not necessarily the one the
 *    user wants.
 *  - Waits for mount before rendering wallet state. The config is `ssr: true`, so
 *    the server cannot know about `window.ethereum`; rendering that state during
 *    hydration produces a mismatch and React discards the client tree, which looks
 *    exactly like a dead button.
 */
export function ConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, error: switchError } = useSwitchChain();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Server and first client render must agree; wallet detection is client-only.
  if (!mounted) {
    return (
      <button className="btn-ghost" disabled>
        Connect Wallet
      </button>
    );
  }

  const err = connectError ?? switchError;
  const errLine = err ? (
    <span className="max-w-[16rem] text-right text-label text-bad">
      {err.name === "ProviderNotFoundError"
        ? "No wallet found. Install MetaMask, then reload."
        : (err as Error).message.slice(0, 120)}
    </span>
  ) : null;

  if (!isConnected) {
    // WalletConnect is only in the list when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
    // is set (see lib/wagmi.ts), so everything present here is offerable.
    const available = connectors;

    if (available.length === 0) {
      return (
        <a
          className="btn-ghost"
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
        >
          Install a wallet
        </a>
      );
    }

    return (
      <div className="flex items-center gap-2">
        {errLine}
        {available.map((c) => (
          <button
            key={c.uid}
            className="btn-ghost"
            disabled={isPending}
            onClick={() => connect({ connector: c })}
          >
            {isPending
              ? "Connecting..."
              : available.length > 1
                ? c.name
                : "Connect Wallet"}
          </button>
        ))}
      </div>
    );
  }

  if (chainId !== hederaTestnet.id) {
    return (
      <div className="flex items-center gap-2">
        {errLine}
        <button className="btn-ghost" onClick={() => switchChain({ chainId: hederaTestnet.id })}>
          Switch to Hedera Testnet
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {errLine}
      <span className="chip">
        <span className="fig">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
      </span>
      <button
        className="text-[13px] text-muted transition-colors hover:text-text"
        onClick={() => disconnect()}
      >
        Disconnect
      </button>
    </div>
  );
}
