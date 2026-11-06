import { Bell, Check, Cpu, ImagePlus, Mic, Palette, Search, UserCircle, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAX_BIO_LENGTH, type Profile } from "../../shared/protocol";
import { SCREEN_PRESETS } from "../lib/mesh";
import { session, useSession } from "../lib/session";
import { settings, useSettings } from "../lib/settings";
import { sounds } from "../lib/sounds";
import { Avatar, Button, cx } from "./ui";

type SectionId = "profile" | "voice" | "sounds" | "appearance" | "advanced";
const SECTIONS: { id: SectionId; group: string; label: string; icon: LucideIcon; keywords: string }[] = [
  { id: "profile", group: "User Settings", label: "Profile", icon: UserCircle, keywords: "name avatar picture bio about banner color" },
  { id: "voice", group: "App Settings", label: "Voice & Video", icon: Mic, keywords: "microphone input output speaker headset camera noise echo gain stream quality test" },
  { id: "sounds", group: "App Settings", label: "Sounds", icon: Bell, keywords: "join leave mute message notification" },
  { id: "appearance", group: "App Settings", label: "Appearance", icon: Palette, keywords: "zoom scale compact chat density video participants" },
  { id: "advanced", group: "App Settings", label: "Advanced", icon: Cpu, keywords: "stun internet nat reset version" },
];

/** Full-screen settings, Discord layout: searchable nav on the left, section on the right. Esc closes. */
export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionId>("profile");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement)?.closest("input, textarea, select") && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const visible = SECTIONS.filter((s) => !query.trim() || `${s.label} ${s.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="animate-pop fixed inset-x-0 top-8 bottom-0 z-40 flex bg-canvas">
      <nav className="flex w-[260px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-panel px-3 py-4">
        <div className="mb-2 flex items-center gap-2 rounded-md border border-line bg-canvas px-2.5">
          <Search size={16} className="text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
        </div>
        {["User Settings", "App Settings"].map((g) => {
          const items = visible.filter((s) => s.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="mt-2 flex flex-col gap-0.5 border-t border-line pt-3 first-of-type:border-0">
              <div className="px-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">{g}</div>
              {items.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setSection(id)} className={cx("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[15px]", section === id ? "bg-elevated text-fg" : "text-fg2 hover:bg-hover hover:text-fg")}>
                  <Icon size={18} /> {label}
                </button>
              ))}
            </div>
          );
        })}
        {visible.length === 0 && <p className="px-2 py-4 text-sm text-muted">No settings match “{query}”.</p>}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 px-8">
          <span className="text-fg2">Settings</span>
          <span className="text-muted">/</span>
          <current.icon size={17} />
          <span className="font-semibold">{current.label}</span>
          <div className="flex-1" />
          <button onClick={onClose} title="Close (Esc)" className="flex flex-col items-center gap-0.5 text-fg2 hover:text-fg">
            <span className="flex size-8 items-center justify-center rounded-full border border-faint">
              <X size={16} />
            </span>
            <span className="text-[10px] font-semibold">ESC</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10">
          <div className="mx-auto max-w-[880px] rounded-xl border border-line bg-panel p-7">
            {section === "profile" && <ProfileSection />}
            {section === "voice" && <VoiceSection />}
            {section === "sounds" && <SoundsSection />}
            {section === "appearance" && <AppearanceSection />}
            {section === "advanced" && <AdvancedSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ building blocks

function Title({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-fg2">{subtitle}</p>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const input = "h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-accent/60";

function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 py-2 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className={cx("mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-accent" : "bg-faint")}>
        <span className={cx("size-5 rounded-full bg-fg transition-transform", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ------------------------------------------------------------------ profile

const BANNERS = ["#1b1e23", "#1e3a5f", "#3b2a63", "#5b2340", "#614019", "#1f4d3a", "#3d4451"];

/** Resize to a 128 px square JPEG so the avatar stays small enough to share with everyone. */
async function toAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function ProfileSection() {
  const st = useSettings();
  const s = useSession();
  const [draft, setDraft] = useState<Profile>(st.profile);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(st.profile);
  const set = (p: Partial<Profile>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    const profile = { ...draft, name: draft.name.trim() || "Guest" };
    settings.update({ profile });
    if (s.status === "open") session.updateProfile(profile);
  };

  return (
    <>
      <Title title="Profile" subtitle="Your name, picture and bio. Everyone in the server sees them." />
      <div className="grid gap-8 md:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-5">
          <Field label="Display name">
            <div className="relative">
              <input value={draft.name} maxLength={32} onChange={(e) => set({ name: e.target.value })} className={input} />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">{draft.name.length}/32</span>
            </div>
          </Field>
          <Field label="About me">
            <div className="relative">
              <textarea value={draft.bio} maxLength={MAX_BIO_LENGTH} onChange={(e) => set({ bio: e.target.value })} rows={4} placeholder="Tell your friends about yourself…" className={cx(input, "h-auto resize-none py-2.5")} />
              <span className="absolute right-3 bottom-2 text-xs text-muted">
                {draft.bio.length}/{MAX_BIO_LENGTH}
              </span>
            </div>
          </Field>
          <Field label="Name color">
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={359} value={draft.hue} onChange={(e) => set({ hue: Number(e.target.value) })} className="flex-1 accent-[#10b981]" />
              <span className="w-24 truncate text-sm font-semibold" style={{ color: `hsl(${draft.hue} 60% 70%)` }}>
                {draft.name || "Guest"}
              </span>
            </div>
          </Field>
          <Field label="Banner color">
            <div className="flex flex-wrap gap-2">
              {BANNERS.map((c) => (
                <button key={c} type="button" onClick={() => set({ banner: c })} aria-label={c} className={cx("size-9 rounded-md border-2", draft.banner === c ? "border-accent" : "border-transparent")} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>

        <div className="flex flex-col gap-4">
          {/* live preview card */}
          <div className="overflow-hidden rounded-xl border border-line bg-canvas">
            <div className="h-20" style={{ background: draft.banner }} />
            <div className="-mt-9 px-4 pb-4">
              <div className="w-fit rounded-full border-[5px] border-canvas">
                <Avatar name={draft.name || "Guest"} hue={draft.hue} src={draft.avatar} size={72} />
              </div>
              <div className="mt-2 text-lg font-bold" style={{ color: `hsl(${draft.hue} 60% 75%)` }}>
                {draft.name || "Guest"}
              </div>
              {draft.bio && <p className="mt-2 border-t border-line pt-2 text-[13px] whitespace-pre-wrap text-fg2">{draft.bio}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Profile picture</span>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return setErr("Images up to 5 MB.");
                try {
                  setErr(null);
                  set({ avatar: await toAvatar(f) });
                } catch {
                  setErr("Couldn't read that image.");
                }
              }}
            />
            <div className="flex gap-2">
              <Button onClick={() => file.current?.click()}>
                <ImagePlus size={15} /> Change avatar
              </Button>
              {draft.avatar && (
                <Button variant="ghost" onClick={() => set({ avatar: null })}>
                  Remove
                </Button>
              )}
            </div>
            <span className="text-xs text-muted">PNG, JPG or WebP, up to 5 MB. Shown at 128 px.</span>
            {err && <span className="text-xs text-red">{err}</span>}
          </div>
        </div>
      </div>

      {dirty && (
        <div className="animate-pop sticky bottom-0 mt-6 flex items-center gap-3 rounded-lg border border-line bg-elevated px-4 py-3 shadow-xl">
          <span className="flex-1 text-sm">Careful — you have unsaved changes!</span>
          <Button variant="ghost" onClick={() => setDraft(st.profile)}>
            Reset
          </Button>
          <Button variant="primary" onClick={save}>
            Save Changes
          </Button>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ voice & video

function useDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => navigator.mediaDevices.enumerateDevices().then(setDevices, () => {});
    void load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener("devicechange", load);
  }, []);
  return devices;
}

function VoiceSection() {
  const st = useSettings();
  const devices = useDevices();
  const list = (kind: MediaDeviceKind) => [
    { value: "", label: "Default" },
    ...devices.filter((d) => d.kind === kind && d.deviceId !== "default" && d.deviceId).map((d, i) => ({ value: d.deviceId, label: d.label || `Device ${i + 1}` })),
  ];
  const audio = (patch: Partial<typeof st>) => {
    settings.update(patch);
    void session.applyAudioSettings(); // re-captures the mic live if you're in a call
  };

  return (
    <>
      <Title title="Voice & Video" subtitle="Devices and audio processing. Changes apply right away, even during a call." />
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Input device">
          <Select value={st.inputDevice} onChange={(v) => audio({ inputDevice: v })} options={list("audioinput")} />
        </Field>
        <Field label="Output device">
          <Select value={st.outputDevice} onChange={(v) => settings.update({ outputDevice: v })} options={list("audiooutput")} />
        </Field>
      </div>
      <MicTest />

      <div className="mt-6 divide-y divide-line border-t border-line">
        <Switch label="Echo cancellation" hint="Removes your speakers' sound from your mic." checked={st.echoCancellation} onChange={(v) => audio({ echoCancellation: v })} />
        <Switch label="Noise suppression" hint="Filters keyboard, fans and background noise." checked={st.noiseSuppression} onChange={(v) => audio({ noiseSuppression: v })} />
        <Switch label="Automatic gain control" hint="Keeps your volume steady when you move away from the mic." checked={st.autoGainControl} onChange={(v) => audio({ autoGainControl: v })} />
      </div>

      <h3 className="mt-8 mb-4 border-t border-line pt-6 text-[15px] font-semibold">Video & streaming</h3>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Camera" hint="Used the next time you turn on video.">
          <Select value={st.cameraDevice} onChange={(v) => settings.update({ cameraDevice: v })} options={list("videoinput")} />
        </Field>
        <Field label="Default stream quality" hint="Pre-selected when you Go Live.">
          <Select value={st.defaultPreset} onChange={(v) => settings.update({ defaultPreset: v })} options={SCREEN_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
        </Field>
      </div>
    </>
  );
}

/** Opens the mic with the current settings and shows a live level meter. */
function MicTest() {
  const st = useSettings();
  const [level, setLevel] = useState<number | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = async () => {
    stop.current?.();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: st.inputDevice ? { exact: st.inputDevice } : undefined, echoCancellation: st.echoCancellation, noiseSuppression: st.noiseSuppression, autoGainControl: st.autoGainControl },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let raf = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
        raf = requestAnimationFrame(tick);
      };
      tick();
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        setLevel(null);
        stop.current = null;
      };
    } catch {
      setLevel(null);
    }
  };

  return (
    <div className="mt-5 flex items-center gap-4 rounded-lg border border-line bg-canvas p-4">
      <Button variant={level === null ? "primary" : "secondary"} onClick={() => (level === null ? void start() : stop.current?.())}>
        {level === null ? "Let's Check" : "Stop Testing"}
      </Button>
      <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full bg-accent transition-[width] duration-75" style={{ width: `${(level ?? 0) * 100}%` }} />
      </div>
      <span className="w-40 text-xs text-muted">{level === null ? "Say something to test your mic." : "Talk — the bar should move."}</span>
    </div>
  );
}

// ------------------------------------------------------------------ sounds / appearance / advanced

function SoundsSection() {
  const st = useSettings();
  const set = (k: keyof typeof st.sounds) => (v: boolean) => settings.update((s) => ({ sounds: { ...s.sounds, [k]: v } }));
  return (
    <>
      <Title title="Sounds" subtitle="Short cues played by the app." />
      <div className="divide-y divide-line">
        <Switch label="Someone joins your voice channel" checked={st.sounds.join} onChange={set("join")} />
        <Switch label="Someone leaves your voice channel" checked={st.sounds.leave} onChange={set("leave")} />
        <Switch label="Mute / deafen" checked={st.sounds.mute} onChange={set("mute")} />
        <Switch label="New chat message" checked={st.sounds.message} onChange={set("message")} />
      </div>
      <Button className="mt-4" onClick={() => sounds.test()}>
        Play a test sound
      </Button>
    </>
  );
}

function AppearanceSection() {
  const st = useSettings();
  return (
    <>
      <Title title="Appearance" subtitle="Size and density of the interface." />
      <Field label={`Zoom level · ${Math.round(st.zoom * 100)}%`}>
        <input type="range" min={80} max={130} step={5} value={Math.round(st.zoom * 100)} onChange={(e) => settings.update({ zoom: Number(e.target.value) / 100 })} className="accent-[#10b981]" />
      </Field>
      <div className="mt-6 flex flex-col gap-2">
        <span className="text-[13px] font-semibold">Chat message display</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            [false, "Cozy", "Avatars and names on separate lines"],
            [true, "Compact", "More messages on screen"],
          ].map(([v, label, hint]) => (
            <button key={String(v)} onClick={() => settings.update({ compactChat: v as boolean })} className={cx("flex flex-col items-start rounded-lg border p-3 text-left", st.compactChat === v ? "border-accent bg-accent/10" : "border-line hover:border-faint")}>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {st.compactChat === v && <Check size={14} className="text-accent" />} {label as string}
              </span>
              <span className="text-xs text-muted">{hint as string}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-2">
        <Switch label="Hide non-video participants" hint="In a call, show only cameras and streams when there are any." checked={st.hideNonVideo} onChange={(v) => settings.update({ hideNonVideo: v })} />
      </div>
    </>
  );
}

function AdvancedSection() {
  const st = useSettings();
  const [confirm, setConfirm] = useState(false);
  const version = useMemo(() => (typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"), []);
  return (
    <>
      <Title title="Advanced" subtitle="Networking and maintenance." />
      <Switch
        label="Allow calls over the internet"
        hint="Uses a public STUN server only to discover addresses behind routers. Voice and video still go peer to peer. Applies the next time you connect."
        checked={st.publicStun}
        onChange={(v) => settings.update({ publicStun: v })}
      />
      <div className="mt-6 flex items-center gap-3 border-t border-line pt-6">
        <div className="flex-1">
          <div className="text-[15px]">Reset all settings</div>
          <div className="text-xs text-muted">Profile, devices, per-user volumes and appearance go back to defaults.</div>
        </div>
        <Button
          variant={confirm ? "danger" : "secondary"}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            try {
              localStorage.removeItem("talkas.settings");
            } catch {
              // ignore
            }
            location.reload();
          }}
        >
          {confirm ? "Click again to reset" : "Reset"}
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted">Talkas {version}</p>
    </>
  );
}
