"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Search, PackagePlus, Image as ImageIcon, Plus, LogIn, X, ShoppingCart, Coins, Minus } from "lucide-react";
import { useSession } from "@/components/session";
import { notifyCartChanged } from "@/components/Cart";

type Product = { id: string; title: string; description: string; category: string; images: string[]; priceMinor: number; currency: string; stock: number; seller?: { name: string } | null };
type Envelope<T> = { ok: boolean; data?: T; error?: { message: string } };
function money(minor: number, currency: string) { try { return new Intl.NumberFormat("en-CH", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100); } catch { return `${(minor/100).toFixed(2)} ${currency.toUpperCase()}`; } }
export default function ProductsClient() {
  const { user, refresh } = useSession();
  const [products, setProducts] = useState<Product[]>([]); const [selectedProduct, setSelectedProduct] = useState<Product | null>(null); const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [busy, setBusy] = useState(false); const [purchaseBusy, setPurchaseBusy] = useState(false); const [quantity, setQuantity] = useState(1); const [showForm, setShowForm] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [title,setTitle]=useState(""); const [description,setDescription]=useState(""); const [category,setCategory]=useState("General"); const [price,setPrice]=useState("25"); const [stock,setStock]=useState("1"); const [imageFile,setImageFile]=useState<File|null>(null); const [cartNotice,setCartNotice]=useState("");
  const load = useCallback(async (q: string) => { setBusy(true); setError(""); try { const response=await fetch(`/api/products?q=${encodeURIComponent(q)}&limit=30`,{cache:"no-store"}); const json=(await response.json()) as Envelope<{products:Product[]}>; if(!response.ok||!json.data) throw new Error(json.error?.message||"Unable to load products."); setProducts(json.data.products); } catch(e){setError(e instanceof Error?e.message:"Unable to load products.");} finally{setBusy(false);} },[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- products load on mount and search; state updates only after the awaited API response.
  useEffect(()=>{void load(search);},[load,search]);
  async function createProduct(e:FormEvent){e.preventDefault();setBusy(true);setError("");setNotice("");try{let images:string[]=[];if(imageFile){const form=new FormData();form.append("file",imageFile);const uploadResponse=await fetch("/api/uploads",{method:"POST",body:form});const uploadJson=(await uploadResponse.json()) as Envelope<{secureUrl:string}>;if(!uploadResponse.ok||!uploadJson.data?.secureUrl)throw new Error(uploadJson.error?.message||"Image upload failed.");images=[uploadJson.data.secureUrl];}const response=await fetch("/api/products",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,description,category,priceMinor:Math.round(Number(price)*100),currency:"chf",stock:Number(stock),images,status:"published"})});const json=(await response.json()) as Envelope<{product:{id:string}}>;if(!response.ok||!json.data)throw new Error(json.error?.message||"Could not create product.");setNotice("Your listing is now live.");setTitle("");setDescription("");setPrice("25");setStock("1");setImageFile(null);setShowForm(false);await load(search);}catch(e){setError(e instanceof Error?e.message:"Could not save product.");}finally{setBusy(false);}}
  function openDetails(product: Product) { setSelectedProduct(product); setQuantity(1); setError(""); setCartNotice(""); }
  async function addToCart(product: Product) {
    setPurchaseBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: product.id, quantity }) });
      const json = (await response.json()) as Envelope<{ count: number; items?: { productId: string; quantity: number; stock: number }[] }>;
      if (!response.ok || !json.data) throw new Error(json.error?.message || "Could not add to cart.");
      notifyCartChanged();
      const cartEntry = json.data.items?.find((entry) => entry.productId === product.id);
      if (cartEntry && cartEntry.stock > 0 && cartEntry.quantity >= cartEntry.stock) setCartNotice(`Only ${cartEntry.stock} left in stock — your cart already has all of them.`);
      else setCartNotice(`"${product.title}" added to your cart — ${cartEntry?.quantity ?? quantity} in cart.`);
      setNotice(`"${product.title}" added to your cart.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add to cart."); }
    finally { setPurchaseBusy(false); }
  }
  async function buyNow(product: Product) {
    setPurchaseBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/products/${product.id}/buy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantity }) });
      const json = (await response.json()) as Envelope<{ purchase: { coins: number } }>;
      if (!response.ok || !json.data) throw new Error(json.error?.message || "Purchase failed.");
      refresh();
      setSelectedProduct(null);
      setNotice(`Purchase complete — ${json.data.purchase.coins} coins spent. Thank you!`);
    } catch (e) { setError(e instanceof Error ? e.message : "Purchase failed."); }
    finally { setPurchaseBusy(false); }
  }
  return <div className="stack" style={{gap:24}}><div className="page-heading"><div><span className="eyebrow"><PackagePlus size={14}/> Product catalog</span><h1 style={{marginTop:14}}>Discover products</h1><p>{user?"Search marketplace listings or add your own.":"Search published marketplace listings."}</p></div>{user?<button className="btn btn-primary" onClick={()=>setShowForm(v=>!v)}><Plus size={17}/>{showForm?"Close form":"Add product"}</button>:<a className="btn btn-secondary" href="/login"><LogIn size={16}/>Sign in to sell</a>}</div>
    {error&&<div className="notice error">{error}</div>}{notice&&<div className="notice success">{notice}</div>}
    {showForm&&<section className="card"><h2>Create a product listing</h2><p className="muted small">Add photos and details to publish your item.</p><form onSubmit={createProduct} className="two-col"><div><div className="field"><label>Product title</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} minLength={3} maxLength={120} required/></div><div className="field"><label>Category</label><input className="input" value={category} onChange={e=>setCategory(e.target.value)} maxLength={60} required/></div><div className="field"><label>Price (CHF)</label><input className="input" value={price} onChange={e=>setPrice(e.target.value)} type="number" min="0.01" step="0.01" required/></div><div className="field"><label>Stock quantity</label><input className="input" value={stock} onChange={e=>setStock(e.target.value)} type="number" min="0" step="1" required/></div><div className="field"><label>Product image (optional)</label><input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setImageFile(e.target.files?.[0]||null)}/><span className="helper">JPEG, PNG, or WebP.</span></div></div><div><div className="field"><label>Description</label><textarea className="textarea" value={description} onChange={e=>setDescription(e.target.value)} minLength={10} maxLength={5000} required/></div><div className="notice">Optional images are uploaded securely and attached to your listing.</div><button className="btn btn-primary" type="submit" disabled={busy} style={{marginTop:15}}>{busy?"Saving…":"Save listing"}</button></div></form></section>}
    <form onSubmit={e=>{e.preventDefault();setSearch(query.trim());}} className="row" style={{alignItems:"stretch"}}><div style={{flex:1,minWidth:200,position:"relative"}}><Search size={17} style={{position:"absolute",left:13,top:14,color:"#8892a6"}}/><input className="input" style={{paddingLeft:40}} placeholder="Search products, categories, descriptions…" value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="btn btn-secondary" type="submit">Search</button></form>
    {selectedProduct&&<div className="modal-backdrop" onClick={()=>setSelectedProduct(null)}>
      <div className="modal-card product-modal" role="dialog" aria-label={selectedProduct.title} onClick={(e)=>e.stopPropagation()}>
        <div className="spread" style={{alignItems:"center"}}><span className="tag">{selectedProduct.category}</span><button className="btn btn-secondary btn-small" onClick={()=>setSelectedProduct(null)} aria-label="Close product details"><X size={16}/></button></div>
        <div className="product-modal-body">
          <div className="product-modal-image">{selectedProduct.images[0]?<img src={selectedProduct.images[0]} alt={selectedProduct.title}/>:<ImageIcon size={52} strokeWidth={1.2}/>}</div>
          <div>
            <h2 style={{margin:"4px 0 8px"}}>{selectedProduct.title}</h2>
            <p className="muted" style={{lineHeight:1.65}}>{selectedProduct.description}</p>
            <strong className="price-tag" style={{fontSize:"1.35rem"}}>{money(selectedProduct.priceMinor,selectedProduct.currency)}</strong>
            <p className="helper" style={{marginTop:8}}>{selectedProduct.stock} in stock · Seller: {selectedProduct.seller?.name||"Marketplace seller"}</p>
            {user?<>
              <div className="row" style={{gap:10,alignItems:"center",marginTop:16}}>
                <span className="helper">Quantity</span>
                <div className="row" style={{gap:6,alignItems:"center"}}>
                  <button className="btn btn-secondary btn-small" disabled={purchaseBusy||quantity<=1} onClick={()=>setQuantity((value)=>Math.max(1,value-1))} aria-label="Decrease quantity"><Minus size={13}/></button>
                  <span style={{minWidth:24,textAlign:"center",fontWeight:700}}>{quantity}</span>
                  <button className="btn btn-secondary btn-small" disabled={purchaseBusy||quantity>=selectedProduct.stock} onClick={()=>setQuantity((value)=>Math.min(selectedProduct.stock,value+1))} aria-label="Increase quantity"><Plus size={13}/></button>
                </div>
              </div>
              <div className="row" style={{gap:10,marginTop:16,flexWrap:"wrap"}}>
                <button className="btn btn-secondary" disabled={purchaseBusy||selectedProduct.stock<1} onClick={()=>void addToCart(selectedProduct)}><ShoppingCart size={16}/>{purchaseBusy?"Working…":"Add to cart"}</button>
                <button className="btn btn-primary" disabled={purchaseBusy||selectedProduct.stock<1} onClick={()=>void buyNow(selectedProduct)}><Coins size={16}/>{purchaseBusy?"Processing…":`Buy now with ${Math.max(1,Math.round(selectedProduct.priceMinor*quantity/100))} coins`}</button>
              </div>
              {cartNotice&&<div className="notice success" style={{marginTop:14}}>{cartNotice}</div>}
            </>:<a className="btn btn-primary" href="/login" style={{marginTop:16}}><LogIn size={16}/>Sign in to buy or add to cart</a>}
          </div>
        </div>
      </div>
    </div>}
    {busy&&!products.length?<div className="empty">Loading products…</div>:products.length?<div className="product-grid">{products.map(p=><article className="product-card" key={p.id}><div className="product-image">{p.images[0]?<img src={p.images[0]} alt={p.title}/>:<ImageIcon size={48} strokeWidth={1.3}/>}</div><div className="product-body"><span className="tag">{p.category}</span><h3>{p.title}</h3><p className="muted small" style={{minHeight:44,lineHeight:1.55}}>{p.description.slice(0,110)}{p.description.length>110?"…":""}</p><div className="spread"><span className="price-tag">{money(p.priceMinor,p.currency)}</span><span className="tag">{p.stock} in stock</span></div><div className="divider"/><div className="spread"><span className="helper">By {p.seller?.name||"Marketplace seller"}</span><button className="btn btn-soft btn-small" onClick={()=>openDetails(p)}>View details</button></div></div></article>)}</div>:<div className="empty"><PackagePlus size={29}/><h3>{busy?"Loading…":"No products found"}</h3><p>Try another search or check back soon.</p></div>}
  </div>;
}
