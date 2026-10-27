import type { Metadata } from "next";
import "@livekit/components-styles";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "MarketHaus — Live Shopping Marketplace",
  description: "Discover products, sellers, live shopping, and product auctions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
