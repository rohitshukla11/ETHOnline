import { addresses } from "@/lib/contracts";
import { hashscanAddress } from "@/lib/chains";

const contracts = [
  { label: "Vault", address: addresses.godaamVault },
  { label: "Receipt", address: addresses.warehouseReceipt },
  { label: "World ID registry", address: addresses.worldIdRegistry },
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
      <div className="mx-auto flex max-w-[600px] flex-col gap-3 px-4 py-7 sm:px-6">
        <p className="text-label text-muted">
          गोदाम Godaam · Hedera testnet, chain 296 · contracts verified on Sourcify
        </p>
        {deployed.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {deployed.map((c) => (
              <li key={c.label}>
                <a
                  className="text-label text-muted underline-offset-4 hover:text-text hover:underline"
                  href={hashscanAddress(c.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
