import { Send, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mentionAtCaret } from "../mentions";
import type { Member } from "../types";
import { Avatar } from "./Avatar";

type Props = {
  draft: string;
  onDraft: (text: string) => void;
  /** Members currently in the chat, in roster order. */
  members: Member[];
  busy: boolean;
  /** Bumped by the parent whenever it wants the caret back in the box. */
  focusToken: number;
  onSend: (text: string) => void;
  onStop: () => void;
};

type Option = { handle: string; label: string; color: string };

export function Composer({ draft, onDraft, members, busy, focusToken, onSend, onStop }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const typing = dismissed ? null : mentionAtCaret(draft, caret);
  const options: Option[] = typing
    ? [
        { handle: "all", label: "Everyone in the chat", color: "var(--color-accent)" },
        ...members.map((member) => ({ handle: member.handle, label: member.name, color: member.color })),
      ].filter((option) => option.handle.startsWith(typing.prefix))
    : [];
  const open = options.length > 0;
  const active = Math.min(picked, Math.max(options.length - 1, 0));

  // Grow with the text up to a third of the screen.
  useLayoutEffect(() => {
    const area = box.current;
    if (!area) return;
    const limit = window.innerHeight / 3;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, limit)}px`;
    area.style.overflowY = area.scrollHeight > limit ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    const area = box.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    setCaret(area.value.length);
  }, [focusToken]);

  function choose(option: Option) {
    if (!typing) return;
    const next = `${draft.slice(0, typing.start)}@${option.handle} ${draft.slice(caret)}`;
    const position = typing.start + option.handle.length + 2;
    onDraft(next);
    setPicked(0);
    requestAnimationFrame(() => {
      box.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  }

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
  }

  return (
    <div className="border-t border-line bg-canvas px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      <div className="relative mx-auto max-w-4xl">
        <AnimatePresence>
          {open && (
            <motion.ul
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.14 }}
              role="listbox"
              className="absolute bottom-full left-0 z-10 mb-2 max-h-64 w-full max-w-sm overflow-y-auto rounded-xl border border-line bg-panel p-1"
            >
              {options.map((option, index) => (
                <li key={option.handle} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(option);
                    }}
                    onMouseEnter={() => setPicked(index)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm ${
                      index === active ? "bg-raised" : ""
                    }`}
                  >
                    <Avatar label={option.handle} color={option.color} size={24} />
                    <span className="font-medium">@{option.handle}</span>
                    <span className="truncate text-muted">{option.label}</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 rounded-2xl border border-line bg-panel p-2 focus-within:border-accent/70">
          <textarea
            ref={box}
            rows={1}
            value={draft}
            placeholder="Message the room. @ to pick who answers"
            onChange={(event) => {
              onDraft(event.target.value);
              setCaret(event.target.selectionStart);
              setDismissed(false);
              setPicked(0);
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={(event) => {
              if (open) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setPicked((active + 1) % options.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setPicked((active - 1 + options.length) % options.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  choose(options[active]);
                  return;
                }
                if (event.key === "Escape") {
                  setDismissed(true);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            className="max-h-[33vh] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[0.95rem] leading-relaxed outline-none placeholder:text-muted"
          />
          {busy ? (
            <motion.button
              type="button"
              onClick={onStop}
              whileTap={{ scale: 0.92 }}
              title="Stop the round"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-danger/50 text-danger"
            >
              <Square size={16} fill="currentColor" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              whileTap={{ scale: 0.92 }}
              title="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-canvas disabled:opacity-30"
            >
              <Send size={17} />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
