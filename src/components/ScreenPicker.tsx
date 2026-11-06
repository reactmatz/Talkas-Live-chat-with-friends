import { AppWindow, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { SCREEN_PRESETS } from "../lib/mesh";
import { native, type ScreenSource } from "../lib/native";
import { session } from "../lib/session";
import { settings } from "../lib/settings";
import { Button, Modal, cx } from "./ui";

/** Discord-style "Go Live" picker: source thumbnails, quality preset, optional system audio. */
export function ScreenPicker({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [tab, setTab] = useState<"screen" | "window">("screen");
  const [picked, setPicked] = useState<string | null>(null);
  const [preset, setPreset] = useState(settings.get().defaultPreset);
  const [audio, setAudio] = useState(true);
  const audioSupported = !native || native.platform === "win32";

  useEffect(() => {
    if (!native) return setSources([]);
    const load = () => native!.screen.sources().then(setSources, () => setSources([]));
    void load();
    const id = setInterval(load, 3_000); // live thumbnails
    return () => clearInterval(id);
  }, []);

  const list = (sources ?? []).filter((s) => s.kind === tab);
  const go = (id: string | null = picked) => {
    void session.startShare(id, SCREEN_PRESETS.find((p) => p.id === preset) ?? SCREEN_PRESETS[1], audio && audioSupported);
    onClose();
  };

  return (
    <Modal title="Share your screen" onClose={onClose} width={720}>
      <div className="flex flex-col gap-4 p-5">
        {native && (
          <>
            <div className="flex gap-1 rounded-lg border border-line bg-canvas p-1">
              {(
                [
                  ["screen", Monitor, "Screens"],
                  ["window", AppWindow, "Applications"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button key={id} onClick={() => setTab(id)} className={cx("flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium", tab === id ? "bg-elevated text-fg" : "text-muted hover:text-fg2")}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div className="grid max-h-[300px] grid-cols-3 gap-3 overflow-y-auto pr-1">
              {sources === null && <p className="col-span-3 py-8 text-center text-sm text-muted">Loading sources…</p>}
              {list.map((src) => (
                <button key={src.id} onClick={() => setPicked(src.id)} onDoubleClick={() => go(src.id)} className={cx("flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors", picked === src.id ? "border-accent bg-accent/10" : "border-line hover:border-faint")}>
                  <img src={src.thumbnail} alt="" className="aspect-video w-full rounded bg-canvas object-contain" />
                  <span className="flex items-center gap-1.5 truncate text-xs text-fg2">
                    {src.icon && <img src={src.icon} alt="" className="size-3.5" />}
                    {src.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold tracking-wider text-muted uppercase">Stream quality</span>
          <div className="grid grid-cols-4 gap-2">
            {SCREEN_PRESETS.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)} className={cx("rounded-md border px-2 py-2 text-xs font-medium", preset === p.id ? "border-accent bg-accent/10 text-fg" : "border-line text-fg2 hover:border-faint")}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">Each viewer receives their own copy (peer to peer), so higher quality uses more upload per person.</p>
        </div>

        <label className={cx("flex items-center gap-2 text-sm", audioSupported ? "text-fg2" : "text-muted")}>
          <input type="checkbox" checked={audio && audioSupported} disabled={!audioSupported} onChange={(e) => setAudio(e.target.checked)} className="accent-[#10b981]" />
          Share system audio {!audioSupported && "(Windows only)"}
        </label>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => go()} disabled={!!native && !picked}>
            Go Live
          </Button>
        </div>
      </div>
    </Modal>
  );
}
