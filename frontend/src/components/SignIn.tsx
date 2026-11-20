import { MessagesSquare } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { startSignIn } from "../auth";
import { Button } from "./Button";

const EASE = [0.16, 1, 0.3, 1] as const;

/** The centred flat card the gate screens share, on the app canvas, padded clear of a phone's notch and home bar. */
export function GateCard({ children }: { children: ReactNode }) {
  return (
    <div className="shell flex min-h-full items-center justify-center bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-text-primary">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="w-full max-w-sm rounded-lg border border-[var(--hairline-2)] bg-surface-1 p-6"
      >
        {children}
      </motion.div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SignIn({ error }: { error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setFailure(null);
    try {
      await startSignIn();
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "Sign-in could not start.");
      setBusy(false);
    }
  }

  const line = failure ?? error ?? null;
  return (
    <GateCard>
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-text-primary text-background">
          <MessagesSquare aria-hidden size={14} />
        </span>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-4">
            confab<span className="text-app-blue">.</span>
          </h1>
          <p className="text-[10px] leading-4 text-text-tertiary">Sign in to continue</p>
        </div>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-text-tertiary">
        A group chat with Bedrock models. Private to its owner.
      </p>
      <Button
        variant="primary"
        onClick={go}
        pending={busy}
        icon={<GitHubMark />}
        className="mt-6 w-full"
      >
        {busy ? "Opening GitHub" : "Sign in with GitHub"}
      </Button>
      {line && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          role="alert"
          className="mt-4 text-sm text-app-red"
        >
          {line}
        </motion.p>
      )}
    </GateCard>
  );
}
