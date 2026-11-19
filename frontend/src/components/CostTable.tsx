import { motion } from "motion/react";
import { compact, money, type CostSummary } from "../cost";
import type { PriceSource, Usage } from "../types";

type Props = { summary: CostSummary; prices: PriceSource | null };

function tokens(usage: Usage) {
  return usage.in + usage.out > 0 ? `${compact(usage.in)} / ${compact(usage.out)}` : null;
}

function count(replies: number, images: number) {
  const parts: string[] = [];
  if (replies) parts.push(`${replies} ${replies === 1 ? "reply" : "replies"}`);
  if (images) parts.push(`${images} ${images === 1 ? "image" : "images"}`);
  return parts.join(", ");
}

const Muted = ({ title = "No published price" }: { title?: string }) => (
  <span className="text-muted/60" title={title}>
    --
  </span>
);

const NOT_REPORTED = "The model reports tokens only when a reply finishes; Bedrock still bills what was generated.";

/** The same three columns in the scrolling body and the pinned total, so they line up. */
const Columns = () => (
  <colgroup>
    <col />
    <col className="w-[4.75rem]" />
    <col className="w-[4.25rem]" />
  </colgroup>
);

export function CostTable({ summary, prices }: Props) {
  const { rows, total, unpriced, stopped } = summary;
  const priced = rows.some((row) => row.cost !== null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2">
        {rows.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-muted">
            Nothing spent yet. Each reply adds its cost here as it lands.
          </p>
        ) : (
          <table className="w-full table-fixed text-xs">
            <Columns />
            <thead>
              <tr className="text-[0.65rem] uppercase tracking-wider text-muted">
                <th className="py-2 pl-1 text-left font-semibold">Model</th>
                <th className="py-2 text-right font-semibold" title="Input / output tokens">
                  Tokens
                </th>
                <th className="py-2 pr-1 text-right font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <motion.tr
                  key={row.key}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="border-t border-line/70 align-top"
                >
                  <td className="py-2 pl-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
                      <span className="truncate font-medium text-ink" title={row.name}>
                        {row.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate pl-3.5 text-[0.7rem] text-muted">
                      @{row.handle}
                      {row.replies + row.images > 0 && ` · ${count(row.replies, row.images)}`}
                    </span>
                    {row.stopped > 0 && (
                      <span className="block truncate pl-3.5 text-[0.7rem] text-muted/80" title={NOT_REPORTED}>
                        + {row.stopped} stopped
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted">
                    {tokens(row.tokens) ?? <Muted title={row.replies + row.images > 0 ? undefined : NOT_REPORTED} />}
                  </td>
                  <td className="py-2 pr-1 text-right font-medium tabular-nums text-ink">
                    {row.cost === null ? (
                      <Muted title={row.replies + row.images > 0 ? undefined : NOT_REPORTED} />
                    ) : (
                      money(row.cost)
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-3 pb-3 pt-2">
        <table className="w-full table-fixed text-xs">
          <Columns />
          <tbody>
            <tr>
              <td className="py-1 pl-1">
                <span className="font-semibold uppercase tracking-wider text-muted">Total</span>
                {unpriced && rows.length > 0 && (
                  <span className="mt-0.5 block truncate text-[0.7rem] text-muted">+ unpriced tokens</span>
                )}
              </td>
              <td className="py-1 text-right align-top tabular-nums text-muted">
                {tokens(summary.tokens) ?? "0"}
              </td>
              <td className="py-1 pr-1 text-right align-top">
                <motion.span
                  key={total}
                  initial={{ opacity: 0.4, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-block text-sm font-semibold tabular-nums text-accent"
                >
                  {priced || rows.length === 0 ? money(total) : <Muted title={unpriced ? undefined : NOT_REPORTED} />}
                </motion.span>
              </td>
            </tr>
          </tbody>
        </table>
        {stopped > 0 && (
          <p className="mt-2 px-1 text-[0.7rem] leading-snug text-muted">
            {stopped === 1 ? "1 stopped reply is" : `${stopped} stopped replies are`} not in these figures: the model
            reports tokens only when a reply finishes, and Bedrock still bills what was generated.
          </p>
        )}
        {prices && (
          <p className="mt-2 px-1 text-[0.7rem] leading-snug text-muted">
            USD, AWS price list read{" "}
            <a href={prices.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {prices.checked}
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
