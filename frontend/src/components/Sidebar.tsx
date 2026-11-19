import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

export type Tab = "members" | "cost";

type Props = {
  /** Unique per mounted copy (the aside and the phone overlay), so the two underlines never share a layoutId. */
  id: string;
  tab: Tab;
  onTab: (tab: Tab) => void;
  memberCount: string;
  costLabel: string;
  members: ReactNode;
  cost: ReactNode;
};

/** A figure that slides up when it changes, so a new total is noticed without stealing focus. */
export function Ticker({ value }: { value: string }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "90%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-90%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="tabular-nums"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "cost", label: "Cost" },
];

export function Sidebar({ id, tab, onTab, memberCount, costLabel, members, cost }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" className="flex shrink-0 border-b border-line px-2">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(item.id)}
              className={`relative flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                active ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <span>{item.label}</span>
              <span className="truncate font-medium normal-case tracking-normal text-muted">
                <Ticker value={item.id === "members" ? memberCount : costLabel} />
              </span>
              {active && (
                <motion.span
                  layoutId={`${id}-tab`}
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: tab === "cost" ? 14 : -14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="tabpanel"
          className="flex min-h-0 flex-1 flex-col"
        >
          {tab === "members" ? members : cost}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
