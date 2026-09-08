import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listProducerTasks,
  saveProducerTask,
  finishProducerTask,
  listOperationsPeople,
  type TaskRow,
} from "@/lib/operations";
import { getProducer } from "@/lib/crm";
import { formatAppDateTime, toAppDateTimeInput } from "@/lib/datetime";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";
export function ProducerTasks({
  producerId,
  embedded = false,
}: {
  producerId: string;
  embedded?: boolean;
}) {
  const qc = useQueryClient(),
    [page, setPage] = useState(0),
    [form, setForm] = useState<{
      id: string;
      title: string;
      assigneeId: string;
      dueAt: string;
      status: "pendiente" | "esperando";
      expectedVersion?: string;
      reason?: string;
      visitId?: string;
    } | null>(null),
    [finish, setFinish] = useState<TaskRow | null>(null),
    [result, setResult] = useState(""),
    [finishStatus, setFinishStatus] = useState<"atendida" | "cancelada">("atendida");
  const q = useQuery({
    queryKey: ["producer-tasks", producerId, page],
    queryFn: () => listProducerTasks({ data: { producerId, page } }),
  });
  const people = useQuery({
    queryKey: ["operations-people"],
    queryFn: () => listOperationsPeople(),
  });
  const detail = useQuery({
    queryKey: ["producer", producerId],
    queryFn: () => getProducer({ data: { id: producerId } }),
  });
  const p = detail.data?.producer,
    readOnly = !!p?.archivedAt || p?.stage === "cerrado";
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["weekly-report"] });
    void qc.invalidateQueries({ queryKey: ["producer-history"] });
    void qc.invalidateQueries({ queryKey: ["producer-tasks"] });
    void qc.invalidateQueries({ queryKey: ["work-inbox"] });
    void qc.invalidateQueries({ queryKey: ["producer", producerId] });
    void qc.invalidateQueries({ queryKey: ["next-action"] });
    void qc.invalidateQueries({ queryKey: ["next-actions"] });
  };
  const save = useMutation({
    mutationFn: saveProducerTask,
    onSuccess: () => {
      setForm(null);
      refresh();
      toast.success("Tarea guardada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const close = useMutation({
    mutationFn: finishProducerTask,
    onSuccess: () => {
      setFinish(null);
      setResult("");
      refresh();
      toast.success("Resultado guardado.");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
  });
  const patch = (key: string, value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const options =
    people.data?.people.filter((a) => a.role !== "comisionista" || a.user_id === p?.ownerUserId) ??
    [];
  const pending = q.data?.items.filter((t) => ["pendiente", "esperando"].includes(t.status)) ?? [];
  return (
    <section
      id={embedded ? undefined : "seguimiento"}
      className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="font-display text-xl">Tareas y próximos pasos</h2>
      <p className="text-sm text-muted">
        Cada pendiente tiene una persona y una fecha. La cartera del productor se conserva.
      </p>
      {pending[0] ? (
        <p className="rounded-lg bg-secondary p-3 text-sm">
          <strong>Siguiente: {pending[0].title}</strong>
          <br />
          {pending[0].assignee_name} · {formatAppDateTime(pending[0].due_at)}
        </p>
      ) : !q.isPending ? (
        <p className="text-sm">No hay tareas abiertas en esta página.</p>
      ) : null}
      {q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : q.isPending ? (
        <p>Cargando tareas…</p>
      ) : (
        <ul className="space-y-2">
          {q.data?.items.map((t) => (
            <li key={t.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">{t.title}</p>
              <p className="text-sm text-muted">
                {t.assignee_name} · {formatAppDateTime(t.due_at)} ·{" "}
                {t.status === "esperando" ? "Esperando respuesta" : t.status}
              </p>
              {t.result ? <p className="text-sm">Resultado: {t.result}</p> : null}
              {!readOnly && ["pendiente", "esperando"].includes(t.status) ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.visit_id ? (
                    <a
                      href="#citas"
                      className="py-2 underline"
                      onClick={() => {
                        const e = document.getElementById("citas");
                        if (e instanceof HTMLDetailsElement) e.open = true;
                      }}
                    >
                      Atender desde la cita
                    </a>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFinish(t);
                        setResult("");
                        setFinishStatus("atendida");
                      }}
                    >
                      Registrar resultado
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        id: t.id,
                        title: t.title,
                        assigneeId: t.assignee_id,
                        dueAt: toAppDateTimeInput(t.due_at),
                        status: t.status as "pendiente" | "esperando",
                        expectedVersion: t.version,
                        reason: "",
                        visitId: t.visit_id ?? undefined,
                      })
                    }
                  >
                    Ajustar tarea
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {page > 0 || q.data?.hasMore ? (
        <div className="flex gap-2">
          <Button disabled={!page} variant="outline" onClick={() => setPage((n) => n - 1)}>
            Anterior
          </Button>
          <Button
            disabled={!q.data?.hasMore}
            variant="outline"
            onClick={() => setPage((n) => n + 1)}
          >
            Siguiente página
          </Button>
        </div>
      ) : null}
      {!readOnly && !form ? (
        <Button
          onClick={() => {
            setPage(0);
            setForm({
              id: crypto.randomUUID(),
              title: "",
              assigneeId: p?.attentionUserId || people.data?.me.userId || "",
              dueAt: "",
              status: "pendiente",
            });
          }}
        >
          Agregar tarea
        </Button>
      ) : null}
      {form ? (
        <form
          className="grid gap-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              data: {
                ...form,
                producerId,
                reason: form.reason || undefined,
                visitId: form.visitId || undefined,
              },
            });
          }}
        >
          <label className="grid gap-1">
            Qué hay que hacer
            <Textarea
              required
              maxLength={500}
              value={form.title}
              onChange={(e) => patch("title", e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Responsable de la tarea
            <NativeSelect
              required
              aria-label="Responsable de la tarea"
              value={form.assigneeId}
              onChange={(e) => patch("assigneeId", e.target.value)}
            >
              <option value="">Elige una persona</option>
              {options.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.display_name} · {a.role}
                  {options.filter((x) => x.display_name === a.display_name).length > 1
                    ? " · " + a.user_id.slice(-6)
                    : ""}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1">
            Fecha para atender · Sinaloa
            <Input
              type="datetime-local"
              required
              value={form.dueAt}
              onChange={(e) => patch("dueAt", e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Estado de la tarea
            <NativeSelect
              aria-label="Estado de la tarea"
              value={form.status}
              onChange={(e) => patch("status", e.target.value)}
            >
              <option value="pendiente">Pendiente</option>
              <option value="esperando">Esperando respuesta · revisar en esa fecha</option>
            </NativeSelect>
          </label>
          {!form.expectedVersion && detail.data?.visits.some((v) => v.status === "programada") ? (
            <label className="grid gap-1">
              Vincular a una cita (opcional)
              <NativeSelect
                value={form.visitId ?? ""}
                onChange={(e) => {
                  const v = detail.data?.visits.find((v) => v.id === e.target.value);
                  setForm((f) =>
                    f
                      ? {
                          ...f,
                          visitId: v?.id,
                          dueAt: v ? toAppDateTimeInput(v.scheduledAt) : f.dueAt,
                        }
                      : f,
                  );
                }}
              >
                <option value="">Tarea independiente</option>
                {detail.data.visits
                  .filter((v) => v.status === "programada")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {formatAppDateTime(v.scheduledAt)} · {v.purpose}
                    </option>
                  ))}
              </NativeSelect>
            </label>
          ) : null}
          {form.expectedVersion ? (
            <label className="grid gap-1">
              Motivo del ajuste
              <Textarea
                required
                minLength={5}
                maxLength={1000}
                value={form.reason}
                onChange={(e) => patch("reason", e.target.value)}
              />
            </label>
          ) : null}
          <div className="flex gap-2">
            <Button disabled={save.isPending}>Guardar tarea</Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      {finish ? (
        <form
          className="grid gap-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            close.mutate({
              data: {
                id: finish.id,
                expectedVersion: finish.version,
                status: finishStatus,
                result,
              },
            });
          }}
        >
          <p className="font-medium">Resultado de: {finish.title}</p>
          <label>
            Cómo terminó
            <NativeSelect
              aria-label="Cómo terminó"
              value={finishStatus}
              onChange={(e) => setFinishStatus(e.target.value as "atendida" | "cancelada")}
            >
              <option value="atendida">Atendida</option>
              <option value="cancelada">Cancelada</option>
            </NativeSelect>
          </label>
          <label>
            Resultado o motivo
            <Textarea
              required
              minLength={5}
              maxLength={1000}
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={close.isPending}>Guardar resultado</Button>
            <Button variant="ghost" type="button" onClick={() => setFinish(null)}>
              Volver
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
