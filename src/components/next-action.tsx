import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getNextAction, saveNextAction, finishNextAction } from "@/lib/crm";
import { formatAppDateTime, toAppDateTimeInput } from "@/lib/datetime";
type Action = Awaited<ReturnType<typeof getNextAction>>;
export function NextAction({
  producerId,
  embedded = false,
}: {
  producerId: string;
  embedded?: boolean;
}) {
  const qc = useQueryClient(),
    [editing, setEditing] = useState(false),
    [finishing, setFinishing] = useState<"atendida" | "cancelada" | null>(null);
  const q = useQuery({
    queryKey: ["next-action", producerId],
    queryFn: () => getNextAction({ data: { producerId } }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["next-action"] });
    void qc.invalidateQueries({ queryKey: ["next-actions"] });
    void qc.invalidateQueries({ queryKey: ["producer", producerId] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const save = useMutation({
    mutationFn: saveNextAction,
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast.success("Próxima acción guardada.");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
  });
  const finish = useMutation({
    mutationFn: finishNextAction,
    onSuccess: () => {
      refresh();
      setFinishing(null);
      toast.success("Resultado guardado en la bitácora.");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
  });
  return (
    <section
      id={embedded ? undefined : "seguimiento"}
      className="scroll-mt-24 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="font-display text-xl font-medium">Próxima acción</h2>
      {q.isPending ? (
        <p>Cargando seguimiento…</p>
      ) : q.error ? (
        <p role="alert">
          No se pudo cargar el seguimiento.{" "}
          <Button variant="ghost" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        </p>
      ) : q.data ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Responsable: {q.data.ownerName}. La acción acompaña a la cartera si cambia de
            responsable.
          </p>
          {q.data.text ? (
            <div className="mt-3 rounded-lg bg-secondary p-3">
              <p className="font-medium break-words">{q.data.text}</p>
              <p className="mt-1 text-sm">{formatAppDateTime(q.data.dueAt!)} · hora de Sinaloa</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Sin próxima acción. Define qué sigue y para cuándo.
            </p>
          )}
          {editing ? (
            <ActionForm
              key={producerId}
              action={q.data}
              pending={save.isPending}
              onCancel={() => setEditing(false)}
              onSave={(d) => save.mutate({ data: d })}
            />
          ) : finishing ? (
            <FinishForm
              key={finishing}
              action={q.data}
              status={finishing}
              pending={finish.isPending}
              onCancel={() => setFinishing(null)}
              onSave={(d) => finish.mutate({ data: d })}
            />
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {!q.data.closed ? (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  {q.data.text ? "Cambiar seguimiento" : "Definir próxima acción"}
                </Button>
              ) : (
                <p className="text-sm text-muted">
                  La ficha está cerrada o pertenece a otro ciclo. Conservamos el seguimiento
                  anterior.
                </p>
              )}
              {q.data.text ? (
                <>
                  <Button onClick={() => setFinishing("atendida")}>Marcar atendida</Button>
                  <Button variant="ghost" onClick={() => setFinishing("cancelada")}>
                    Cancelar acción
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
function ActionForm({
  action,
  pending,
  onCancel,
  onSave,
}: {
  action: Action;
  pending: boolean;
  onCancel: () => void;
  onSave: (d: {
    producerId: string;
    text: string;
    dueAt: string;
    reason: string;
    expectedVersion: string;
  }) => void;
}) {
  const [text, setText] = useState(action.text ?? ""),
    [date, setDate] = useState(action.dueAt ? toAppDateTimeInput(action.dueAt) : ""),
    [reason, setReason] = useState(""),
    [version] = useState(action.version),
    [wasPending] = useState(Boolean(action.text));
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          producerId: action.producerId,
          text,
          dueAt: date,
          reason,
          expectedVersion: version,
        });
      }}
    >
      <label className="grid gap-1 text-sm">
        Qué sigue
        <Input
          required
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej. Recoger INE y confirmar superficie"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Fecha y hora de seguimiento
        <Input
          required
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <p className="text-xs text-muted">
        Hora de Sinaloa. Programar esta acción no cambia la etapa ni crea una cita.
      </p>
      {wasPending ? (
        <label className="grid gap-1 text-sm">
          Motivo del cambio de seguimiento
          <Input
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending}>{pending ? "Guardando…" : "Guardar próxima acción"}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar edición
        </Button>
      </div>
    </form>
  );
}
function FinishForm({
  action,
  status,
  pending,
  onCancel,
  onSave,
}: {
  action: Action;
  status: "atendida" | "cancelada";
  pending: boolean;
  onCancel: () => void;
  onSave: (d: {
    producerId: string;
    status: "atendida" | "cancelada";
    outcome: string;
    expectedVersion: string;
  }) => void;
}) {
  const [outcome, setOutcome] = useState(""),
    [version] = useState(action.version);
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ producerId: action.producerId, status, outcome, expectedVersion: version });
      }}
    >
      <label className="grid gap-1 text-sm">
        {status === "atendida" ? "Qué se hizo y cuál fue el resultado" : "Por qué se cancela"}
        <Textarea
          required
          maxLength={1000}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
      </label>
      <p className="text-xs text-muted">El resultado y tu nombre quedarán en la bitácora.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending}>
          {pending
            ? "Guardando…"
            : status === "atendida"
              ? "Guardar resultado"
              : "Confirmar cancelación"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
          Volver
        </Button>
      </div>
    </form>
  );
}
