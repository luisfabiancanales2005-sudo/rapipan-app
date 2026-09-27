import { MobileNav, Sidebar } from "./navigation";
import { AuthGate } from "@/components/auth/auth-gate";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="page-shell">
        <Sidebar />
        <main className="main-content">{children}</main>
        <MobileNav />
      </div>
    </AuthGate>
  );
}
