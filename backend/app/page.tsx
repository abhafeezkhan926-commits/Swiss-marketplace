export default function ApiHomePage() {
  return (
    <main style={{maxWidth:720, margin:"0 auto", background:"white", border:"1px solid #e2e8f0", borderRadius:20, padding:32}}>
      <p style={{color:"#4f46e5", fontWeight:700}}>MARKETHAUS · BACKEND</p>
      <h1>Marketplace API service</h1>
      <p>The backend service is running. API endpoints use the <code>/api</code> prefix.</p>
      <p><a href="/api/health">Open health check</a></p>
      <p style={{color:"#64748b", fontSize:14}}>Configure MongoDB and optional Stripe, Cloudinary, and LiveKit credentials in the backend environment before testing protected features.</p>
    </main>
  );
}
