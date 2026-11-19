import { Star } from "lucide-react";
import { motion } from "motion/react";
import type { Member, Usage } from "../types";
import { Avatar } from "./Avatar";

type Props = {
  roster: Member[];
  joined: Set<string>;
  defaultHandle: string | null;
  totals: Record<string, Usage>;
  speaking: Set<string>;
  onToggle: (handle: string) => void;
  onDefault: (handle: string) => void;
  onMention: (handle: string) => void;
};

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function Roster({ roster, joined, defaultHandle, totals, speaking, onToggle, onDefault, onMention }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Members</h2>
        <span className="text-xs text-muted">
          {joined.size} of {roster.length} in
        </span>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {roster.map((member) => {
          const isIn = joined.has(member.handle);
          const usage = totals[member.handle];
          return (
            <motion.li
              key={member.handle}
              layout
              whileHover={{ x: 2 }}
              className="group flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 hover:border-line hover:bg-raised"
            >
              <button
                type="button"
                onClick={() => isIn && onMention(member.handle)}
                disabled={!isIn}
                title={isIn ? `Mention @${member.handle}` : "Not in the chat"}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
              >
                <span className="relative">
                  <Avatar label={member.handle} color={member.color} dim={!isIn} />
                  {speaking.has(member.handle) && (
                    <motion.span
                      className="absolute -inset-1 rounded-full border"
                      style={{ borderColor: member.color }}
                      animate={{ scale: [1, 1.25, 1], opacity: [0.9, 0, 0.9] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-medium ${isIn ? "text-ink" : "text-muted"}`}>
                    {member.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    @{member.handle}
                    {usage ? ` · ${compact.format(usage.in + usage.out)} tokens` : ""}
                  </span>
                </span>
              </button>
              {isIn && (
                <button
                  type="button"
                  onClick={() => onDefault(member.handle)}
                  title={
                    defaultHandle === member.handle
                      ? "Answers when you mention nobody"
                      : "Make this the one who answers when you mention nobody"
                  }
                  className={`rounded p-1 ${
                    defaultHandle === member.handle ? "text-accent" : "text-muted opacity-40 hover:opacity-100"
                  }`}
                >
                  <Star size={15} fill={defaultHandle === member.handle ? "currentColor" : "none"} />
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={isIn}
                aria-label={`${member.name} in the chat`}
                onClick={() => onToggle(member.handle)}
                className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                  isIn ? "border-accent bg-accent/25" : "border-line bg-panel"
                }`}
              >
                <motion.span
                  layout
                  className={`absolute top-0.5 h-3.5 w-3.5 rounded-full ${isIn ? "right-0.5 bg-accent" : "left-0.5 bg-muted"}`}
                />
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
