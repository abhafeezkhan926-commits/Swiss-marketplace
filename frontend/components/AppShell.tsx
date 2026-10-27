"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X, Store, Search, Radio, Gavel, Wallet, UserRound, Settings, LogIn, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { SessionContext, type SessionUser } from "@/components/session";
import CartButton from "@/components/Cart";

type UserData = SessionUser;
type MeResponse = { ok: boolean; data?: { user: UserData | null; wallet?: { availableCoins: number; reservedCoins: number } | null } };
const links = [
  { href: "/", label: "Home", icon: Store },
  { href: "/products", label: "Products", icon: Search },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/auctions", label: "Auctions", icon: Gavel },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [coins, setCoins] = useState(0);
  const [ready, setReady] = useState(false);

  async function refreshMe() {
    let payload: MeResponse | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) continue;
        payload = (await response.json()) as MeResponse;
        break;
      } catch {
        // A dev-server reload or brief network drop can fail once; retry before
        // treating the visitor as signed out.
      }
    }
    if (payload) {
      setUser(payload.data?.user || null);
      setCoins(payload.data?.wallet?.availableCoins || 0);
      if (payload.data?.user) { document.documentElement.dataset.theme = payload.data.user.theme || "light"; document.documentElement.dataset.accent = payload.data.user.accent || "indigo"; }
    }
    setReady(true);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- session refresh after navigation; state updates only after the API response.
  useEffect(() => { void refreshMe(); }, [pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null); setCoins(0); router.push("/"); router.refresh();
  }

  return <SessionContext.Provider value={{ user, coins, ready, refresh: refreshMe }}>
    <header className="app-header">
      <div className="header-inner">
        <button className="mobile-toggle" onClick={() => setMobileOpen((v) => !v)} aria-label={mobileOpen ? "Close navigation" : "Open navigation"}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <Link className="brand" href="/" onClick={() => setMobileOpen(false)}><span className="brand-mark"><Sparkles size={21} /></span><span>MarketHaus</span></Link>
        <nav className={`main-nav ${mobileOpen ? "open" : ""}`} aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => <Link className={`nav-link ${pathname === href || (href !== "/" && pathname.startsWith(href)) ? "active" : ""}`} href={href} key={href} onClick={() => setMobileOpen(false)}><Icon size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />{label}</Link>)}
          {user && <Link className={`nav-link ${pathname === "/settings" ? "active" : ""}`} href="/settings" onClick={() => setMobileOpen(false)}><Settings size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />Settings</Link>}
          {user?.role === "admin" && <Link className={`nav-link ${pathname.startsWith("/admin") ? "active" : ""}`} href="/admin" onClick={() => setMobileOpen(false)}><ShieldCheck size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "-2px" }} />Admin</Link>}
        </nav>
        <div className="header-actions">
          {!ready ? null : user ? <>
            <CartButton />
            <Link href="/wallet" className="balance-pill"><Wallet size={15} />{coins.toLocaleString()} coins</Link>
            <Link className="btn btn-secondary btn-small" href="/profile" title="Profile"><UserRound size={15} /><span className="desktop-label">{user.name.split(" ")[0]}</span></Link>
            <button className="btn btn-secondary btn-small" onClick={() => void signOut()} title="Sign out"><LogOut size={15} /></button>
          </> : pathname !== "/login" && <Link className="btn btn-primary btn-small" href="/login"><LogIn size={15} />Sign in</Link>}
        </div>
      </div>
    </header>
    <main className="app-main">{children}</main>
    <footer className="app-footer">MarketHaus · Live shopping, auctions, and secure payments</footer>
    <style jsx global>{`@media (max-width: 560px) {.desktop-label {display:none}}`}</style>
  </SessionContext.Provider>;
}
