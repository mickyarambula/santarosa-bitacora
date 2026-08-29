import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ONBOARDING_STEPS } from "@/lib/guide";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

const KEY = "sr-onboarding-v2";

export function Onboarding({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  function done() {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;
  const current = ONBOARDING_STEPS[step];
  const last = step === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-3 sm:place-items-center">
      <div
        role="dialog"
        aria-labelledby="onboard-title"
        className="w-full max-w-md rounded-xl bg-surface p-5 shadow-lg sm:p-6"
      >
        <p className="text-xs font-medium uppercase tracking-wider text-subtle">
          {profile.role === "gerente" ? "Para gerencia y comisionistas" : "Cómo se usa"} · {step + 1} de{" "}
          {ONBOARDING_STEPS.length}
        </p>
        <h2 id="onboard-title" className="mt-2 font-display text-2xl font-medium tracking-tight">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>
        {profile.role === "gerente" && step === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Tú ves a todo el equipo. El de ventas, si también captura, súbelo a gerencia: no pierde
            su cartera.
          </p>
        ) : null}
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {ONBOARDING_STEPS.map((_, i) => (
            <span
              key={i}
              className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="min-h-11 text-sm text-muted underline-offset-4 hover:underline" onClick={done}>
            Saltar
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                Atrás
              </Button>
            ) : null}
            {last ? (
              <Button asChild onClick={done}>
                <Link to="/productores/nuevo">Empezar a capturar</Link>
              </Button>
            ) : (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
