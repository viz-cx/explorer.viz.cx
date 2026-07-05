import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { WalletLayout } from "@/components/WalletLayout";

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Nonce-based CSP (see proxy.ts) requires every page to render at request time
// so Next can stamp the per-request nonce onto its inline scripts. Forcing it
// here covers all nested routes; per-page `revalidate`/ISR is disabled as a
// result (each request re-renders and re-fetches upstream data).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://viz.cx"),
  title: {
    default: "VIZ.cx — VIZ blockchain explorer",
    template: "%s · VIZ.cx",
  },
  description:
    "The English-first block explorer and network dashboard for the VIZ blockchain. Blocks, accounts, transactions, validators and richlist — read-only, real-time.",
  openGraph: {
    title: "VIZ.cx — VIZ blockchain explorer",
    description: "English-first block explorer and network dashboard for VIZ.",
    url: "https://viz.cx",
    siteName: "VIZ.cx",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <WalletLayout>
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-[11px] text-fg-dim sm:flex-row">
              <span className="font-prose">VIZ.cx</span>
              <span className="flex items-center gap-3">
                <a href="https://node.viz.cx" className="hover:text-fg" rel="noreferrer">
                  node.viz.cx
                </a>
                <Link href="/dev/playground" className="hover:text-fg">
                  API
                </Link>
                <a href="https://github.com/viz-cx" className="hover:text-fg" rel="noreferrer">
                  GitHub
                </a>
              </span>
            </div>
          </footer>
        </WalletLayout>
      </body>
    </html>
  );
}
