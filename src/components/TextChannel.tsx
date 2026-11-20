import { Hash, SendHorizontal, X } from "lucide-react";
import { t } from "../lib/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Channel, ChatMessage } from "../../shared/protocol";
import { session, useSession } from "../lib/session";
import { useSettings } from "../lib/settings";
import { Avatar, IconButton, cx } from "./ui";

/**
 * A text channel. `panel` is the narrow version shown next to a voice call (with a close button);
 * `actions` adds buttons to the header (e.g. the members toggle).
 */
export function TextChannel({ channel, panel = false, onClose, actions }: { channel: Channel; panel?: boolean; onClose?: () => void; actions?: ReactNode }) {
  const s = useSession();
  const { compactChat: compact } = useSettings();
  const messages = s.history[channel.id] ?? [];
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const online = Object.keys(s.members).length;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // newer Chromium returns a Promise here; effects must not return it
  }, [messages.length, channel.id]);

  return (
    <section className={cx("flex min-w-0 flex-col bg-canvas", panel ? "w-[360px] shrink-0 border-l border-line" : "flex-1")}>
      <header
        className={cx("flex shrink-0 items-center gap-3 border-b border-line", panel ? "h-16 px-4" : "h-[76px] px-7")}
        style={{ background: "linear-gradient(90deg, rgb(16 185 129 / 0.14), rgb(16 185 129 / 0) 60%)" }}
      >
        <span className={cx("flex shrink-0 items-center justify-center rounded-xl bg-elevated text-accent-soft", panel ? "size-9" : "size-10")}>
          <Hash size={panel ? 17 : 19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{channel.name}</div>
          <div className="truncate text-xs text-muted">{t("{count} online", { count: online })}</div>
        </div>
        {actions}
        {onClose && <IconButton icon={X} label={t("Close")} onClick={onClose} size={17} />}
      </header>
      <div className={cx("selectable flex-1 overflow-y-auto py-5", panel ? "px-4" : "px-7")}>
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 pb-6">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-elevated text-accent-soft">
              <Hash size={32} />
            </div>
            <h2 className={cx("font-bold tracking-tight", panel ? "text-lg" : "text-2xl")}>{t("Welcome to #{name}!", { name: channel.name })}</h2>
            <p className="text-sm text-fg2">{t("This is the start of the channel. Messages are kept on the host's PC.")}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageRow key={m.id} m={m} mine={m.authorId === s.selfId} avatar={s.members[m.authorId]?.avatar} compact={compact} grouped={isGrouped(messages[i - 1], m)} />
        ))}
        <div ref={end} />
      </div>
      <form
        className={cx("pt-2", panel ? "px-4 pb-4" : "px-7 pb-6")}
        onSubmit={(e) => {
          e.preventDefault();
          session.sendChat(channel.id, draft);
          setDraft("");
        }}
      >
        <div className="flex h-14 items-center gap-3 rounded-2xl border border-line bg-elevated pr-2 pl-4 focus-within:border-accent/50">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("Message #{name}", { name: channel.name })} maxLength={2000} className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label={t("Send")}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-soft to-accent text-canvas transition-opacity disabled:opacity-35"
          >
            <SendHorizontal size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

const isGrouped = (prev: ChatMessage | undefined, m: ChatMessage) => !!prev && prev.authorId === m.authorId && m.at - prev.at < 5 * 60_000;

const bubble = (mine: boolean, grouped: boolean) =>
  cx(
    "w-fit max-w-[min(560px,100%)] px-4 py-2.5 text-[14px] leading-[1.55] break-words whitespace-pre-wrap",
    mine ? "bg-gradient-to-br from-accent-soft to-accent font-medium text-canvas" : "bg-elevated text-fg",
    mine ? (grouped ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-br-md") : grouped ? "rounded-2xl rounded-tl-md" : "rounded-2xl rounded-tl-[4px]",
  );

function MessageRow({ m, mine, grouped, avatar, compact }: { m: ChatMessage; mine: boolean; grouped: boolean; avatar?: string | null; compact: boolean }) {
  const time = new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (compact)
    return (
      <div className="flex gap-2 rounded-lg px-1 py-0.5 text-[14px] leading-relaxed hover:bg-hover/40">
        <span className="w-11 shrink-0 text-[11px] leading-6 text-muted">{time}</span>
        <p className="min-w-0 break-words whitespace-pre-wrap text-fg">
          <span className="mr-1.5 font-semibold" style={{ color: `hsl(${m.authorHue} 60% 70%)` }}>
            {m.authorName}
          </span>
          {m.text}
        </p>
      </div>
    );
  if (mine)
    return (
      <div className={cx("flex flex-col items-end gap-1.5", grouped ? "mt-1" : "mt-5")}>
        {!grouped && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-fg2">{t("You")}</span>
            <span className="text-muted">{time}</span>
          </div>
        )}
        <p className={bubble(true, grouped)} title={grouped ? time : undefined}>
          {m.text}
        </p>
      </div>
    );
  if (grouped)
    return (
      <div className="mt-1 pl-[54px]" title={time}>
        <p className={bubble(false, true)}>{m.text}</p>
      </div>
    );
  return (
    <div className="mt-5 flex gap-3.5">
      <Avatar name={m.authorName} hue={m.authorHue} src={avatar} size={40} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[14px] font-semibold" style={{ color: `hsl(${m.authorHue} 60% 72%)` }}>
            {m.authorName}
          </span>
          <span className="text-xs text-muted">{time}</span>
        </div>
        <p className={bubble(false, false)}>{m.text}</p>
      </div>
    </div>
  );
}
