import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";

export const metadata: Metadata = {
  title: "Godaam - Confidential Agricultural Lending Vault",
  description:
    "Tokenized warehouse receipts on Hedera, confidential credit scoring in a Chainlink CRE TEE, World ID Orb identity gating.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="border-b border-stone-800">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                गोदाम <span className="text-grain">Godaam</span>
              </Link>
              <nav className="flex items-center gap-4 text-sm text-stone-400">
                <Link href="/verify" className="hover:text-stone-100">
                  Verify
                </Link>
                <Link href="/tokenize" className="hover:text-stone-100">
                  Tokenize
                </Link>
                <Link href="/loan" className="hover:text-stone-100">
                  Loan
                </Link>
                <ConnectButton />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
