import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootstrap } from "@/lib/crm";
import { ViewAsProvider } from "@/lib/view-as";
import { AppShell } from "@/components/app-shell";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { CYCLE } from "@/lib/catalog";

const CODE_KEY = "sr-access-code";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const boot = useQuery({
    queryKey: ["bootstrap", user?.id],
    enabled: Boolean(user),
    queryFn: () => {
      let accessCode: string | null = null;
      try {
        accessCode = sessionStorage.getItem(CODE_KEY);
      } catch {
        /* ignore */
      }
      return bootstrap({
        data: { displayName: user?.displayName ?? null, accessCode },
      });
    },
  });

  if (isPending) return <Splash />;
  if (!user) return <RedirectToSignIn />;
  if (boot.isPending || !boot.data) return <Splash />;
  if (boot.error) {
    const msg = (boot.error as Error).message;
    if (msg === "Unauthorized") return <RedirectToSignIn />;
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
        <p className="max-w-sm text-muted">{msg}</p>
      </div>
    );
  }

  if (boot.data.profile.status === "bloqueado") {
    return <LockedScreen />;
  }

  return (
    <ViewAsProvider profile={boot.data.profile}>
      <AppShell profile={boot.data.profile}>{children}</AppShell>
    </ViewAsProvider>
  );
}

function LockedScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div className="max-w-sm">
        <BrandLogo variant="lockup" on="light" className="mx-auto w-44" priority />
        <h1 className="mt-6 font-display text-2xl font-medium tracking-tight">
          Esta cuenta no está autorizada
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Gerencia tiene el candado puesto, o inhabilitó esta cuenta. Pide la clave del equipo o
          que te habiliten desde Equipo.
        </p>
        <Button
          className="mt-6"
          variant="outline"
          onClick={() => {
            try {
              sessionStorage.removeItem(CODE_KEY);
            } catch {
              /* ignore */
            }
            void signOut("/login");
          }}
        >
          Salir
        </Button>
      </div>
    </main>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg text-fg">
      <div className="flex flex-col items-center px-6">
        <BrandLogo variant="lockup" on="light" className="w-48" priority />
        <p className="mt-3 text-xs uppercase tracking-widest text-muted">Ciclo {CYCLE}</p>
      </div>
    </div>
  );
}
