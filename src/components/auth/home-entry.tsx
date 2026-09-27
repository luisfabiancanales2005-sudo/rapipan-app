"use client";

import { useState, useSyncExternalStore } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/components/dashboard/dashboard";
import { InviteSetup } from "./invite-setup";

export function HomeEntry() {
  const isInvitation = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.hash.slice(1)).get("type") === "invite",
    () => null,
  );
  const [completed, setCompleted] = useState(false);

  if (isInvitation === null) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]" role="status">Preparando Rapipan…</main>;
  }
  if (isInvitation && !completed) {
    return <InviteSetup onComplete={() => setCompleted(true)} />;
  }
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
