import { motion } from "motion/react";
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
            <h2 className="text-xl font-semibold tracking-tight text-text-primary">Everyone is here.</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-tertiary">
              Type <span className="text-text-primary">@</span> to pick who answers, or{" "}
              <span className="text-text-primary">@all</span> for the whole room. When a model mentions another, that
              one answers too, up to the hop cap.
            </p>
          </div>
          <ul className="space-y-2">
            {starters.map((starter, index) => (
              <motion.li
                key={starter}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.08 + Math.min(index * 0.05, 0.3) }}
              >
                <button
                  type="button"
                  onClick={() => onSuggest(starter)}
                  className="control lift min-h-11 w-full rounded-md px-3.5 py-2.5 text-left text-[13px] leading-snug break-words text-text-secondary hover-fine:text-text-primary"
                >
                  {starter}
                </button>
              </motion.li>
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
