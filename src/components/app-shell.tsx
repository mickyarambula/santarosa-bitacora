import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  CircleHelp,
  Columns3,
  Copy,
  Download,
  Ellipsis,
  FolderOpen,
  Home,
  Layers,
  MessageCircle,
  Megaphone,
  Plus,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { CYCLE } from "@/lib/catalog";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MINE_SCOPE, useViewAs } from "@/lib/view-as";
import { BrandLogo } from "@/components/brand-logo";
import { Onboarding } from "@/components/onboarding";

const NAV = [
  { to: "/", label: "Hoy", icon: Home },
  { to: "/embudo", label: "Embudo", icon: Columns3 },
  { to: "/productores", label: "Productores", icon: Users },
  { to: "/citas", label: "Citas", icon: CalendarDays },
] as const;

const MORE = [
  { to: "/papeleria", label: "Papelería", icon: FolderOpen },
  { to: "/grupos", label: "Grupos", icon: Layers },
  { to: "/recordatorios", label: "WhatsApp", icon: MessageCircle },
  { to: "/avisos", label: "Avisos", icon: Megaphone },
  { to: "/guia", label: "Cómo se usa", icon: CircleHelp },
  { to: "/equipo", label: "Equipo", icon: UsersRound },
  { to: "/duplicados", label: "Duplicados", icon: Copy },
  { to: "/exportar", label: "Bajar Excel", icon: Download },
] as const;

export function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { agent, setAgent, names, isGerente } = useViewAs();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems = MORE.filter((item) => {
    if (item.to === "/duplicados" && profile.role !== "gerente") return false;
    if (item.to === "/avisos" && profile.role !== "gerente") return false;
    return true;
  });
  const moreActive = moreItems.some((item) => pathname.startsWith(item.to));

  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden md:flex md:flex-col md:bg-sidebar md:text-sidebar-foreground">
        <div className="px-5 pt-8 pb-6">
          <BrandLogo variant="lockup" on="dark" className="w-40" home />
          <p className="mt-3 text-xs uppercase tracking-widest text-sidebar-muted">
            Almacenes · Ciclo {CYCLE}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} label={item.label} icon={item.icon} pathname={pathname} dark />
          ))}
          <div className="my-3 h-px bg-primary-fg/10" />
          {moreItems.map((item) => (
            <NavLink key={item.to} to={item.to} label={item.label} icon={item.icon} pathname={pathname} dark />
          ))}
        </nav>
        <div className="mt-auto border-t border-primary-fg/10 p-4">
          <p className="text-xs uppercase tracking-wider text-sidebar-muted">
            {profile.role === "gerente" ? "Gerencia · ve a todos y captura" : "Comisionista"}
          </p>
          <p className="mt-1 truncate font-medium">{profile.displayName}</p>
          {isGerente && names.length > 0 ? (
            <label className="mt-3 block">
              <span className="text-[11px] uppercase tracking-wider text-sidebar-muted">Ver cartera de</span>
              <select
                className="mt-1 h-10 w-full rounded-md border-0 bg-primary-fg/10 px-2 text-sm text-primary-fg"
                value={agent ?? ""}
                onChange={(e) => setAgent(e.target.value || null)}
              >
                <option value="">Todo el equipo</option>
                <option value={MINE_SCOPE}>Mi cartera</option>
                {names
                  .filter((n) => n !== profile.displayName)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <div className="mt-3 text-sidebar-muted">
            <UserButton compact />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col bg-bg">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-bg px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:hidden">
          <BrandLogo variant="header" on="light" home />
          <div className="flex min-w-0 items-center gap-2">
            {isGerente && names.length > 0 ? (
              <select
                aria-label="Ver cartera de"
                className="h-10 max-w-36 truncate rounded-full border-0 bg-secondary px-3 text-xs font-medium text-primary"
                value={agent ?? ""}
                onChange={(e) => setAgent(e.target.value || null)}
              >
                <option value="">Todo el equipo</option>
                <option value={MINE_SCOPE}>Mi cartera</option>
                {names
                  .filter((n) => n !== profile.displayName)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary">
                {profile.role === "gerente" ? "Gerencia" : profile.displayName.split(" ")[0]}
              </span>
            )}
            <div>
              <UserButton compact />
            </div>
          </div>
        </header>

        {agent ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary px-4 py-2 text-sm md:px-8">
            <p>
              {agent === MINE_SCOPE
                ? "Viendo tu cartera — lo que capturaste tú."
                : <>Viendo como <span className="font-medium">{agent}</span> — así se ve su bitácora.</>}
            </p>
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setAgent(null)}
            >
              Volver a gerencia
            </button>
          </div>
        ) : null}

        <main className="flex-1 bg-bg px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-10">{children}</main>
        <Onboarding profile={profile} />

        {pathname === "/" || pathname.startsWith("/productores/nuevo") ? null : (
          <Link
            to="/productores/nuevo"
            className="fixed right-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 active:scale-[0.96] md:bottom-8 md:right-8"
            style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
            aria-label="Capturar productor"
          >
            <Plus className="size-6" />
          </Link>
        )}

        {moreOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-ink/30"
              aria-label="Cerrar"
              onClick={() => setMoreOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-lg font-medium">Más</p>
                <button
                  type="button"
                  className="grid size-11 place-items-center rounded-md text-muted"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Cerrar"
                >
                  <X className="size-5" />
                </button>
              </div>
              <nav className="grid gap-1">
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium",
                        active ? "bg-secondary text-fg" : "text-fg hover:bg-secondary",
                      )}
                    >
                      <Icon className="size-5 text-primary" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        ) : null}

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              moreActive || moreOpen ? "text-primary" : "text-muted",
            )}
          >
            <Ellipsis className="size-5" />
            Más
          </button>
        </nav>
      </div>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  pathname,
  dark,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  pathname: string;
  dark?: boolean;
}) {
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
        dark
          ? active
            ? "bg-primary-fg/10 text-primary-fg"
            : "text-sidebar-muted hover:bg-primary-fg/5 hover:text-primary-fg"
          : active
            ? "bg-secondary text-fg"
            : "text-muted hover:bg-secondary hover:text-fg",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
