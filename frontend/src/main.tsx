// Self-hosted, so the installed tool serves its page offline: no font CDN.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthGate } from "./AuthGate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>{(session) => <App session={session} />}</AuthGate>
  </StrictMode>,
);
