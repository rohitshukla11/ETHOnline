import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Godaam - Confidential Agricultural Lending Vault",
  description:
    "Tokenized warehouse receipts on Hedera, confidential credit scoring in a Chainlink CRE TEE, World ID Selfie Check identity gating.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Satoshi is served from Fontshare, which next/font/google cannot fetch.
            Preconnecting keeps the swap from landing mid-scroll. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap"
        />
      </head>
      <body>
        <Providers>
          <SiteNav />
          {/* The column is set per page: the landing hero is wider than the
              app screens, which stay at a 600px reading column. */}
          <main className="w-full px-4 py-10 sm:px-6">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
