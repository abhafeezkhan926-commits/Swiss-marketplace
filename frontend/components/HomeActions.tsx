"use client";

import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { useSession } from "@/components/session";

export default function HomeActions() {
  const { user } = useSession();
  return <div className="row" style={{ marginTop: 24 }}>
    <Link className="btn" href="/products" style={{ background: "white", color: "#3730a3" }}>Explore marketplace <ArrowRight size={17} /></Link>
    {user
      ? <Link className="btn" href="/wallet" style={{ borderColor: "#ffffff70", color: "white", background: "#ffffff1c" }}><Wallet size={17} /> Open wallet</Link>
      : <Link className="btn" href="/login?mode=register" style={{ borderColor: "#ffffff70", color: "white", background: "#ffffff1c" }}>Create account</Link>}
  </div>;
}
