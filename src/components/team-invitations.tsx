import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTeamInvitation, listTeamInvitations, revokeTeamInvitation } from "@/lib/crm";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatAppDateTime } from "@/lib/datetime";
export function TeamInvitations() {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["team-invitations"], queryFn: () => listTeamInvitations() });
  const create = useMutation({
    mutationFn: createTeamInvitation,
    onSuccess: (r) => {
      setLink(window.location.origin + r.path);
      void qc.invalidateQueries({ queryKey: ["team-invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: revokeTeamInvitation,
    onSuccess: () => {
      setLink("");
      void qc.invalidateQueries({ queryKey: ["team-invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <details className="rounded-xl border bg-surface p-4">
      <summary className="min-h-11 cursor-pointer py-2 font-display text-lg">
        Invitar a una persona
      </summary>
      <p className="my-2 text-sm text-muted">
        Enlace individual para ese correo, válido por 7 días y un solo uso. Entra como comisionista;
        después asigna sus funciones. Compártelo únicamente con esa persona.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ data: { email } });
        }}
      >
        <Input
          type="email"
          aria-label="Correo de la invitación"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
        />
        <Button disabled={create.isPending}>Crear invitación</Button>
      </form>
      {link ? (
        <div className="my-3 grid gap-2">
          <Input readOnly value={link} aria-label="Enlace de invitación" />
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => toast.success("Enlace copiado."))
                .catch(() => toast.error("Selecciona el enlace y cópialo."))
            }
          >
            Copiar enlace
          </Button>
          <p className="text-xs">El mensaje no se envía automáticamente.</p>
        </div>
      ) : null}
      {q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {q.data?.items.map((i) => (
            <li key={i.id} className="rounded border p-2 text-sm">
              <p>{i.email}</p>
              <p className="text-xs text-muted">
                {i.claimed_at
                  ? "Aceptada"
                  : i.revoked_at
                    ? "Cancelada"
                    : new Date(i.expires_at).getTime() < Date.now()
                      ? "Vencida"
                      : "Vence " + formatAppDateTime(i.expires_at)}
              </p>
              {!i.claimed_at && !i.revoked_at ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ data: { id: i.id } })}
                >
                  Cancelar invitación
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
