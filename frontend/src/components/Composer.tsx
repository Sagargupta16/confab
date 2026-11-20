import { Send, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mentionAtCaret } from "../mentions";
import type { Member } from "../types";
import { Avatar } from "./Avatar";
import { Button } from "./Button";

type Props = {
  draft: string;
  onDraft: (text: string) => void;
  /** Members currently in the chat, in roster order. */
  members: Member[];
  busy: boolean;
  /** Stop was pressed and the server has not ended the round yet. */
  stopping?: boolean;
  /** Bumped by the parent whenever it wants the caret back in the box. */
  focusToken: number;
  onSend: (text: string) => void;
  onStop: () => void;
};

type Option = { handle: string; label: string; color: string };

export function Composer({ draft, onDraft, members, busy, stopping = false, focusToken, onSend, onStop }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const typing = dismissed ? null : mentionAtCaret(draft, caret);
  const everyone = members.some((member) => member.kind === "image")
    ? "Every text model in the chat"
    : "Everyone in the chat";
  const options: Option[] = typing
    ? [
        { handle: "all", label: everyone, color: "var(--color-app-blue)" },
        ...members.map((member) => ({
          handle: member.handle,
          label: member.role ? `${member.name} · ${member.role}` : member.name,
          color: member.color,
        })),
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
    <div className="shell border-t border-[var(--hairline-2)] bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      <div className="relative mx-auto max-w-4xl">
        <AnimatePresence>
          {open && (
            <motion.ul
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              role="listbox"
              className="absolute bottom-full left-0 z-10 mb-2 max-h-64 w-full max-w-sm overflow-y-auto rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-1 shadow-[var(--shadow-float)]"
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
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] lg:pointer-fine:min-h-9 ${
                      index === active ? "bg-[var(--overlay-4)]" : ""
                    }`}
                  >
                    <Avatar label={option.handle} color={option.color} size={24} />
                    <span className="font-medium text-text-primary">@{option.handle}</span>
                    <span className="truncate text-text-tertiary">{option.label}</span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <div className="control flex items-end gap-2 rounded-lg p-2">
          <textarea
            ref={box}
            name="message"
            aria-label="Message"
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
            className="max-h-[33vh] min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-relaxed text-text-primary outline-none placeholder:text-text-tertiary lg:min-h-9 lg:py-2 lg:text-[0.95rem]"
          />
          {busy ? (
            <Button
              variant="danger"
              onClick={onStop}
              disabled={stopping}
              title={stopping ? "Stopping after the current piece" : "Stop the round"}
              className={`px-0 ${stopping ? "animate-pulse disabled:opacity-100" : ""}`}
            >
              <Square size={16} fill="currentColor" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={submit}
              disabled={!draft.trim()}
              title="Send"
              className="px-0 disabled:border-[var(--hairline-2)] disabled:bg-[var(--overlay-4)] disabled:text-text-tertiary disabled:opacity-100"
            >
              <Send size={17} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
