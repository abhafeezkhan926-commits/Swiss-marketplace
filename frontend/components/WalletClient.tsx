"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Coins, History, ShieldCheck, ArrowUpRight, RefreshCw } from "lucide-react";
import { useSession } from "@/components/session";

type PackageItem = { id: string; code: string; coins: number; amountMinor: number; currency: string; priceLabel: string; description: string };
type Tx = { id: string; type: string; amountCoins: number; reservedDelta: number; status: string; createdAt: string; availableAfter: number };
type WalletData = { availableCoins: number; reservedCoins: number; purchasedCoinsTotal: number; testCoinsTotal: number; spentCoinsTotal: number };
type Envelope<T> = { ok: boolean; data?: T; error?: { message: string } };
function dateText(value: string) { return new Date(value).toLocaleString(); }
export default function WalletClient() {
  const { user, ready } = useSession();
  const [packages, setPackages] = useState<PackageItem[]>([]); const [wallet, setWallet] = useState<WalletData | null>(null); const [transactions, setTransactions] = useState<Tx[]>([]);
  const [selected, setSelected] = useState(""); const [isTest, setIsTest] = useState(false); const [currency, setCurrency] = useState("usd"); const [minMinor, setMinMinor] = useState(500);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const [pr, wr] = await Promise.all([fetch("/api/wallet/packages", { cache: "no-store" }), fetch("/api/wallet", { cache: "no-store" })]);
      const pj = (await pr.json()) as Envelope<{ packages: PackageItem[]; currency: string; minTopUpMinor: number }>;
      if (pr.ok && pj.data) { setPackages(pj.data.packages); setCurrency(pj.data.currency); setMinMinor(pj.data.minTopUpMinor); setSelected((old) => pj.data!.packages.some((p) => p.id === old) ? old : (pj.data!.packages[0]?.id || "")); }
      else throw new Error(pj.error?.message || "Could not load coin packages.");
      const wj = (await wr.json()) as Envelope<{ wallet: WalletData; transactions: Tx[]; isTestAccount: boolean }>;
      if (!wr.ok || !wj.data) throw new Error(wj.error?.message || (wr.status === 401 ? "Sign in to open your wallet." : "Could not load your wallet."));
      setWallet(wj.data.wallet); setTransactions(wj.data.transactions); setIsTest(wj.data.isTestAccount);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load your wallet."); }
    finally { setLoading(false); }
  }, [user]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial wallet fetch; state updates only after the awaited API responses.
  useEffect(() => { if (ready) void load(); }, [load, ready]);
  async function checkout() {
    if (!selected) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/wallet/checkout", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ packageId: selected }) });
      const result = (await response.json()) as Envelope<{ checkoutUrl: string }>;
      if (!response.ok || !result.data?.checkoutUrl) throw new Error(result.error?.message || "Checkout could not be created.");
      window.location.assign(result.data.checkoutUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout failed."); }
    finally { setBusy(false); }
  }
  const chosen = packages.find((p) => p.id === selected);
  if (ready && !user) return <div className="auth-wrap"><div className="auth-card"><h1>Sign in to your wallet</h1><p>View your balance, top-ups, and transaction history.</p><Link className="btn btn-primary" href="/login">Sign in</Link></div></div>;
  return <div className="stack" style={{ gap: 27 }}>
    <div className="page-heading"><div><span className="eyebrow"><Coins size={14} /> Your account wallet</span><h1 style={{ marginTop: 14 }}>Wallet & top up</h1><p>Choose a coin package and complete checkout securely. Coins are credited automatically once your payment is confirmed.</p></div><button className="btn btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Refresh</button></div>
    {error && <div className="notice error">{error}</div>}{message && <div className="notice success">{message}</div>}
    {!loading && error.includes("Sign in") && <div className="card"><a className="btn btn-primary" href="/login">Sign in to wallet</a></div>}
    <section className="wallet-hero"><div><p className="muted small" style={{ margin: 0, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase" }}>Available balance</p><h2>{wallet ? wallet.availableCoins.toLocaleString() : "—"} <span style={{ fontSize: ".48em", letterSpacing: 0 }}>coins</span></h2><p className="muted">{wallet ? `${wallet.reservedCoins.toLocaleString()} coins currently reserved for eligible auctions` : "Your balance will appear here after sign in."}</p>{isTest && <div className="notice warning" style={{ display: "inline-block", marginTop: 9 }}>Demo wallet — these test coins have no cash value.</div>}</div><div className="coin-illustration"><Coins size={67} strokeWidth={1.7} /></div></section>
    <section><div className="section-head" style={{ marginTop: 0 }}><div><h2>Choose a package</h2><p>Minimum top-up: {new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(minMinor / 100)}</p></div><span className="tag">{currency.toUpperCase()} checkout</span></div>
      {packages.length ? <div className="package-grid">{packages.map((item) => <button className={`package-card ${selected === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelected(item.id)} aria-pressed={selected === item.id}><span className="coins">{item.coins.toLocaleString()}</span><span className="pkg-label">Marketplace coins</span><div className="price">{item.priceLabel}</div><span className="pkg-label">{item.coins === 5 ? "Minimum top-up" : `${(item.coins / 100).toLocaleString()} × 100 coins`}</span>{item.coins === 200 && <span className="popular">POPULAR</span>}</button>)}</div> : <div className="empty"><Coins size={25} /><h3>{loading ? "Loading packages…" : "Top-ups are unavailable"}</h3><p>Coin packages are not available right now. Please check back soon.</p></div>}
      <div className="row" style={{ justifyContent: "space-between", marginTop: 17, alignItems: "flex-end" }}><div className="helper" style={{ maxWidth: 560 }}><ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />Prices are set by MarketHaus and applied at checkout. Withdrawals and coin transfers are not available.{isTest && " Checkout is disabled for demo accounts."}</div><button className="btn btn-primary" onClick={() => void checkout()} disabled={!chosen || busy || loading || isTest}>{busy ? "Preparing checkout…" : <>Secure checkout <ArrowUpRight size={17} /></>}</button></div>
    </section>
    <section><div className="section-head" style={{ marginTop: 0 }}><div><h2>Wallet history</h2><p>Your latest wallet activity.</p></div></div>{transactions.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Coin change</th><th>Available after</th><th>Status</th><th>Date</th></tr></thead><tbody>{transactions.map((tx) => <tr key={tx.id}><td style={{ textTransform: "capitalize" }}>{tx.type.replaceAll("_", " ")}</td><td style={{ fontWeight: 800, color: tx.amountCoins >= 0 ? "#10836d" : "#bc3b4c" }}>{tx.amountCoins > 0 ? "+" : ""}{tx.amountCoins.toLocaleString()}</td><td>{tx.availableAfter.toLocaleString()}</td><td><span className={`tag ${tx.status === "completed" ? "good" : ""}`}>{tx.status}</span></td><td>{dateText(tx.createdAt)}</td></tr>)}</tbody></table></div> : <div className="empty"><History size={25} /><h3>No transactions yet</h3><p>Your top-ups and eligible coin reservations will appear here.</p></div>}</section>
    <section className="three-col"><div className="stat-card"><span>Total bought</span><strong>{wallet?.purchasedCoinsTotal.toLocaleString() ?? "—"}</strong><span>Purchased credits</span></div><div className="stat-card"><span>Total spent</span><strong>{wallet?.spentCoinsTotal.toLocaleString() ?? "—"}</strong><span>Coins used on the marketplace</span></div><div className="stat-card"><span>Test credits</span><strong>{wallet?.testCoinsTotal.toLocaleString() ?? "—"}</strong><span>Demo coins with no cash value</span></div></section>
    <div className="notice">Coins are credited automatically after your payment is confirmed.</div>
  </div>;
}
