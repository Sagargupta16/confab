import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ModelOption } from "../types";

type Props = {
  handle: string;
  models: ModelOption[];
  value: string;
  onChange: (model: string) => void;
  /** The cost levels that pick each model for this seat ("cheap", "medium", "intense"), by model id. */
  tags: Record<string, string[]>;
  /** What the closed trigger shows: the chosen model's name, with its swap motion. */
  label: ReactNode;
  /** The trigger's colour classes, from the row it sits in. */
  className?: string;
};

const GAP = 4;
const EDGE = 8;

/** "cheap", or "cheap · medium", or "all levels" when every level picks it. */
function tagText(tags: string[]): string | null {
  if (tags.length === 0) return null;
  return tags.length >= 3 ? "all levels" : tags.join(" · ");
}

/**
 * A model picker in the IDE manner: the trigger is the model's name and a chevron; it opens a small listbox of the
 * seat's models by name, a tick on the current one and a mono tag on the ones a cost level picks.
 *
 * The list is a native popover (Baseline: top layer, so no overflow clips it, and light dismiss on an outside
 * press). Anchor positioning is not Baseline yet, so it is placed from the trigger's box and kept inside the
 * viewport, flipping above the trigger when there is more room there.
 */
export function ModelMenu({ handle, models, value, onChange, tags, label, className = "" }: Props) {
  const id = useId();
  const menuId = `${id}-menu`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = Math.max(
    0,
    models.findIndex((model) => model.id === value),
  );

  // Place it under the trigger (or over it), as wide as the trigger or 15rem, never past an edge. Runs when the
  // list renders and again once the popover is showing, since a closed popover measures zero tall.
  function place() {
    const box = menu.current;
    const anchor = trigger.current;
    if (!box || !anchor || !box.matches(":popover-open")) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(rect.left, EDGE), window.innerWidth - width - EDGE);
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const natural = box.scrollHeight;
    const down = natural <= below || below >= above;
    const room = Math.max(down ? below : above, 120);
    const height = Math.min(natural, room);
    box.style.width = `${width}px`;
    box.style.left = `${left}px`;
    box.style.maxHeight = `${room}px`;
    box.style.top = `${down ? rect.bottom + GAP : rect.top - GAP - height}px`;
    list.current?.focus();
  }

  useLayoutEffect(() => {
    if (open) place();
  });

  // A scroll or resize under it would leave it floating in the wrong place: close it, as an IDE menu does.
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      menu.current?.hidePopover();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function hide(refocus: boolean) {
    menu.current?.hidePopover();
    if (refocus) trigger.current?.focus();
  }

  function pick(index: number) {
    const model = models[index];
    if (model && model.id !== value) onChange(model.id);
    hide(true);
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={menuId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Model for @${handle}: ${models[chosen]?.name ?? value}`}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
            event.preventDefault();
            menu.current?.showPopover();
          }
        }}
        title={models[chosen]?.name}
        // The name lines up with the row's text, so the trigger's left padding hangs out of its box.
        className={`-ml-1.5 flex h-11 min-w-0 max-w-[calc(100%+0.375rem)] items-center gap-1 rounded-md px-1.5 text-left transition-colors hover-fine:bg-[var(--overlay-3)] md:h-7 ${
          open ? "bg-[var(--overlay-3)]" : ""
        } ${className}`}
      >
        <span className="relative min-w-0 overflow-hidden">{label}</span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="flex shrink-0 text-text-tertiary"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>

      <div
        ref={menu}
        id={menuId}
        popover="auto"
        onBeforeToggle={(event) => {
          if (event.newState === "open") {
            setActive(chosen);
            setOpen(true);
          } else {
            setOpen(false);
          }
        }}
        onToggle={(event) => {
          if (event.newState === "open") {
            place();
            return;
          }
          // Light dismiss (an outside press) moves focus on its own; Escape or a pick leaves it nowhere useful.
          const focus = document.activeElement;
          if (focus === document.body || (focus && menu.current?.contains(focus))) trigger.current?.focus();
        }}
        className="shell m-0 overflow-y-auto rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-1 text-text-primary shadow-[var(--shadow-float)] [inset:auto]"
      >
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={list}
              key="list"
              role="listbox"
              tabIndex={-1}
              aria-label={`Models for @${handle}`}
              aria-activedescendant={`${id}-option-${active}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onKeyDown={(event) => {
                const last = models.length - 1;
                const moves: Record<string, number> = {
                  ArrowDown: Math.min(active + 1, last),
                  ArrowUp: Math.max(active - 1, 0),
                  Home: 0,
                  End: last,
                };
                if (event.key in moves) {
                  event.preventDefault();
                  setActive(moves[event.key]);
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  pick(active);
                } else if (event.key === "Escape") {
                  // Only the menu closes, not the room sheet it opened from.
                  event.preventDefault();
                  event.stopPropagation();
                  hide(true);
                } else if (event.key === "Tab") {
                  hide(false);
                } else if (event.key.length === 1) {
                  // Type-ahead: the next model whose name starts with the key.
                  const key = event.key.toLowerCase();
                  const order = [...models.keys()].map((step) => (active + 1 + step) % models.length);
                  const hit = order.find((index) => models[index].name.toLowerCase().startsWith(key));
                  if (hit !== undefined) setActive(hit);
                }
              }}
              className="outline-none"
            >
              {models.map((model, index) => {
                const selected = model.id === value;
                const tag = tagText(tags[model.id] ?? []);
                return (
                  <li
                    key={model.id}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={selected}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => pick(index)}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] lg:pointer-fine:min-h-9 ${
                      index === active ? "bg-[var(--overlay-4)]" : ""
                    } ${selected ? "text-text-primary" : "text-text-secondary"}`}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center text-app-blue">
                      {selected && <Check aria-hidden size={14} />}
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${selected ? "font-medium" : ""}`}>{model.name}</span>
                    {tag && (
                      <span className="figure shrink-0 rounded border border-[var(--hairline-3)] px-1.5 py-px text-[10px] leading-4 text-text-tertiary">
                        {tag}
                      </span>
                    )}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
