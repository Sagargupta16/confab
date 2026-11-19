import { useEffect, useRef } from "react";
import type { ChatMessage, Member } from "../types";
import { Message } from "./Message";

type Props = {
  messages: ChatMessage[];
  members: Record<string, Member>;
  modelNames: Record<string, string>;
  humanName: string;
  /** True when an image model is in the chat, which adds a starter that hands it a prompt. */
  imageInRoom: boolean;
  onSuggest: (text: string) => void;
};

const STARTERS = [
  "@all introduce yourself in one line",
  "@claude and @gpt: tabs or spaces? One line each, then answer the other",
  "@grok pick the model here you would most like to debate, mention it and start",
  "@mistral explain event sourcing in three sentences, then ask @deepseek to poke a hole in it",
];

// It names no image handle on purpose: Claude has to mention the image model, so its reply becomes the prompt.
const IMAGE_STARTER =
  "@claude write a one-line prompt for a poster about confab and hand it to the image model in this room";

export function MessageList({ messages, members, modelNames, humanName, imageInRoom, onSuggest }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const starters = imageInRoom ? [...STARTERS, IMAGE_STARTER] : STARTERS;

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
        <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Everyone is here.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Type <span className="text-ink">@</span> to pick who answers, or{" "}
              <span className="text-ink">@all</span> for the whole room. When a model mentions another, that one
              answers too, up to the hop cap.
            </p>
          </div>
          <ul className="space-y-2">
            {starters.map((starter) => (
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
            <Message
              key={message.id}
              message={message}
              members={members}
              modelNames={modelNames}
              humanName={humanName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
