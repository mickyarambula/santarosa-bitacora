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
      let invitationToken: string | null = null;
      try {
        accessCode = sessionStorage.getItem(CODE_KEY);
        invitationToken = sessionStorage.getItem("sr-invitation-token");
      } catch {
        /* ignore */
      }
      return bootstrap({
        data: { displayName: user?.displayName ?? null, accessCode, invitationToken },
      });
    },
  });

  if (isPending) return <Splash />;
  if (!user) return <RedirectToSignIn />;
  if (boot.error) {
    const msg = (boot.error as Error).message;
    if (msg === "Unauthorized") return <RedirectToSignIn />;
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
        <div className="max-w-sm space-y-4">
          <p className="text-muted">No se pudo abrir la bitácora. {msg}</p>
          <Button onClick={() => void boot.refetch()}>Volver a intentar</Button>
        </div>
      </div>
    );
  }
  if (boot.isPending || !boot.data) return <Splash />;

  if (boot.data.profile.status === "bloqueado") {
    return (
      <LockedScreen
        mergedIntoEmail={boot.data.profile.mergedIntoEmail}
        duplicateReview={boot.data.profile.duplicateReview}
      />
    );
  }

  return (
    <ViewAsProvider profile={boot.data.profile}>
      <AppShell profile={boot.data.profile}>{children}</AppShell>
    </ViewAsProvider>
  );
}

function LockedScreen({
  mergedIntoEmail,
  duplicateReview,
}: {
  mergedIntoEmail?: string | null;
  duplicateReview?: boolean;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div className="max-w-sm">
        <BrandLogo variant="lockup" on="light" className="mx-auto w-44" priority />
        <h1 className="mt-6 font-display text-2xl font-medium tracking-tight">
          {mergedIntoEmail
            ? "Tu cuenta fue unificada"
            : duplicateReview
              ? "Revisemos tu cuenta existente"
              : "Esta cuenta no está autorizada"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {mergedIntoEmail ? (
            <>
              Tus productores están reunidos en <strong>{mergedIntoEmail}</strong>. Sal de esta
              cuenta y entra con ese correo con su método habitual de acceso.
            </>
          ) : duplicateReview ? (
            <span>
              Hay una coincidencia con otra cuenta del equipo. Este acceso no puede capturar
              productores hasta que gerencia lo revise. Si ya tienes cuenta, sal y entra con tu
              correo habitual.
            </span>
          ) : (
            <>
              Pide a gerencia que habilite tu cuenta desde Equipo. Volver a escribir la clave del
              equipo no reactiva una cuenta bloqueada.
            </>
          )}
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
