import { motion } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { linkMentions } from "../mentions";
import { HUMAN, type ChatMessage, type Member } from "../types";
import { Avatar } from "./Avatar";

type Props = {
  message: ChatMessage;
  members: Record<string, Member>;
  humanName: string;
};

export function Message({ message, members, humanName }: Props) {
  if (message.notice) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-xl rounded-full border border-line px-4 py-1.5 text-center text-xs text-muted"
      >
        {message.text}
      </motion.p>
    );
  }

  const mine = message.author === HUMAN;
  const member = members[message.author];
  const color = mine ? "var(--color-accent)" : (member?.color ?? "var(--color-muted)");
  const handles = new Set(Object.keys(members));

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}
    >
      <Avatar label={mine ? humanName : message.author} color={color} />
      <div className={`min-w-0 max-w-[min(46rem,88%)] ${mine ? "items-end text-right" : ""}`}>
        <header className={`mb-1 flex flex-wrap items-baseline gap-x-2 text-xs ${mine ? "justify-end" : ""}`}>
          <span className="font-semibold" style={{ color }}>
            {mine ? humanName : (member?.name ?? message.author)}
          </span>
          {message.askedBy && <span className="text-muted">pulled in by @{message.askedBy}</span>}
        </header>
        <div
          className={`reply rounded-2xl border px-4 py-2.5 text-left text-[0.95rem] leading-relaxed break-words ${
            mine ? "rounded-tr-sm border-accent/40 bg-accent/10" : "rounded-tl-sm border-line bg-panel"
          }`}
        >
          {message.text ? (
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a({ href, children }) {
                  if (href?.startsWith("#m-")) {
                    const target = members[href.slice(3)];
                    return (
                      <span className="font-semibold" style={{ color: target?.color ?? "var(--color-accent)" }}>
                        {children}
                      </span>
                    );
                  }
                  return (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {linkMentions(message.text, handles)}
            </Markdown>
          ) : message.streaming ? (
            <span className="typing" style={{ color }} aria-label="thinking">
              <span />
              <span />
              <span />
            </span>
          ) : null}
          {message.error && (
            <p className="text-sm text-danger" role="alert">
              {message.error}
            </p>
          )}
        </div>
        {message.usage && (
          <footer className="mt-1 text-[0.7rem] tabular-nums text-muted">
            {message.usage.in.toLocaleString()} in · {message.usage.out.toLocaleString()} out
            {message.seconds !== undefined && ` · ${message.seconds}s`}
            {message.stop && message.stop !== "end_turn" && ` · stopped: ${message.stop}`}
          </footer>
        )}
      </div>
    </motion.article>
  );
}
