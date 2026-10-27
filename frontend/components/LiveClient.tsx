"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Radio, Video, Users, RefreshCw, Play, LogIn } from "lucide-react";
import { useSession } from "@/components/session";
const LiveRoom = dynamic(() => import("@/components/LiveRoom"), { ssr: false });
type Stream = { id: string; roomName: string; title: string; thumbnailUrl: string; productIds: string[]; status: string; startedAt: string | null; seller: string; isOwner: boolean };
type Envelope<T> = { ok: boolean; data?: T; error?: { message: string } };
type RoomData = { token: string; serverUrl: string; roomName: string };
export default function LiveClient() {
  const { user, ready } = useSession();
  const [streams, setStreams] = useState<Stream[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [title, setTitle] = useState(""); const [showForm, setShowForm] = useState(false); const [room, setRoom] = useState<RoomData | null>(null); const [activeStreamId, setActiveStreamId] = useState(""); const [isPublisher, setIsPublisher] = useState(false); const [connecting, setConnecting] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null); const [thumbnailPreview, setThumbnailPreview] = useState(""); const previewUrlRef = useRef("");
  const ownStream = streams.find((stream) => stream.isOwner);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);
  function pickThumbnail(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const preview = file ? URL.createObjectURL(file) : "";
    previewUrlRef.current = preview;
    setThumbnailFile(file);
    setThumbnailPreview(preview);
  }
  const load = useCallback(async () => { setBusy(true); setError(""); try { const r = await fetch("/api/live", { cache: "no-store" }); const j = (await r.json()) as Envelope<{ streams: Stream[] }>; if (!r.ok || !j.data) throw new Error(j.error?.message || "Could not load live streams."); setStreams(j.data.streams); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load live streams."); } finally { setBusy(false); } }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial stream list fetch; state updates only after the awaited API response.
  useEffect(() => { void load(); }, [load]);
  async function createStream(e: FormEvent) {
    e.preventDefault();
    if (!thumbnailFile) { setError("Choose a thumbnail image for your stream."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", thumbnailFile);
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: uploadForm });
      const uploadJson = (await uploadResponse.json()) as Envelope<{ secureUrl: string }>;
      if (!uploadResponse.ok || !uploadJson.data?.secureUrl) throw new Error(uploadJson.error?.message || "Could not upload the thumbnail.");
      const r = await fetch("/api/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, thumbnailUrl: uploadJson.data.secureUrl, productIds: [] }) });
      const j = (await r.json()) as Envelope<{ stream: Stream }>;
      if (!r.ok || !j.data) throw new Error(j.error?.message || "Could not start stream.");
      await connect(j.data.stream.roomName, true, j.data.stream.id);
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = ""; }
      setTitle(""); setThumbnailFile(null); setThumbnailPreview(""); setShowForm(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start stream."); }
    finally { setBusy(false); }
  }
  async function connect(roomName: string, publish: boolean, streamId = "") { setError(""); setConnecting(roomName); try { const r = await fetch("/api/livekit/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomName, publish }) }); const j = (await r.json()) as Envelope<RoomData>; if (!r.ok || !j.data) throw new Error(j.error?.message || "Could not connect to stream."); setRoom(j.data); setIsPublisher(publish); setActiveStreamId(streamId); } catch (e) { setError(e instanceof Error ? e.message : "Could not connect to this stream."); } finally { setConnecting(""); } }
  async function endStream() {
    const shouldEndStream = isPublisher && activeStreamId;
    setRoom(null); setActiveStreamId(""); setIsPublisher(false);
    if (!shouldEndStream) return;
    setNotice("Your stream has ended.");
    try { await fetch(`/api/live/${activeStreamId}`, { method: "PATCH" }); } catch { /* the stream still ends for this tab even if the request fails */ }
    await load();
  }
  return <div className="stack" style={{ gap: 24 }}>
    <div className="page-heading"><div><span className="eyebrow"><Radio size={14}/> Live shopping</span><h1 style={{ marginTop: 14 }}>Live right now</h1><p>Join live product streams and shop in real time.</p></div><div className="row"><button className="btn btn-secondary" onClick={() => void load()}><RefreshCw size={16}/>Refresh</button>{!ready ? <button className="btn btn-secondary" disabled>Checking session…</button> : user ? <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}><Video size={16}/>{showForm ? "Close" : "Start a stream"}</button> : <Link className="btn btn-primary" href="/login"><LogIn size={16}/>Sign in to go live</Link>}</div></div>
    {error && <div className="notice error">{error}</div>}{notice && <div className="notice success">{notice}</div>}
    {ownStream && !room && <div className="notice success" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><span><strong>Your stream is live.</strong> Open it as the host to share your camera and microphone.</span><button className="btn btn-primary btn-small" disabled={connecting !== ""} onClick={() => void connect(ownStream.roomName, true, ownStream.id)}><Video size={16}/>{connecting === ownStream.roomName ? "Connecting…" : "Go live on camera"}</button></div>}
    {room && <LiveRoom token={room.token} serverUrl={room.serverUrl} publish={isPublisher} onClose={() => void endStream()}/>}
    {showForm && <section className="card"><h2>Start a livestream</h2><p className="muted small">Add a thumbnail, give your stream a title, then go live with your camera and microphone.</p><form className="live-form" onSubmit={createStream}>
      <div className="field live-form-title"><label htmlFor="stream-title">Stream title</label><input id="stream-title" className="input" value={title} onChange={e => setTitle(e.target.value)} minLength={3} maxLength={120} required placeholder="What are you showing today?"/></div>
      <div className="field live-form-thumbnail"><label htmlFor="stream-thumbnail">Thumbnail image</label><input id="stream-thumbnail" className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={pickThumbnail} required/><div className="helper">JPG, PNG, or WebP. Shown on the live listing.</div>{thumbnailPreview && <img src={thumbnailPreview} alt="Selected thumbnail preview" className="live-thumbnail-preview"/>}</div>
      <div className="live-form-submit"><span className="live-form-label" aria-hidden="true">Go live</span><button className="btn btn-primary" type="submit" disabled={busy}><Play size={16}/>{busy ? "Starting…" : "Go live"}</button></div>
    </form></section>}
    {streams.length ? <div className="product-grid">{streams.map(s => <article className="product-card" key={s.id}><div className="product-image" style={{ position: "relative" }}>{s.thumbnailUrl ? <img src={s.thumbnailUrl} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/> : <div style={{ width: 88, height: 88, display: "grid", placeItems: "center", borderRadius: 28, background: "linear-gradient(135deg,#5146e5,#c084fc)", color: "white" }}><Radio size={40}/></div>}<span className="tag live" style={{ position: "absolute", top: 14, left: 14 }}>● LIVE</span></div><div className="product-body"><h3>{s.title}</h3><p className="muted small">Hosted by {s.isOwner ? "you" : s.seller}</p><div className="spread small muted"><span><Users size={14} style={{ display: "inline", verticalAlign: "-3px", marginRight: 4 }}/>Live shopping</span><span>{s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : "Live"}</span></div>{s.isOwner ? <button className="btn btn-primary" style={{ width: "100%", marginTop: 15 }} disabled={connecting !== ""} onClick={() => void connect(s.roomName, true, s.id)}><Video size={16}/>{connecting === s.roomName ? "Connecting…" : "Go live on camera"}</button> : !ready ? <button className="btn btn-secondary" style={{ width: "100%", marginTop: 15 }} disabled>Checking session…</button> : user ? <button className="btn btn-primary" style={{ width: "100%", marginTop: 15 }} disabled={connecting !== ""} onClick={() => void connect(s.roomName, false, s.id)}><Play size={16}/>{connecting === s.roomName ? "Connecting…" : "Join stream"}</button> : <Link className="btn btn-primary" style={{ width: "100%", marginTop: 15 }} href="/login"><LogIn size={16}/>Sign in to watch</Link>}</div></article>)}</div> : <div className="empty"><Radio size={31}/><h3>{busy ? "Loading live streams…" : "No livestreams are active"}</h3><p>{error ? "Live streams are unavailable right now." : user ? "Check back soon or start your own stream." : "Check back soon for live shows."}</p></div>}
  </div>;
}
