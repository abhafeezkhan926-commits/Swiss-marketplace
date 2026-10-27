import Link from "next/link";
import { ArrowRight, Radio, Gavel, Coins, Sparkles, Store, Video, Wallet } from "lucide-react";
import HomeActions from "@/components/HomeActions";

const features = [
  { icon: Radio, title: "Live shopping", body: "Discover seller streams and get the details you need before choosing a product.", href: "/live", tint: "#edebff", color: "#5a4bea" },
  { icon: Gavel, title: "Product auctions", body: "Follow scheduled listings and bid with marketplace coins.", href: "/auctions", tint: "#fff2de", color: "#b87513" },
  { icon: Coins, title: "Secure coin wallet", body: "Review your balance, top-ups, and spending in one place.", href: "/wallet", tint: "#e3fbf2", color: "#10876c" },
];
export default function HomePage() {
  return <div className="stack" style={{ gap: 28 }}>
    <section className="hero"><div><span className="eyebrow"><Sparkles size={14}/> A fresh way to shop</span><h1>Good finds.<br/>Real people.<br/><span style={{ color: "#c7d2fe" }}>Live moments.</span></h1><p>Shop products, join live shows, and bid in auctions — all from trusted sellers in one place.</p><HomeActions/></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit"/><div className="hero-cube"><Store size={88} strokeWidth={1.1}/></div><div className="hero-float one"><strong>Live from sellers</strong><span>See what is happening now</span></div><div className="hero-float two"><strong>Secure wallet</strong><span>Every payment confirmed</span></div></div>
    </section>
    <div className="section-head"><div><h2>One marketplace, more ways to discover</h2><p>Real listings, live shows, and auctions — all in one place.</p></div><Link href="/products" className="btn btn-secondary btn-small">Browse all <ArrowRight size={14}/></Link></div>
    <section className="feature-grid">{features.map(({ icon: Icon, title, body, href, tint, color }) => <Link href={href} className="feature-card" key={title}><div className="feature-icon" style={{ background: tint, color }}><Icon size={22}/></div><h3>{title}</h3><p>{body}</p><div className="row" style={{ color: "#4f46e5", fontWeight: 800, fontSize: ".85rem", marginTop: 17 }}>Explore feature <ArrowRight size={15}/></div></Link>)}</section>
    <section className="two-col"><div className="card" style={{ background: "linear-gradient(135deg,#ffffff,#f3f2ff)" }}><div className="feature-icon"><Wallet size={22}/></div><h2 style={{ marginTop: 17 }}>Your wallet, clearly explained</h2><p className="muted" style={{ lineHeight: 1.7 }}>See your balance, top-ups, and spending in one place. Coins are added as soon as your payment is confirmed.</p><Link className="btn btn-primary" href="/wallet">Open wallet <ArrowRight size={16}/></Link></div><div className="card" style={{ background: "linear-gradient(135deg,#ffffff,#eefbf7)" }}><div className="feature-icon" style={{ background: "#d7f8ec", color: "#0f8a70" }}><Video size={22}/></div><h2 style={{ marginTop: 17 }}>Designed for sellers, too</h2><p className="muted" style={{ lineHeight: 1.7 }}>Publish product listings, submit auction requests, and go live with your own shopping stream.</p><div className="row"><Link className="btn btn-secondary" href="/products">List a product</Link><Link className="btn btn-secondary" href="/live">Go live</Link></div></div></section>
  </div>;
}
