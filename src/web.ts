import { bridge } from "./native";
import type { Clip } from "./app";

/** Browser fallback. A web page cannot watch the system clipboard — that is the
 *  entire reason this template is native — so the preview shows a seeded
 *  history and writes through `navigator.clipboard` when you hit copy. */
const now = Date.now();
const seed: Clip[] = [
  { at: now - 12e3, kind: "url", text: "https://github.com/hanzo-templates/desktop-tray" },
  { at: now - 90e3, kind: "code", text: 'const call = bridge({ history: () => clips });' },
  { at: now - 240e3, kind: "shell", text: "cargo tauri build --target aarch64-apple-darwin" },
  { at: now - 900e3, kind: "text", text: "Tray apps are the one desktop shape the web has no answer for: no window, no tab, always resident." },
  { at: now - 3600e3, kind: "code", text: "#[tauri::command]\nfn history(state: State<'_, Clips>) -> Vec<Clip> {\n    state.0.lock().unwrap().clone()\n}" },
];
let clips = seed;

export const call = bridge({
  history: () => clips,
  clear: () => { clips = []; },
  copy: ({ text }: { text: string }) => { navigator.clipboard?.writeText(text); },
});
