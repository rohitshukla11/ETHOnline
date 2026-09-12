"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { hederaTestnet } from "@/lib/chains";

/**
 * Wallet connect / chain switch.
 *
 * Three things this deliberately does that the previous version did not:
 *
 *  - Surfaces `useConnect().error`. Without it a failed connect is silent: the
 *    button appears to do nothing and there is no clue whether the wallet is
 *    missing, the request was rejected, or the chain was refused.
 *  - Picks one connector rather than rendering a button per connector. wagmi v2
 *    discovers wallets over EIP-6963 on top of the `injected()` connector declared
 *    in lib/wagmi.ts, so a single MetaMask install surfaces twice - once as
 *    "Injected" and once as "MetaMask". Those were two buttons for one wallet.
 *  - Waits for mount before rendering wallet state. The config is `ssr: true`, so
 *    the server cannot know about `window.ethereum`; rendering that state during
 *    hydration produces a mismatch and React discards the client tree, which looks
 *    exactly like a dead button.
 */
/**
 * One wallet, one button.
 *
 * A discovered EIP-6963 connector is preferred over the generic `injected` one: both
 * reach the same wallet, but the discovered entry is bound to a specific provider, so
 * it does not depend on whichever extension happened to win `window.ethereum`.
 * WalletConnect is last - it is only a fallback when no injected wallet exists.
 */
function pickConnector(connectors: readonly Connector[]): Connector {
  const discovered = connectors.find((c) => c.type === "injected" && c.id !== "injected");
  const generic = connectors.find((c) => c.id === "injected");
  return discovered ?? generic ?? connectors[0];
}

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
      <button className="btn" disabled>
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
    if (connectors.length === 0) {
      return (
        <a
          className="btn"
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
        <button
          className="btn"
          disabled={isPending}
          onClick={() => connect({ connector: pickConnector(connectors) })}
        >
          {isPending ? "Connecting..." : "Connect Wallet"}
        </button>
      </div>
    );
  }

  if (chainId !== hederaTestnet.id) {
    return (
      <div className="flex items-center gap-2">
        {errLine}
        <button className="btn" onClick={() => switchChain({ chainId: hederaTestnet.id })}>
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
