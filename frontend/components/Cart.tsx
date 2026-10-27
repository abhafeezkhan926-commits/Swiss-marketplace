"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShoppingCart, X, Trash2, Minus, Plus, Image as ImageIcon, Coins, ChevronDown, ChevronUp } from "lucide-react";
import { useSession } from "@/components/session";

export const CART_CHANGED_EVENT = "cart:changed";

type CartItem = {
  productId: string;
  title: string;
  description: string;
  category: string;
  image: string;
  priceMinor: number;
  currency: string;
  stock: number;
  quantity: number;
  sellerName: string;
  available: boolean;
};
type CartData = { items: CartItem[]; totalMinor: number; coins: number; currency: string; count: number };
type Envelope<T> = { ok: boolean; data?: T; error?: { message: string } };

function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat("en-CH", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`; }
}

export default function CartButton() {
  const { user, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartData>({ items: [], totalMinor: 0, coins: 0, currency: "chf", count: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/cart", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as Envelope<CartData>;
      if (json.data) setCart(json.data);
    } catch {
      // Header badge stays silent on network errors; the cart drawer shows errors on actions.
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- badge count loads on mount and refreshes on cart changes; state updates only after the awaited API response.
    void load();
    function onChanged() { void load(); }
    window.addEventListener(CART_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CART_CHANGED_EVENT, onChanged);
  }, [load]);

  async function updateQuantity(productId: string, quantity: number) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/cart", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const json = (await response.json()) as Envelope<CartData>;
      if (!response.ok || !json.data) throw new Error(json.error?.message || "Could not update the cart.");
      setCart(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the cart.");
    } finally { setBusy(false); }
  }

  async function checkout() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cart/checkout", { method: "POST" });
      const json = (await response.json()) as Envelope<{ purchase: { coins: number } }>;
      if (!response.ok || !json.data) throw new Error(json.error?.message || "Checkout failed.");
      setCart({ items: [], totalMinor: 0, coins: 0, currency: "chf", count: 0 });
      refresh();
      setNotice(`Purchase complete — ${json.data.purchase.coins} coins spent.`);
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally { setBusy(false); }
  }

  if (!user) return null;

  return <>
    <button className="btn btn-secondary btn-small cart-button" onClick={() => { setOpen(true); setNotice(""); setError(""); void load(); }} title="Cart" aria-label="Open cart">
      <ShoppingCart size={16} />
      {cart.count > 0 && <span className="cart-badge">{cart.count > 99 ? "99+" : cart.count}</span>}
    </button>
    {open && createPortal(<>
      <div className="drawer-backdrop" onClick={() => setOpen(false)} />
      <aside className="cart-drawer" role="dialog" aria-label="Shopping cart">
        <div className="spread cart-drawer-head">
          <h2 style={{ margin: 0 }}>Your cart {cart.count > 0 && <span className="helper">({cart.count})</span>}</h2>
          <button className="btn btn-secondary btn-small" onClick={() => setOpen(false)} aria-label="Close cart"><X size={16} /></button>
        </div>
        {error && <div className="notice error" style={{ margin: "12px 18px 0" }}>{error}</div>}
        {notice && <div className="notice success" style={{ margin: "12px 18px 0" }}>{notice}</div>}
        <div className="cart-drawer-body">
          {!cart.items.length && !notice ? <div className="empty"><ShoppingCart size={28} /><h3>Your cart is empty</h3><p>Add products to see them here.</p></div> : null}
          {cart.items.length > 0 && <div className="stack" style={{ gap: 12 }}>
            {cart.items.map((item) => {
              const expanded = expandedId === item.productId;
              const lineMinor = item.priceMinor * item.quantity;
              return <div className="cart-item" key={item.productId}>
                <div className="cart-item-image">{item.image ? <img src={item.image} alt={item.title} /> : <ImageIcon size={30} strokeWidth={1.3} />}</div>
                <div className="cart-item-body">
                  <div className="spread"><span className="tag">{item.category}</span><span className="tag">{item.quantity} in cart</span></div>
                  <h4>{item.title}</h4>
                  <p className="muted small" style={{ margin: "0 0 10px", lineHeight: 1.55 }}>{item.description.slice(0, 90)}{item.description.length > 90 ? "…" : ""}</p>
                  <div className="spread">
                    <span className="price-tag" style={{ fontSize: "1rem" }}>{money(lineMinor, item.currency)}</span>
                    <span className="helper">{money(item.priceMinor, item.currency)} each</span>
                  </div>
                  {!item.available && <span className="helper" style={{ color: "#dc2626", display: "block", marginTop: 6 }}>Only {item.stock} left in stock</span>}
                  <div className="divider" style={{ margin: "12px 0" }} />
                  <div className="cart-item-controls">
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <button className="btn btn-secondary btn-small" disabled={busy || item.quantity <= 1} onClick={() => void updateQuantity(item.productId, item.quantity - 1)} aria-label="Decrease quantity"><Minus size={13} /></button>
                      <span style={{ minWidth: 20, textAlign: "center", fontWeight: 700 }}>{item.quantity}</span>
                      <button className="btn btn-secondary btn-small" disabled={busy || item.quantity >= item.stock} onClick={() => void updateQuantity(item.productId, item.quantity + 1)} aria-label="Increase quantity"><Plus size={13} /></button>
                    </div>
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <span className="helper">By {item.sellerName}</span>
                      <button className="btn btn-secondary btn-small" disabled={busy} onClick={() => void updateQuantity(item.productId, 0)} aria-label="Remove item"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <button className="cart-details-toggle" onClick={() => setExpandedId(expanded ? null : item.productId)}>
                    {expanded ? <><ChevronUp size={14} />Hide details</> : <><ChevronDown size={14} />View details</>}
                  </button>
                  {expanded && <div className="cart-details">
                    <p className="muted small" style={{ margin: "0 0 8px", lineHeight: 1.6 }}>{item.description}</p>
                    <div className="helper">Seller: {item.sellerName} · Stock: {item.stock}</div>
                    <div className="helper">Line total: <strong>{money(lineMinor, item.currency)}</strong> ({Math.max(1, Math.round(lineMinor / 100))} coins)</div>
                  </div>}
                </div>
              </div>;
            })}
          </div>}
        </div>
        {cart.items.length > 0 && <div className="cart-drawer-footer">
          <div className="spread" style={{ alignItems: "center", marginBottom: 12 }}>
            <div>
              <span className="helper">Total amount</span>
              <strong style={{ display: "block", fontSize: "1.15rem" }}>{money(cart.totalMinor, cart.currency)}</strong>
              <span className="helper">{cart.coins} coins</span>
            </div>
            <button className="btn btn-primary" disabled={busy || cart.items.some((item) => !item.available)} onClick={() => void checkout()}>
              <Coins size={16} />{busy ? "Processing…" : "Buy with coins"}
            </button>
          </div>
          <button className="btn btn-secondary btn-small" style={{ width: "100%" }} disabled={busy} onClick={() => setOpen(false)}>Continue shopping</button>
        </div>}
      </aside>
    </>, document.body)}
  </>;
}

export function notifyCartChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}
