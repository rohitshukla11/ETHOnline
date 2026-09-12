"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";

const tabs = [
  { href: "/verify", label: "Verify" },
  { href: "/tokenize", label: "Tokenize" },
  { href: "/loan", label: "Borrow" },
];

function Mark() {
  return (
    <span
      className="block h-[26px] w-[26px] rounded-[7px] bg-wheat"
      aria-hidden="true"
    />
  );
}

/**
 * Two shapes. The landing page is a marketing surface: mark, wordmark, and a single
 * Launch app action. The app routes need their tab group and the wallet, which would be
 * noise on the landing page - nothing there can use a connected wallet.
 */
export function SiteNav() {
  const pathname = usePathname();
  const landing = pathname === "/";

  return (
    <header className="border-b border-divider">
      {/* Full bleed: the mark sits against the left edge and the action against
          the right, rather than inside a centred column. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[19px] font-bold tracking-[-0.02em]">Godaam</span>
        </Link>

        {landing ? (
          <Link href="/verify" className="btn">
            Launch app
          </Link>
        ) : (
          <>
            <nav className="order-3 flex rounded-pill bg-surface p-1 sm:order-none">
              {tabs.map((t) => {
                const active = pathname === t.href;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-pill px-4 py-1.5 text-[14px] transition-colors ${
                      active
                        ? "bg-wheat font-medium text-wheat-on"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            <ConnectButton />
          </>
        )}
      </div>
    </header>
  );
}
