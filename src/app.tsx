import { useEffect, useMemo, useState } from "react";
import { Win, NavItem } from "./shell";
import { isNative } from "./native";
import { call } from "./web";

const RELEASES = "https://github.com/hanzo-templates/desktop-tray/releases/latest";

export type Clip = { at: number; text: string; kind: string };

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};

export default function App() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [note, setNote] = useState("");

  useEffect(() => {
    const tick = () => call("history").then(setClips);
    tick();
    const iv = setInterval(tick, 1200);
    return () => clearInterval(iv);
  }, []);

  const kinds = useMemo(
    () => ["all", ...Array.from(new Set(clips.map((c) => c.kind)))],
    [clips],
  );
  const shown = clips.filter(
    (c) => (kind === "all" || c.kind === kind) && c.text.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Win
      title="Tray"
      sub="clipboard history"
      releases={RELEASES}
      status={
        <>
          <span>⌘⇧V summons the window</span>
          <span className="grow" />
          {note && <span>{note}</span>}
          <span>{clips.length} clips</span>
          <span>{isNative ? "tray + global shortcut" : "sample history"}</span>
        </>
      }
      actions={
        <button className="btn" onClick={async () => { await call("clear"); setClips([]); }}>
          clear
        </button>
      }
      side={
        <>
          <input className="inp" placeholder="filter" value={q} onChange={(e) => setQ(e.target.value)} />
          <h2>Kind</h2>
          <nav className="nav">
            {kinds.map((k) => (
              <NavItem key={k} on={k === kind} onClick={() => setKind(k)}
                       tail={k === "all" ? clips.length : clips.filter((c) => c.kind === k).length}>
                {k}
              </NavItem>
            ))}
          </nav>
          <h2>How it works</h2>
          <p className="dim" style={{ fontSize: 11, padding: "0 8px" }}>
            A Rust thread polls the system clipboard every 800 ms and keeps the
            last 200 distinct entries in memory. The window lives in the tray:
            closing it hides, it never quits.
          </p>
        </>
      }
    >
      <h3>History</h3>
      <div className="grid" style={{ marginTop: 12 }}>
        {shown.length === 0 && <div className="empty">nothing captured yet — copy something</div>}
        {shown.map((c) => (
          <div className="card" key={c.at + c.text.slice(0, 12)}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="tag">{c.kind}</span>
              <span className="dim mono" style={{ fontSize: 11 }}>{ago(c.at)} ago</span>
              <span className="grow" />
              <button className="btn" onClick={async () => {
                await call("copy", { text: c.text });
                setNote("copied");
                setTimeout(() => setNote(""), 1200);
              }}>copy</button>
            </div>
            <div className="mono" style={{
              fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 96, overflow: "hidden", color: "var(--fg-2)",
            }}>
              {c.text}
            </div>
          </div>
        ))}
      </div>
    </Win>
  );
}
