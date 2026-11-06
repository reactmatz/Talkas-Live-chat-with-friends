import { Hash, SendHorizontal } from "lucide-react";
import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import type { Channel, ChatMessage } from "../../shared/protocol";
import { session, useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { Avatar } from "./ui";

export function TextChannel({ channel }: { channel: Channel }) {
  const s = useSession();
  const { compactChat: compact } = useSettings();
  const messages = s.history[channel.id] ?? [];
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // newer Chromium returns a Promise here; effects must not return it
  }, [messages.length, channel.id]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-elevated/40">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Hash size={20} className="text-muted" />
        <span className="font-semibold">{channel.name}</span>
      </header>
      <div className="selectable flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 pb-6">
            <div className="flex size-16 items-center justify-center rounded-full bg-elevated">
              <Hash size={34} />
            </div>
            <h2 className="text-2xl font-bold">{t("Welcome to #{name}!", { name: channel.name })}</h2>
            <p className="text-sm text-fg2">{t("This is the start of the channel. Messages are kept on the host's PC.")}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageRow key={m.id} m={m} avatar={s.members[m.authorId]?.avatar} compact={compact} grouped={isGrouped(messages[i - 1], m)} />
        ))}
        <div ref={end} />
      </div>
      <form
        className="px-4 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          session.sendChat(channel.id, draft);
          setDraft("");
        }}
      >
        <div className="flex items-center gap-2 rounded-lg bg-hover px-4">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("Message #{name}", { name: channel.name })} maxLength={2000} className="h-11 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
          <button type="submit" disabled={!draft.trim()} className="text-fg2 hover:text-fg disabled:opacity-30" aria-label={t("Send")}>
            <SendHorizontal size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

const isGrouped = (prev: ChatMessage | undefined, m: ChatMessage) => !!prev && prev.authorId === m.authorId && m.at - prev.at < 5 * 60_000;

function MessageRow({ m, grouped, avatar, compact }: { m: ChatMessage; grouped: boolean; avatar?: string | null; compact: boolean }) {
  const time = new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (compact)
    return (
      <div className="flex gap-2 rounded px-1 py-0.5 text-[14px] leading-relaxed hover:bg-hover/40">
        <span className="w-11 shrink-0 text-[11px] leading-6 text-muted">{time}</span>
        <p className="min-w-0 break-words whitespace-pre-wrap text-fg">
          <span className="mr-1.5 font-semibold" style={{ color: `hsl(${m.authorHue} 60% 70%)` }}>
            {m.authorName}
          </span>
          {m.text}
        </p>
      </div>
    );
  if (grouped)
    return (
      <div className="group flex gap-4 rounded px-1 py-0.5 hover:bg-hover/40">
        <span className="w-10 shrink-0 pt-0.5 text-right text-[10px] text-transparent group-hover:text-muted">{time}</span>
        <p className="min-w-0 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-fg">{m.text}</p>
      </div>
    );
  return (
    <div className="mt-3 flex gap-4 rounded px-1 py-0.5 hover:bg-hover/40">
      <Avatar name={m.authorName} hue={m.authorHue} src={avatar} size={40} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold" style={{ color: `hsl(${m.authorHue} 60% 70%)` }}>
            {m.authorName}
          </span>
          <span className="text-xs text-muted">{time}</span>
        </div>
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap text-fg">{m.text}</p>
      </div>
    </div>
  );
}
