"use client";
import { useState } from "react";
import { LiveKitRoom, VideoConference, useParticipants, useLocalParticipant } from "@livekit/components-react";
import { DisconnectReason, MediaDeviceFailure } from "livekit-client";
import { Flag, X } from "lucide-react";

type Props = { token: string; serverUrl: string; publish: boolean; onClose: () => void };

// Front camera on phones and the default webcam on desktop.
const FRONT_CAMERA = { facingMode: "user" as const, resolution: { width: 1280, height: 720 } };
const MICROPHONE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

const REPORT_REASONS = [
  { value: "scam_fraud", label: "Scam or fraud" },
  { value: "abusive_or_sexual_content", label: "Abusive or sexual content" },
  { value: "other", label: "Other" },
] as const;

function mediaFailureText(failure?: MediaDeviceFailure, kind?: MediaDeviceKind) {
  const device = kind === "audioinput" ? "microphone" : "camera";
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `Your browser blocked ${device} access. Select the camera/microphone icon in the address bar, allow access, then choose Try again.`;
    case MediaDeviceFailure.NotFound:
      return `No ${device} was found. Connect one, then choose Try again.`;
    case MediaDeviceFailure.DeviceInUse:
      return `Your ${device} is being used by another app. Close the other app, then choose Try again.`;
    default:
      return `Your ${device} could not be started. Check your browser permissions, then choose Try again.`;
  }
}

function ReportPanel({ onClose }: { onClose: () => void }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [target, setTarget] = useState<{ identity: string; name: string } | null>(null);
  const [reason, setReason] = useState<string>("scam_fraud");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const localIdentity = localParticipant?.identity || "";
  const others = participants.filter((participant) => participant.identity && participant.identity !== localIdentity);

  async function submitReport() {
    if (!target) return;
    if (reason === "other" && explanation.trim().length < 5) {
      setError("Please explain reports marked Other.");
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "user", targetId: target.identity, reason, explanation: explanation.trim() }),
      });
      const json = (await response.json()) as { ok: boolean; error?: { message: string } };
      if (!response.ok || !json.ok) throw new Error(json.error?.message || "Could not submit the report.");
      setDone(`Report submitted for ${target.name}. Our team will review it.`);
      setTarget(null);
      setExplanation("");
      setReason("scam_fraud");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the report.");
    } finally { setBusy(false); }
  }

  return <div className="report-panel">
    <div className="modal-card report-card" role="dialog" aria-label="Report a participant" onClick={(e) => e.stopPropagation()}>
      <div className="spread" style={{ alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Report a participant</h3>
        <button className="btn btn-secondary btn-small" onClick={onClose} aria-label="Close report panel"><X size={15} /></button>
      </div>
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      {done && <div className="notice success" style={{ marginTop: 12 }}>{done}</div>}
      {!target ? <>
        <p className="helper" style={{ marginTop: 10 }}>Choose who you want to report.</p>
        <div className="stack" style={{ gap: 8, marginTop: 10, maxHeight: 260, overflow: "auto" }}>
          {others.length === 0 && <div className="helper">No other participants are in this room yet.</div>}
          {others.map((participant) => <div className="spread report-row" key={participant.identity}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{participant.name || participant.identity}</span>
            <button className="btn btn-secondary btn-small" onClick={() => { setTarget({ identity: participant.identity, name: participant.name || participant.identity }); setError(""); }}><Flag size={14} />Report</button>
          </div>)}
        </div>
      </> : <>
        <p style={{ marginTop: 12 }}>Reporting <strong>{target.name}</strong></p>
        <div className="field"><label htmlFor="report-reason">Reason</label>
          <select id="report-reason" className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="report-explanation">Details (optional)</label>
          <textarea id="report-explanation" className="textarea" value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={2000} placeholder="Tell us what happened…" />
        </div>
        <div className="row" style={{ gap: 10, marginTop: 6 }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => void submitReport()}>{busy ? "Sending…" : "Submit report"}</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => { setTarget(null); setError(""); }}>Back</button>
        </div>
      </>}
    </div>
  </div>;
}

export default function LiveRoom({ token, serverUrl, publish, onClose }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [connected, setConnected] = useState(false);
  const [wasConnected, setWasConnected] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [openReport, setOpenReport] = useState(false);

  function retry() {
    setConnected(false);
    setWasConnected(false);
    setMediaError("");
    setConnectionError("");
    setAttempt((value) => value + 1);
  }

  const problem = publish ? mediaError || connectionError : connectionError;
  const helper = publish
    ? connected
      ? "You are live with your front camera and microphone. Use the controls below to mute or stop your video."
      : "Connecting to your live room. Your browser will ask for camera and microphone access."
    : connected
      ? "You are connected as a viewer."
      : "Connecting to the live stream…";

  return <div className="card" style={{ padding: 10 }}>
    <div className="spread" style={{ padding: "8px 9px 13px", gap: 12, flexWrap: "wrap" }}>
      <div>
        <strong>{publish ? "Your live room" : "Watching live"}</strong>
        <p className="helper" style={{ margin: "4px 0 0" }}>{helper}</p>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-small" onClick={() => setOpenReport(true)}><Flag size={15} />Report</button>
        <button className="btn btn-secondary btn-small" onClick={onClose}>{publish ? "End stream" : "Leave room"}</button>
      </div>
    </div>
    {publish && problem && <div className="notice error" style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span>{problem}</span>
      <button type="button" className="btn btn-secondary btn-small" onClick={retry}>Try again</button>
    </div>}
    <div style={{ overflow: "hidden", borderRadius: 15, minHeight: 400, background: "#111827", position: "relative" }}>
      <LiveKitRoom
        key={attempt}
        token={token}
        serverUrl={serverUrl}
        connect
        audio={publish ? MICROPHONE : false}
        video={publish ? FRONT_CAMERA : false}
        data-lk-theme="default"
        style={{ height: "min(70vh, 650px)" }}
        onConnected={() => { setConnected(true); setWasConnected(true); }}
        onDisconnected={(reason) => {
          setConnected(false);
          if (reason === DisconnectReason.CLIENT_INITIATED) return;
          setConnectionError(wasConnected
            ? "The live room disconnected. Check your internet connection, then choose Try again."
            : "Could not open the live room. The video service may be temporarily unavailable. Choose Try again in a moment.");
        }}
        onMediaDeviceFailure={(failure, kind) => setMediaError(mediaFailureText(failure, kind))}
        onError={(error) => {
          if (MediaDeviceFailure.getFailure(error)) return;
          setConnectionError("Could not open the live room. The video service may be temporarily unavailable. Choose Try again in a moment.");
        }}
      >
        <VideoConference />
        {openReport && <ReportPanel onClose={() => setOpenReport(false)} />}
      </LiveKitRoom>
    </div>
  </div>;
}
