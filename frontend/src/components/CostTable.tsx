import { Receipt } from "lucide-react";
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
  <span className="text-text-quaternary" title={title}>
    --
  </span>
);

const NOT_REPORTED = "The model reports tokens only when a reply finishes; Bedrock still bills what was generated.";

/** The same three columns in the scrolling body and the pinned total, so they line up. */
const Columns = () => (
  <colgroup>
    <col />
    <col className="w-24" />
    <col className="w-14" />
  </colgroup>
);

export function CostTable({ summary, prices }: Props) {
  const { rows, total, unpriced, stopped } = summary;
  const priced = rows.some((row) => row.cost !== null);

  return (
    <div className="shell flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2">
        {rows.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center px-3 py-8 text-center"
          >
            <span className="flex size-12 items-center justify-center rounded-lg border border-[var(--hairline-2)] bg-[var(--overlay-3)] text-text-tertiary">
              <Receipt aria-hidden size={20} />
            </span>
            <p className="mt-3 text-base font-semibold text-text-primary">Nothing spent yet</p>
            <p className="mt-1 text-sm leading-relaxed text-text-tertiary">
              Each reply adds its cost here as it lands.
            </p>
          </motion.div>
        ) : (
          <table className="w-full table-fixed text-xs">
            <Columns />
            <thead>
              <tr className="meta">
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
                  className="border-t border-[var(--hairline-2)] align-top"
                >
                  <td className="py-2.5 pl-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
                      <span className="truncate text-[13px] font-medium text-text-primary" title={row.name}>
                        {row.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate pl-3.5 text-[11px] text-text-tertiary">
                      @{row.handle}
                      {row.replies + row.images > 0 && ` · ${count(row.replies, row.images)}`}
                    </span>
                    {row.stopped > 0 && (
                      <span className="block truncate pl-3.5 text-[11px] text-text-quaternary" title={NOT_REPORTED}>
                        + {row.stopped} stopped
                      </span>
                    )}
                  </td>
                  <td className="figure whitespace-nowrap py-2.5 text-right text-[11px] leading-5 text-text-tertiary">
                    {tokens(row.tokens) ?? <Muted title={row.replies + row.images > 0 ? undefined : NOT_REPORTED} />}
                  </td>
                  <td className="figure py-2.5 pr-1 text-right text-xs font-medium leading-5 text-text-primary">
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

      <div className="shrink-0 border-t border-[var(--hairline-4)] bg-[var(--overlay-1)] px-3 pb-3 pt-2">
        <table className="w-full table-fixed text-xs">
          <Columns />
          <tbody>
            <tr>
              <td className="py-1 pl-1">
                <span className="meta text-text-primary!">Total</span>
                {unpriced && rows.length > 0 && (
                  <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">+ unpriced tokens</span>
                )}
              </td>
              <td className="figure whitespace-nowrap py-1 text-right align-top text-[11px] leading-6 text-text-secondary">
                {tokens(summary.tokens) ?? "0"}
              </td>
              <td className="py-1 pr-1 text-right align-top">
                <motion.span
                  key={total}
                  initial={{ opacity: 0.7, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="figure inline-block whitespace-nowrap text-sm font-semibold leading-6 text-app-blue"
                >
                  {priced || rows.length === 0 ? money(total) : <Muted title={unpriced ? undefined : NOT_REPORTED} />}
                </motion.span>
              </td>
            </tr>
          </tbody>
        </table>
        {stopped > 0 && (
          <p className="mt-2 px-1 text-[11px] leading-snug text-text-tertiary">
            {stopped === 1 ? "1 stopped reply is" : `${stopped} stopped replies are`} not in these figures: the model
            reports tokens only when a reply finishes, and Bedrock still bills what was generated.
          </p>
        )}
        {prices && (
          <p className="mt-2 px-1 text-[11px] leading-snug text-text-tertiary">
            USD, AWS price list read{" "}
            <a
              href={prices.source}
              target="_blank"
              rel="noreferrer"
              className="figure underline underline-offset-2 transition-colors hover-fine:text-text-primary"
            >
              {prices.checked}
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
