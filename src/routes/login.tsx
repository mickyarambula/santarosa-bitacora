import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CYCLE, COMPANY } from "@/lib/catalog";
import { getSignupGate } from "@/lib/crm";

const CODE_KEY = "sr-access-code";

export const Route = createFileRoute("/login")({ component: Login });

function rememberCode(code: string) {
  try {
    if (code.trim()) sessionStorage.setItem(CODE_KEY, code.trim());
    else sessionStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
}

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"entrar" | "crear">("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gate = useQuery({ queryKey: ["signup-gate"], queryFn: () => getSignupGate() });
  const needCode = Boolean(gate.data?.lockOn && gate.data.teamExists);

  if (!isPending && user) return <Navigate to="/" />;

  const mismatch = mode === "crear" && confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    if (mode === "crear") {
      if (password.length < 8) {
        setError("La contraseña necesita al menos 8 caracteres.");
        return;
      }
      if (password !== confirm) {
        setError("Las contraseñas no coinciden. Escríbela otra vez para confirmar.");
        return;
      }
      if (needCode && !accessCode.trim()) {
        setError("Gerencia puso candado. Pide la clave del equipo.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    rememberCode(accessCode);
    try {
      if (mode === "crear") {
        const { error: err } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.split("@")[0] || "Comisionista",
        });
        if (err) throw new Error(err.message ?? "No se pudo crear la cuenta.");
      } else {
        const { error: err } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (err) throw new Error(err.message ?? "Correo o contraseña incorrectos.");
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-bg text-fg">
      <div className="relative mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-5 py-12 lg:grid-cols-2 lg:px-10">
        <section className="hidden lg:block">
          <BrandLogo variant="lockup" on="light" className="w-72" priority />
          <p className="mt-8 text-xs uppercase tracking-widest text-muted">Ciclo {CYCLE}</p>
          <h1 className="mt-4 font-display text-5xl font-medium leading-[1.05] tracking-tight">
            La bitácora
            <br />
            del comisionista.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            Captura productores en el campo, agenda la visita y ve checando la papelería — sin
            pelearte con el Excel. {COMPANY}, Los Mochis y Guasave.
          </p>
        </section>

        <section className="w-full max-w-md justify-self-center rounded-xl bg-bg p-6 text-fg shadow-[var(--shadow-border)] sm:p-8">
          <div className="lg:hidden">
            <BrandLogo variant="lockup" on="light" className="w-44" priority />
            <p className="mt-3 text-xs uppercase tracking-widest text-muted">Ciclo {CYCLE}</p>
          </div>
          <h2 className="mt-5 font-display text-2xl font-medium tracking-tight lg:mt-0 lg:text-3xl">
            Entra para capturar
          </h2>
          <p className="mt-1 text-sm text-muted">El ciclo {CYCLE} de {COMPANY}.</p>

          {authEnabled ? (
            <div className="mt-6 grid gap-2">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={busy || isPending}
                  onClick={() => {
                    rememberCode(accessCode);
                    signIn(p.providerId, { callbackURL: "/" });
                  }}
                >
                  Continuar con {p.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted">El acceso está desactivado.</p>
          )}

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-subtle">
            <span className="h-px flex-1 bg-border" />
            o con correo
            <span className="h-px flex-1 bg-border" />
          </div>

          <form className="grid gap-3" onSubmit={onEmail}>
            {mode === "crear" ? (
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cómo te dicen en el campo"
                autoComplete="name"
              />
            ) : null}
            <Input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo"
              autoComplete="email"
            />
            <PasswordInput
              value={password}
              onChange={setPassword}
              show={showPass}
              placeholder="Contraseña"
              autoComplete={mode === "crear" ? "new-password" : "current-password"}
            />
            {mode === "crear" ? (
              <PasswordInput
                value={confirm}
                onChange={setConfirm}
                show={showPass}
                placeholder="Confirma la contraseña"
                autoComplete="new-password"
              />
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-start gap-2 text-sm font-medium text-primary"
              onClick={() => setShowPass((v) => !v)}
            >
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showPass ? "Ocultar contraseña" : "Ver contraseña"}
            </button>
            {tooShort ? (
              <p className="text-sm text-muted">Mínimo 8 caracteres.</p>
            ) : null}
            {mismatch ? (
              <p className="text-sm text-destructive">No coinciden. Escríbela otra vez.</p>
            ) : mode === "crear" && confirm.length > 0 && password === confirm ? (
              <p className="text-sm text-primary">Listo, coinciden.</p>
            ) : null}
            {needCode ? (
              <Input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Clave del equipo (si es tu primera vez)"
                autoComplete="off"
              />
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              size="lg"
              disabled={busy || isPending || mismatch || (mode === "crear" && password.length < 8)}
            >
              {busy ? "Un momento…" : mode === "crear" ? "Crear cuenta" : "Entrar"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted underline-offset-4 hover:underline"
            onClick={() => {
              setMode(mode === "crear" ? "entrar" : "crear");
              setError(null);
              setConfirm("");
              setShowPass(false);
            }}
          >
            {mode === "crear" ? "Ya tengo cuenta" : "Soy nuevo · crear cuenta"}
          </button>
          <p className="mt-5 text-xs leading-relaxed text-subtle">
            Nadie elige el rol al registrarse. El primero en crear cuenta queda de gerencia. Los que
            sigan entran como comisionistas. Gerencia pone un candado (clave del equipo) para que no
            entre cualquiera con el link. Si alguien se cuela, en Equipo se inhabilita o se borra.
          </p>
        </section>
      </div>
    </main>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  placeholder: string;
  autoComplete: string;
}) {
  return (
    <Input
      required
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      minLength={8}
      spellCheck={false}
    />
  );
}
