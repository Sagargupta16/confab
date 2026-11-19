import { HardDrive, LogOut, Pencil, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Session } from "../AuthGate";
import type { ChatSummary, ModePreset } from "../wire";
import { TitleInput } from "./TitleInput";

type Props = {
  /** Unique per mounted copy (the aside and the phone drawer), so the two highlights never share a layoutId. */
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

function RunningDot({ running }: { running: boolean }) {
  return (
    <span className="relative flex size-2 shrink-0" aria-label={running ? "A round is running" : undefined}>
      <AnimatePresence initial={false}>
        {running && (
          <motion.span
            key="dot"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
            className="absolute inset-0 rounded-full bg-accent"
          >
            <motion.span
              className="absolute -inset-1 rounded-full border border-accent"
              animate={{ scale: [0.7, 1.5], opacity: [0.9, 0] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

const ICON =
  "flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-[color,opacity] md:size-8";

export function ChatList({ id, chats, activeId, modes, session, onOpen, onNew, onRename, onDelete, onClose }: Props) {
  const now = useMinute();
  const [editing, setEditing] = useState<string | null>(null);
  const modeLabels = new Map(modes.map((mode) => [mode.id, mode.label]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="flex-1 text-lg font-semibold tracking-tight">
          confab<span className="text-accent">.</span>
        </h1>
        {onClose && (
          <button type="button" onClick={onClose} title="Close" aria-label="Close the chat list" className={ICON}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="shrink-0 px-3 pb-2">
        <motion.button
          type="button"
          onClick={onNew}
          whileTap={{ scale: 0.97 }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent/50 text-base font-medium text-accent transition-colors hover:bg-accent/10 md:h-9 md:text-sm"
        >
          <Plus size={17} />
          New chat
        </motion.button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {chats === null ? (
          <ul className="space-y-1.5 px-1 pt-1" aria-label="Loading chats">
            {[0, 1, 2].map((row) => (
              <motion.li
                key={row}
                className="h-11 rounded-lg bg-raised"
                animate={{ opacity: [0.35, 0.8, 0.35] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: row * 0.15 }}
              />
            ))}
          </ul>
        ) : (
          <ul className="space-y-0.5">
            <AnimatePresence initial={false}>
              {chats.map((chat) => {
                const active = chat.id === activeId;
                const mode = chat.mode ? modeLabels.get(chat.mode) : undefined;
                return (
                  <motion.li
                    key={chat.id}
                    layout="position"
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -28, transition: { duration: 0.18 } }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="group relative"
                  >
                    {active && (
                      <motion.span
                        layoutId={`${id}-active`}
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        className="absolute inset-0 rounded-lg border border-line bg-raised"
                      />
                    )}
                    <div className="relative flex min-h-12 items-center gap-0.5 pr-1 md:min-h-11">
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
                          className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg pl-2.5 text-left md:min-h-11"
                        >
                          <RunningDot running={chat.running} />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm ${active ? "font-medium text-ink" : "text-ink/85"}`}
                              title={chat.title}
                            >
                              {chat.title}
                            </span>
                            <span className="block truncate text-[0.7rem] text-muted">
                              {mode && `${mode} · `}
                              {chat.running ? <span className="text-accent">replying</span> : ago(chat.updated_at, now)}
                            </span>
                          </span>
                        </button>
                      )}
                      {editing !== chat.id && (
                        // Always there on a phone (no hover); on a desktop they show on the open chat or on hover.
                        <span
                          className={`flex shrink-0 items-center ${
                            active ? "" : "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setEditing(chat.id)}
                            title="Rename"
                            aria-label={`Rename ${chat.title}`}
                            className={`${ICON} hover:text-ink`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(chat.id)}
                            title="Delete"
                            aria-label={`Delete ${chat.title}`}
                            className={`${ICON} hover:text-danger`}
                          >
                            <Trash2 size={15} />
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

      <div className="flex shrink-0 items-center gap-2.5 border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {session.user ? (
          <>
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-sm font-semibold uppercase text-accent"
            >
              {session.user.login.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{session.user.name ?? session.user.login}</span>
              <span className="block truncate text-[0.7rem] text-muted">@{session.user.login}</span>
            </span>
            {session.signOut && (
              <button
                type="button"
                onClick={session.signOut}
                title="Sign out"
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm text-muted transition-colors hover:text-ink md:h-8 md:text-xs"
              >
                <LogOut size={14} />
                Sign out
              </button>
            )}
          </>
        ) : (
          <>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-muted">
              <HardDrive size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Local mode</span>
              <span className="block truncate text-[0.7rem] text-muted">Chats stay on this machine · v{session.version}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
