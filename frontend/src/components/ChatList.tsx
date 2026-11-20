import { LogOut, MessagesSquare, Monitor, Pencil, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Session } from "../AuthGate";
import type { ChatSummary, ModePreset } from "../wire";
import { Button } from "./Button";
import { TitleInput } from "./TitleInput";

type Props = {
  /** Unique per mounted copy (the aside and the phone drawer), so the two pills never share a layoutId. */
  id: string;
  chats: ChatSummary[] | null;
  activeId: string | null;
  modes: ModePreset[];
  session: Session;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Only the drawer has one. */
  onClose?: () => void;
};

const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** "now", "5m", "3h", "2d", then the date. */
function ago(iso: string, now: number): string {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  return day.format(new Date(iso));
}

/** The clock the relative times read, ticking once a minute. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** "Sagargupta16" -> "SA", "sagar-gupta" -> "SG". */
function initials(login: string): string {
  const parts = login.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : login.slice(0, 2);
  return letters.toUpperCase();
}

const EASE = [0.16, 1, 0.3, 1] as const;
const PILL = { type: "spring", stiffness: 500, damping: 40 } as const;

/** Each row rises in on its turn: 0.08 s lead, 0.05 s apart, never later than 0.3 s. */
const reveal = (index: number) => ({
  duration: 0.35,
  ease: EASE,
  delay: Math.min(0.08 + index * 0.05, 0.3),
  layout: PILL,
});

// 44px on touch; a fine pointer at lg and up gets 32px.
const ICON =
  "lift flex size-11 shrink-0 items-center justify-center rounded-md text-text-tertiary lg:pointer-fine:size-8";

export function ChatList({ id, chats, activeId, modes, session, onOpen, onNew, onRename, onDelete, onClose }: Props) {
  const now = useMinute();
  const [editing, setEditing] = useState<string | null>(null);
  const modeLabels = new Map(modes.map((mode) => [mode.id, mode.label]));
  const tagline =
    chats === null ? "Opening your chats" : `${chats.length} ${chats.length === 1 ? "chat" : "chats"}`;

  return (
    <div className="shell flex h-full min-h-0 flex-col text-text-primary">
      <div className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-[var(--hairline-2)] pl-3 pr-1.5 pt-[env(safe-area-inset-top)]">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-text-primary text-background">
          <MessagesSquare aria-hidden size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-4">
            confab<span className="text-app-blue">.</span>
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={tagline}
              initial={{ opacity: 0.7, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="figure truncate text-[10px] leading-4 text-text-tertiary"
            >
              {tagline}
            </motion.p>
          </AnimatePresence>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close the chat list"
            className={`${ICON} hover-fine:bg-[var(--overlay-2)] hover-fine:text-text-primary`}
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="shrink-0 px-3 pt-3">
        <Button variant="secondary" onClick={onNew} icon={<Plus aria-hidden size={15} />} className="w-full">
          New chat
        </Button>
      </div>

      <div className="mb-1 mt-4 flex shrink-0 items-center justify-between px-3">
        <span className="meta">Chats</span>
        {chats !== null && chats.length > 0 && (
          <span className="figure text-[10px] text-text-quaternary">{chats.length}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {chats === null ? (
          <motion.ul
            className="space-y-1.5 px-1 pt-1"
            aria-label="Loading chats"
            animate={{ opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
          >
            {[0, 1, 2].map((row) => (
              <li key={row} className="h-10 rounded-md bg-white/[0.03]" />
            ))}
          </motion.ul>
        ) : (
          <ul className="space-y-0.5">
            <AnimatePresence>
              {chats.map((chat, index) => {
                const active = chat.id === activeId;
                const mode = chat.mode ? modeLabels.get(chat.mode) : undefined;
                return (
                  <motion.li
                    key={chat.id}
                    layout="position"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.18, ease: EASE } }}
                    transition={reveal(index)}
                    data-active={active || undefined}
                    className="chat-row relative rounded-md"
                  >
                    {active && (
                      <motion.span
                        layoutId={`${id}-chat-pill`}
                        transition={PILL}
                        aria-hidden
                        className="absolute inset-0 rounded-md bg-[var(--overlay-4)]"
                      />
                    )}
                    <div className="relative flex min-h-11 items-center gap-0.5 pr-0.5 lg:pointer-fine:min-h-10">
                      {editing === chat.id ? (
                        <div className="flex min-w-0 flex-1 py-1 pl-1">
                          <TitleInput
                            value={chat.title}
                            className="w-full"
                            onDone={(title) => {
                              setEditing(null);
                              if (title) onRename(chat.id, title);
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpen(chat.id)}
                          aria-current={active ? "true" : undefined}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 pl-2.5 text-left lg:pointer-fine:min-h-10"
                        >
                          <span className="flex size-1.5 shrink-0 items-center justify-center">
                            <AnimatePresence initial={false}>
                              {chat.running && (
                                <motion.span
                                  key="live"
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  exit={{ scale: 0 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                                  aria-label="A round is running"
                                  className="size-1.5 rounded-full bg-app-green"
                                >
                                  <span className="live-dot block size-full rounded-full bg-app-green" />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-[13px] leading-5 ${active ? "font-medium" : ""}`}
                              title={chat.title}
                            >
                              {chat.title}
                            </span>
                            <span className="figure block truncate text-[10px] leading-4 text-text-quaternary">
                              {mode && <span className="text-text-tertiary">{mode}</span>}
                              {mode && " · "}
                              {chat.running ? <span className="text-text-secondary">replying</span> : ago(chat.updated_at, now)}
                            </span>
                          </span>
                        </button>
                      )}
                      {editing !== chat.id && (
                        <span className="row-actions flex shrink-0 items-center">
                          <button
                            type="button"
                            onClick={() => setEditing(chat.id)}
                            title="Rename"
                            aria-label={`Rename ${chat.title}`}
                            className={`${ICON} hover-fine:bg-[var(--overlay-3)] hover-fine:text-text-primary`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(chat.id)}
                            title="Delete"
                            aria-label={`Delete ${chat.title}`}
                            className={`${ICON} hover-fine:bg-app-red/10 hover-fine:text-app-red`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="flex min-h-14 shrink-0 items-center gap-2.5 border-t border-[var(--hairline-2)] px-3 pb-[env(safe-area-inset-bottom)]">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-text-primary text-[10px] font-semibold text-background"
        >
          {session.user ? initials(session.user.login) : <Monitor size={14} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium leading-4">
            {session.user ? (session.user.name ?? session.user.login) : "Local mode"}
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5 text-[10px] leading-4 text-text-tertiary">
            <span className="truncate">{session.user ? `@${session.user.login}` : "Chats stay on this machine"}</span>
            <span className="figure shrink-0 text-text-quaternary">v{session.version}</span>
          </span>
        </span>
        {session.signOut && (
          <Button
            variant="ghost"
            size="sm"
            onClick={session.signOut}
            title="Sign out"
            icon={<LogOut aria-hidden size={14} />}
          >
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}
