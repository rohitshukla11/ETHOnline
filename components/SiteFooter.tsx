import { addresses } from "@/lib/contracts";
import { hashscanAddress } from "@/lib/chains";

const contracts = [
  { label: "Vault", address: addresses.godaamVault },
  { label: "Receipt", address: addresses.warehouseReceipt },
  { label: "Registry", address: addresses.worldIdRegistry },
  { label: "gUSDC", address: addresses.mockUsdc },
];

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The hero status pill says "Live on Hedera" without qualifying it, so the network has
 * to be stated somewhere a judge will actually look. This is that place.
 */
export function SiteFooter() {
  const deployed = contracts.filter((c) => c.address !== ZERO);

  return (
    <footer className="mt-20 border-t border-divider">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-6">
        <p className="text-label text-muted">
          गोदाम Godaam · Hedera testnet, chain 296
        </p>
        {deployed.length > 0 && (
          <p className="text-label text-muted">
            {deployed.map((c, i) => (
              <span key={c.label}>
                {i > 0 && <span className="px-1.5">·</span>}
                <a
                  className="underline-offset-4 hover:text-text hover:underline"
                  href={hashscanAddress(c.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.label}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>
    </footer>
  );
}
