import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignPortfolio } from "@/lib/operations";
import { listTeam } from "@/lib/crm";
import type { Producer } from "@/lib/types";
import { useViewAs } from "@/lib/view-as";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";
export function PortfolioAssignment({ producer: p }: { producer: Producer }) {
  const { canOperate, isOffice } = useViewAs(),
    qc = useQueryClient(),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState(p.portfolioKind ?? "comisionista"),
    [owner, setOwner] = useState(p.ownerUserId),
    [attention, setAttention] = useState(p.attentionUserId ?? ""),
    [reason, setReason] = useState(""),
    [group, setGroup] = useState(false),
    [tasks, setTasks] = useState(false);
  const q = useQuery({
    queryKey: ["team"],
    queryFn: () => listTeam(),
    enabled: canOperate && open,
  });
  const m = useMutation({
    mutationFn: assignPortfolio,
    onSuccess: () => {
      void qc.invalidateQueries();
      setOpen(false);
      setReason("");
      toast.success("Asignación guardada con historial.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section
      id="asignacion"
      className="scroll-mt-24 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="font-display text-xl">Cartera y atención</h2>
      <p className="mt-2 text-sm">
        <strong>Cartera:</strong> {p.comisionistaName}
        <br />
        <strong>Atiende:</strong> {p.attentionName ?? "Por confirmar"}
        <br />
        <strong>Capturó:</strong> {p.capturedName ?? "No consta en el registro anterior"}
        {p.intakeChannel ? (
          <>
            <br />
            <strong>Llegó por:</strong> {p.intakeChannel}
          </>
        ) : null}
      </p>
      {canOperate && !p.archivedAt ? (
        <Button className="mt-3" variant="outline" onClick={() => setOpen((v) => !v)}>
          Revisar asignación
        </Button>
      ) : null}
      {open ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({
              data: {
                id: p.id,
                portfolioKind: kind,
                ownerUserId: kind === "comisionista" ? owner : undefined,
                attentionUserId: attention,
                reason,
                expectedUpdatedAt: p.updatedAt,
                confirmGroup: group,
                reassignOpenTasks: tasks,
              },
            });
          }}
        >
          <label>
            Cartera comercial
            <NativeSelect
              aria-label="Cartera comercial"
              value={kind}
              disabled={isOffice && p.portfolioKind !== "pendiente"}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setOwner("");
                setAttention("");
              }}
            >
              <option value="empresa">Cartera de empresa</option>
              <option value="comisionista">Con comisionista</option>
              <option value="pendiente">Pendiente de asignar</option>
            </NativeSelect>
          </label>
          {kind === "comisionista" ? (
            <label>
              Comisionista
              <NativeSelect
                required
                aria-label="Comisionista"
                value={owner}
                disabled={isOffice && p.portfolioKind !== "pendiente"}
                onChange={(e) => {
                  setOwner(e.target.value);
                  setAttention("");
                }}
              >
                <option value="">Elige una cuenta</option>
                {q.data?.agents
                  .filter((a) => a.status === "activo" && a.role !== "oficina")
                  .map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.displayName} · {a.email}
                    </option>
                  ))}
              </NativeSelect>
            </label>
          ) : null}
          <label>
            Persona de atención
            <NativeSelect
              required
              aria-label="Persona de atención"
              value={attention}
              onChange={(e) => setAttention(e.target.value)}
            >
              <option value="">Elige quién atenderá</option>
              {q.data?.agents
                .filter(
                  (a) =>
                    a.status === "activo" &&
                    (a.role !== "comisionista" || (kind === "comisionista" && a.userId === owner)),
                )
                .map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.displayName} · {a.email}
                  </option>
                ))}
            </NativeSelect>
          </label>
          <label>
            Motivo de la asignación
            <Textarea
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {p.groupId ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
              Si cambia la cartera, confirmo trasladar todas las fichas del grupo.
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={tasks} onChange={(e) => setTasks(e.target.checked)} />
            Trasladar a la nueva persona de atención las tareas abiertas de un comisionista que
            pierda acceso a esta cartera.
          </label>
          <p className="text-xs text-muted">
            Oficina puede resolver carteras pendientes. Gerencia autoriza cambios de carteras
            establecidas.
          </p>
          {q.error ? <p role="alert">{q.error.message}</p> : null}
          <Button disabled={m.isPending || q.isPending}>Guardar asignación</Button>
        </form>
      ) : null}
    </section>
  );
}
