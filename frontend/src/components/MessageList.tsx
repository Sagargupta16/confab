import { useEffect, useRef } from "react";
import type { ChatMessage, Member } from "../types";
import { Message } from "./Message";

type Props = {
  messages: ChatMessage[];
  members: Record<string, Member>;
  humanName: string;
  onSuggest: (text: string) => void;
};

const STARTERS = [
  "@all introduce yourself in one line",
  "@claude and @gpt: tabs or spaces? One line each, then answer the other",
  "@grok pick the model here you would most like to debate, mention it and start",
  "@mistral explain event sourcing in three sentences, then ask @deepseek to poke a hole in it",
];

export function MessageList({ messages, members, humanName, onSuggest }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the newest text unless the reader has scrolled up to read something.
  useEffect(() => {
    const box = scroller.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const box = event.currentTarget;
        pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6"
    >
      {messages.length === 0 ? (
        <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Everyone is here.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Type <span className="text-ink">@</span> to pick who answers, or{" "}
              <span className="text-ink">@all</span> for the whole room. When a model mentions another, that one
              answers too, up to the hop cap.
            </p>
          </div>
          <ul className="space-y-2">
            {STARTERS.map((starter) => (
              <li key={starter}>
                <button
                  type="button"
                  onClick={() => onSuggest(starter)}
                  className="w-full rounded-xl border border-line bg-panel px-4 py-2.5 text-left text-sm text-muted transition-colors hover:border-accent/60 hover:text-ink"
                >
                  {starter}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {messages.map((message) => (
            <Message key={message.id} message={message} members={members} humanName={humanName} />
          ))}
        </div>
      )}
    </div>
  );
}
