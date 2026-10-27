import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="feature-icon" style={{ margin: "0 auto", width: 64, height: 64, borderRadius: 22 }}>
          <Compass size={30} />
        </div>
        <p className="eyebrow" style={{ justifyContent: "center" }}>404 · Page not found</p>
        <h1>This page does not exist</h1>
        <p>The address may have changed, or the page is not available for your account.</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
          <Link href="/" className="btn btn-primary"><Home size={16} />Back home</Link>
          <Link href="/products" className="btn btn-secondary"><Search size={16} />Browse products</Link>
        </div>
      </div>
    </div>
  );
}
