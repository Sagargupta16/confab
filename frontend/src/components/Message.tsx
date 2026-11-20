import { motion } from "motion/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { money } from "../cost";
import { linkMentions } from "../mentions";
import { HUMAN, type ChatMessage, type Member } from "../types";
import { Avatar } from "./Avatar";
import { ImageReply } from "./ImageReply";

type Props = {
  message: ChatMessage;
  members: Record<string, Member>;
  /** Model id to display name, across every seat, so a reply keeps the name of the model that wrote it. */
  modelNames: Record<string, string>;
  humanName: string;
};

export function Message({ message, members, modelNames, humanName }: Props) {
  if (message.notice) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-xl rounded-full border border-[var(--hairline-2)] bg-[var(--overlay-1)] px-4 py-1.5 text-center text-xs leading-relaxed break-words text-text-tertiary"
      >
        {message.text}
      </motion.p>
    );
  }

  const mine = message.author === HUMAN;
  const member = members[message.author];
  const color = mine ? "var(--color-app-blue)" : (member?.color ?? "var(--color-text-tertiary)");
  const handles = new Set(Object.keys(members));
  const name = mine
    ? humanName
    : ((message.model ? modelNames[message.model] : undefined) ?? member?.name ?? message.author);
  const picture = !mine && (Boolean(message.image) || member?.kind === "image");
  const footer = [
    message.usage && `${message.usage.in.toLocaleString()} in · ${message.usage.out.toLocaleString()} out`,
    (message.usage || message.image) && message.seconds !== undefined && `${message.seconds}s`,
    message.stop && message.stop !== "end_turn" && `stopped: ${message.stop}`,
    message.status === "stopped" && !message.stop && typeof message.cost === "number" && "stopped",
    (message.usage || message.image) && typeof message.cost === "number" && money(message.cost),
  ].filter(Boolean);
  // A model reports its tokens only when a call finishes, so a reply cut short has no figure at all.
  const unbilled = !mine && message.status === "stopped" && typeof message.cost !== "number";

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}
    >
      <Avatar label={mine ? humanName : message.author} color={color} />
      <div className={`min-w-0 max-w-[min(46rem,88%)] ${mine ? "items-end text-right" : ""}`}>
        <header
          className={`mb-1 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${mine ? "justify-end" : ""}`}
        >
          <span className="font-semibold" style={{ color }}>
            {name}
          </span>
          {message.role && (
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 26, delay: 0.08 }}
              title={message.role}
              className="max-w-[12rem] truncate rounded-full border px-2 py-px text-[0.7rem] leading-4"
              style={{ color, borderColor: `${color}8c` }}
            >
              {message.role}
            </motion.span>
          )}
          {message.askedBy && <span className="figure text-[11px] text-text-tertiary">pulled in by @{message.askedBy}</span>}
        </header>
        <div
          className={`reply rounded-lg border text-left text-[0.95rem] leading-relaxed break-words text-text-primary ${
            picture ? "p-1.5" : "px-4 py-2.5"
          } ${
            mine
              ? "border-app-blue/30 bg-[var(--focus-ring-soft)]"
              : "border-[var(--hairline-2)] bg-surface-1"
          }`}
        >
          {picture ? (
            <ImageReply image={message.image} streaming={Boolean(message.streaming)} color={color} />
          ) : message.text ? (
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a({ href, children }) {
                  if (href?.startsWith("#m-")) {
                    const target = members[href.slice(3)];
                    return (
                      <span className="font-semibold" style={{ color: target?.color ?? "var(--color-app-blue)" }}>
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
            <p className={`text-sm text-app-red ${picture ? "px-2.5 py-1.5" : ""}`} role="alert">
              {message.error}
            </p>
          )}
        </div>
        {(footer.length > 0 || unbilled) && (
          <footer className="figure mt-1 text-[11px] leading-4 text-text-tertiary">
            {footer.join(" · ")}
            {unbilled && (
              <span title="The model reports tokens only when a reply finishes; Bedrock still bills what was generated.">
                {footer.length > 0 && " · "}
                {message.stop && message.stop !== "end_turn" ? "no cost reported" : "stopped · no cost reported"}
              </span>
            )}
          </footer>
        )}
      </div>
    </motion.article>
  );
}
