"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { AdminSidebar } from "@/components/admin/admin-sidebar";

/**
 * Client wrapper around AdminSidebar + a mobile-only top bar with a
 * hamburger trigger — admin/layout.tsx stays a server component (the
 * requirePlatformAdmin() gate), same split as dashboard-shell.tsx vs.
 * the dashboard's own layout.tsx.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-foreground">Zentro Med — Admin</span>
        </header>
        <main className="flex-1 overflow-x-hidden px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
