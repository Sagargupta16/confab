import { WifiOff } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { API_BASE, ApiError, clearTokens, finishSignIn, hasTokens, isCallbackPath, onSignedOut, signOut } from "./auth";
import { getHealth, getMe } from "./client";
import { Button } from "./components/Button";
import { GateCard, SignIn } from "./components/SignIn";
import type { Me, ServerMode } from "./wire";

export type Session = { mode: ServerMode; version: string; user: Me | null; signOut: (() => void) | null };

type State =
  | { kind: "loading" }
  | { kind: "unreachable" }
  | { kind: "signin"; error: string | null }
  | { kind: "ready"; session: Session };

export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const set = (next: State) => {
      if (live) setState(next);
    };

    async function boot() {
      let health;
      try {
        health = await getHealth();
      } catch {
        set({ kind: "unreachable" });
        return;
      }
      if (health.mode === "local") {
        set({ kind: "ready", session: { mode: "local", version: health.version, user: null, signOut: null } });
        return;
      }

      if (isCallbackPath()) {
        try {
          await finishSignIn();
        } catch (caught) {
          set({ kind: "signin", error: caught instanceof Error ? caught.message : "Sign-in failed. Start again." });
          return;
        }
      }
      if (!hasTokens()) {
        set({ kind: "signin", error: null });
        return;
      }
      try {
        const user = await getMe();
        set({
          kind: "ready",
          session: {
            mode: "hosted",
            version: health.version,
            user,
            signOut: () => {
              void signOut();
            },
          },
        });
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 403) {
          clearTokens();
          set({ kind: "signin", error: caught.detail });
        } else if (caught instanceof ApiError && caught.status === 401) {
          set({ kind: "signin", error: null });
        } else {
          set({ kind: "unreachable" });
        }
      }
    }

    void boot();
    const off = onSignedOut(() => set({ kind: "signin", error: null }));
    return () => {
      live = false;
      off();
    };
  }, [attempt]);

  if (state.kind === "ready") return <>{children(state.session)}</>;
  if (state.kind === "signin") return <SignIn error={state.error} />;
  if (state.kind === "unreachable") {
    return (
      <GateCard>
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-lg border border-[var(--hairline-2)] bg-[var(--overlay-3)] text-text-secondary">
            <WifiOff aria-hidden size={20} />
          </span>
          <h1 className="mt-4 text-base font-semibold">Could not reach the API.</h1>
          {API_BASE === "" && (
            <p className="mt-2 text-sm text-text-tertiary">
              Start it with <code className="figure text-text-primary">pnpm run dev</code> from the repo root.
            </p>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setState({ kind: "loading" });
              setAttempt((n) => n + 1);
            }}
            className="mt-6 w-full"
          >
            Try again
          </Button>
        </div>
      </GateCard>
    );
  }
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-full items-center justify-center bg-background px-4"
    >
      <motion.div
        className="w-full max-w-sm space-y-2"
        animate={{ opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 1.35, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="h-4 w-1/3 rounded-md bg-white/[0.03]" />
        <div className="h-10 rounded-md bg-white/[0.03]" />
        <div className="h-10 rounded-md bg-white/[0.03]" />
      </motion.div>
    </div>
  );
}
