"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";

const tabs = [
  { href: "/verify", label: "Verify" },
  { href: "/tokenize", label: "Tokenize" },
  { href: "/loan", label: "Borrow" },
];

/**
 * The mark is drawn inline rather than pulled from an icon set. The app needs exactly
 * one glyph, and a dependency (plus a lockfile change) days before filming buys nothing.
 * Emoji were explicitly ruled out - they render differently on every platform.
 */
function Mark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      aria-hidden="true"
      fill="none"
      stroke="rgb(var(--wheat))"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 20.5V8" />
      <path d="M5.5 13.5 11 8l5.5 5.5" />
      <path d="M5.5 9 11 3.5 16.5 9" />
    </svg>
  );
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-divider">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[17px] font-medium tracking-[-0.01em]">Godaam</span>
        </Link>

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
      </div>
    </header>
  );
}
