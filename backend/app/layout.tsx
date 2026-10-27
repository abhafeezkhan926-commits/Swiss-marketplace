import type { Metadata } from "next";

export const metadata: Metadata = { title: "MarketHaus API", description: "Backend API service for the Swiss live shopping marketplace." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body style={{fontFamily:"system-ui, sans-serif", margin:0, padding:"48px 24px", color:"#172033", background:"#f8fafc"}}>{children}</body></html>;
}
