import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getWeeklyReport, closeWeeklyMeeting, type WeekEvent } from "@/lib/weekly";
import { weekRange } from "@/lib/weekly-dates";
import { appDateKey, formatAppDateTime } from "@/lib/datetime";
import { useViewAs } from "@/lib/view-as";
import { ProducerTasks } from "@/components/producer-tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
export const Route = createFileRoute("/_app/junta")({ component: WeeklyPage });
function WeeklyPage() {
  const { canOperate } = useViewAs();
  const [day, setDay] = useState(() => appDateKey(new Date()));
  const range = weekRange(day);
  const move = (n: number) => {
    const d = new Date(range.start);
    d.setUTCDate(d.getUTCDate() + n);
    setDay(appDateKey(d));
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="font-display text-3xl">{canOperate ? "Junta semanal" : "Mi semana"}</h1>
        <p className="text-muted">
          Revisar lo trabajado, resolver trabas y acordar el siguiente paso.
        </p>
      </header>
      <div className="flex flex-wrap items-end gap-2">
        <Button variant="outline" onClick={() => move(-7)}>
          Semana anterior
        </Button>
        <label className="grid gap-1 text-sm">
          Semana que contiene
          <Input
            type="date"
            value={day}
            onChange={(e) => {
              if (e.target.value && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                setDay(e.target.value);
            }}
          />
        </label>
        <Button variant="outline" onClick={() => move(7)}>
          Semana siguiente
        </Button>
      </div>
      <WeeklyReview key={range.key} day={range.key} />
    </div>
  );
}
const kindLabels: Record<string, string> = {
  contacto: "Contacto registrado",
  alta: "Productor capturado",
  etapa: "Cambio de etapa",
  documento: "Movimiento de papelería",
  visita: "Cita marcada como cumplida",
};
function WeeklyReview({ day }: { day: string }) {
  const { isGerente, canOperate, userId } = useViewAs(),
    qc = useQueryClient();
  const [portfolio, setPortfolio] = useState(canOperate ? "" : userId),
    [section, setSection] = useState<"avances" | "compromisos" | "trabas">("avances"),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(0),
    [notes, setNotes] = useState(""),
    [useSaved, setUseSaved] = useState(true),
    [taskProducer, setTaskProducer] = useState(""),
    [closing, setClosing] = useState(false);
  const q = useQuery({
    queryKey: ["weekly-report", day],
    queryFn: () => getWeeklyReport({ data: { date: day } }),
  });
  const close = useMutation({
    mutationFn: closeWeeklyMeeting,
    onSuccess: () => {
      toast.success("Junta cerrada. El resumen queda guardado.");
      setClosing(false);
      setUseSaved(true);
      void qc.invalidateQueries({ queryKey: ["weekly-report"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void q.refetch();
      setClosing(false);
    },
  });
  if (q.isPending) return <p>Cargando informe semanal…</p>;
  if (q.error)
    return (
      <p role="alert">
        {q.error.message}{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Reintentar
        </button>
      </p>
    );
  const live = q.data!,
    saved = useSaved && live.closed,
    report = saved ? live.closed!.snapshot : live,
    asOf = saved ? live.closed!.closedAt : live.asOf;
  const filteredEvents = report.events.filter((e) => !portfolio || e.portfolioId === portfolio),
    tasks = report.tasks.filter((t) => !portfolio || t.portfolioId === portfolio),
    producers = report.producers.filter((p) => !portfolio || p.portfolioId === portfolio);
  const openTasks = tasks.filter((t) => ["pendiente", "esperando"].includes(t.status));
  const blocked = producers.filter((p) => p.blocker || !p.hasNext || p.stage === "evaluacion");
  const selectedTasks = tasks.filter((t) =>
    category === "atendidas"
      ? t.status === "atendida"
      : category === "vencidas"
        ? ["pendiente", "esperando"].includes(t.status) && t.dueAt < asOf
        : category === "pendientes"
          ? ["pendiente", "esperando"].includes(t.status)
          : true,
  );
  const eventFilter = (e: WeekEvent) =>
    category === "atendidos"
      ? ["contacto", "visita"].includes(e.kind)
      : !category || e.kind === category;
  const displayed = filteredEvents.filter(eventFilter);
  const choose = (id: string, view: typeof section, metric = "") => {
    setPortfolio(id);
    setSection(view);
    setCategory(metric);
    setPage(0);
    setTaskProducer("");
  };
  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-xl bg-secondary p-4">
        <p className="font-medium">
          Del {report.range.key} al {report.range.lastDay} · horario de Sinaloa
        </p>
        <p className="text-sm">
          {saved ? "Resumen guardado al cerrar la junta" : "Informe en vivo"} · corte{" "}
          {formatAppDateTime(asOf)}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer">Cómo leer estas cifras</summary>
          <p className="mt-2">
            La actividad corresponde a la semana elegida. Los pendientes muestran la situación al
            corte; las carteras, su asignación al consultar o guardar el informe.
          </p>
          <p className="mt-2">
            Sin actividad registrada no significa que no se trabajó. Los cambios de etapa incluyen
            avances y regresos. Los movimientos de papelería no equivalen a expedientes completos.
            El historial anterior puede estar incompleto.
          </p>
        </details>
        {live.closed ? (
          <>
            <p className="text-sm">Junta cerrada por {live.closed.author}.</p>
            <Button
              variant="outline"
              onClick={() => {
                setUseSaved((v) => !v);
                setTaskProducer("");
              }}
            >
              {saved ? "Consultar situación actual" : "Ver resumen guardado"}
            </Button>
          </>
        ) : null}
        <Button className="ml-2" variant="outline" onClick={() => void q.refetch()}>
          Actualizar informe
        </Button>
      </div>
      {canOperate ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="p-3 text-left font-medium">
              Por cartera · toca una cifra para ver su respaldo
            </caption>
            <thead className="bg-secondary text-left">
              <tr>
                {[
                  "Cartera",
                  "Productores atendidos",
                  "Movimientos de la semana",
                  "Tareas atendidas",
                  "Vencidas al corte",
                ].map((t) => (
                  <th className="p-3" key={t}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.portfolios.map((p) => {
                const es = report.events.filter((e) => e.portfolioId === p.id),
                  ts = report.tasks.filter((t) => t.portfolioId === p.id);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3">
                      <button
                        className="text-left font-medium underline"
                        onClick={() => choose(p.id, "avances")}
                      >
                        {p.name}
                      </button>
                    </td>
                    <td className="p-3">
                      <button
                        className="rounded border border-border px-3 py-2"
                        aria-label={`Atendidos de ${p.name}`}
                        onClick={() => choose(p.id, "avances", "atendidos")}
                      >
                        {
                          new Set(
                            es
                              .filter((e) => ["contacto", "visita"].includes(e.kind))
                              .map((e) => e.producerId),
                          ).size
                        }
                      </button>
                    </td>
                    <td className="p-3">
                      <button
                        className="rounded border border-border px-3 py-2"
                        aria-label={`Movimientos de ${p.name}`}
                        onClick={() => choose(p.id, "avances")}
                      >
                        {es.length}
                      </button>
                    </td>
                    <td className="p-3">
                      <button
                        className="rounded border border-border px-3 py-2"
                        aria-label={`Tareas atendidas de ${p.name}`}
                        onClick={() => choose(p.id, "compromisos", "atendidas")}
                      >
                        {ts.filter((t) => t.status === "atendida").length}
                      </button>
                    </td>
                    <td className="p-3">
                      <button
                        className="rounded border border-border px-3 py-2"
                        aria-label={`Vencidas de ${p.name}`}
                        onClick={() => choose(p.id, "compromisos", "vencidas")}
                      >
                        {
                          ts.filter(
                            (t) => ["pendiente", "esperando"].includes(t.status) && t.dueAt < asOf,
                          ).length
                        }
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <label className="grid gap-1">
        Cartera a revisar
        <NativeSelect
          aria-label="Cartera a revisar"
          value={portfolio}
          onChange={(e) => choose(e.target.value, "avances")}
        >
          {canOperate ? <option value="">Todo el equipo y Empresa</option> : null}
          {report.portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["avances", "1. Lo trabajado"],
            ["compromisos", "2. Compromisos"],
            ["trabas", "3. Trabas y próximos pasos"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={section === key ? "default" : "outline"}
            onClick={() => choose(portfolio, key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {section === "avances" ? (
        <section className="space-y-3">
          <label className="grid gap-1">
            Tipo de registro
            <NativeSelect
              aria-label="Tipo de registro"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Todos los movimientos</option>
              <option value="atendidos">Productores atendidos · contactos y citas cumplidas</option>
              {Object.entries(kindLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <p className="text-sm text-muted">
            {displayed.length} registros · {new Set(displayed.map((e) => e.producerId)).size}{" "}
            productores. La persona indicada es quien registró la acción.
          </p>
          {!displayed.length ? (
            <p className="rounded-xl border border-border p-4">
              Sin actividad registrada para esta selección.
            </p>
          ) : (
            displayed.slice(page * 20, (page + 1) * 20).map((e) => (
              <article key={e.id} className="space-y-1 rounded-xl border border-border p-4">
                <Link
                  className="font-medium underline"
                  to="/productores/$id"
                  params={{ id: e.producerId }}
                >
                  {e.name}
                </Link>
                <p className="text-sm">
                  {kindLabels[e.kind]} · {e.portfolio}
                </p>
                <p className="whitespace-pre-wrap text-sm">{e.detail}</p>
                <p className="text-xs text-muted">
                  Registró: {e.actor} · {formatAppDateTime(e.at)}
                </p>
              </article>
            ))
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={(page + 1) * 20 >= displayed.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </section>
      ) : null}
      {section === "compromisos" ? (
        <section className="space-y-3">
          <label className="grid gap-1">
            Revisar compromisos
            <NativeSelect
              aria-label="Revisar compromisos"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Atendidos esta semana y pendientes al corte</option>
              <option value="atendidas">Atendidos esta semana</option>
              <option value="vencidas">Vencidos al corte</option>
              <option value="pendientes">Próximos compromisos</option>
            </NativeSelect>
          </label>
          <p className="text-sm text-muted">
            Los compromisos son las tareas del expediente. Una cita y su tarea vinculada no
            representan dos visitas.
          </p>
          {selectedTasks.slice(page * 20, (page + 1) * 20).map((t) => (
            <article key={t.id} className="space-y-1 rounded-xl border border-border p-4">
              <Link
                to="/productores/$id"
                params={{ id: t.producerId }}
                hash="seguimiento"
                className="font-medium underline"
              >
                {t.name}
              </Link>
              <p>{t.title}</p>
              <p className="text-sm">
                {t.assignee} · {formatAppDateTime(t.dueAt)} · {t.status}
                {["pendiente", "esperando"].includes(t.status) && t.dueAt < asOf
                  ? " · Vencido"
                  : ""}
              </p>
              {t.result ? <p className="text-sm">Resultado: {t.result}</p> : null}
            </article>
          ))}
          {!tasks.length ? <p>No hay compromisos registrados para esta selección.</p> : null}
        </section>
      ) : null}
      {section === "trabas" ? (
        <section className="space-y-3">
          <p className="text-sm">
            {blocked.length} productores por revisar ·{" "}
            {openTasks.filter((t) => t.status === "esperando").length} tareas esperando respuesta.
          </p>
          {blocked.slice(page * 20, (page + 1) * 20).map((p) => (
            <article key={p.id} className="space-y-2 rounded-xl border border-border p-4">
              <Link to="/productores/$id" params={{ id: p.id }} className="font-medium underline">
                {p.name}
              </Link>
              <p className="text-sm">
                {p.blocker ||
                  (!p.hasNext
                    ? "Sin siguiente paso registrado"
                    : "En evaluación · requiere decisión")}
              </p>
              <p className="text-xs text-muted">Atiende: {p.attention}</p>
              {!saved ? (
                <Button variant="outline" onClick={() => setTaskProducer(p.id)}>
                  Acordar siguiente paso
                </Button>
              ) : null}
            </article>
          ))}
          {!blocked.length ? (
            <p>No hay trabas ni productores sin siguiente paso en esta selección.</p>
          ) : null}
        </section>
      ) : null}
      {section !== "avances" ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm">Página {page + 1}</span>
          <Button
            variant="outline"
            disabled={
              (page + 1) * 20 >= (section === "compromisos" ? selectedTasks.length : blocked.length)
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
      {!saved ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="font-display text-xl">4. Acordar el siguiente paso</h2>
          <p className="text-sm text-muted">
            El acuerdo se guarda como tarea en la ficha y aparece en los pendientes del responsable.
            No necesitas capturarlo otra vez.
          </p>
          <label className="grid gap-1">
            Productor para el acuerdo
            <NativeSelect
              aria-label="Productor para el acuerdo"
              value={taskProducer}
              onChange={(e) => setTaskProducer(e.target.value)}
            >
              <option value="">Seleccionar productor</option>
              {producers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          {taskProducer ? (
            <ProducerTasks key={taskProducer} producerId={taskProducer} embedded />
          ) : null}
        </section>
      ) : null}
      {saved ? (
        <section className="space-y-2 rounded-xl border border-border p-4">
          <h2 className="font-display text-xl">Resumen de la junta</h2>
          <p className="whitespace-pre-wrap">{live.closed!.notes}</p>
        </section>
      ) : isGerente && !live.closed ? (
        <section className="space-y-3 rounded-xl border border-border p-4">
          <h2 className="font-display text-xl">Cerrar junta y conservar resumen</h2>
          <label className="grid gap-1">
            Acuerdos y apoyos de Gerencia
            <Textarea
              value={notes}
              maxLength={5000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qué se acordó y qué apoyo se dará. Guarda los compromisos con fecha en las tareas de arriba."
            />
          </label>
          <Button
            disabled={notes.trim().length < 5 || q.isFetching || close.isPending}
            onClick={() => setClosing(true)}
          >
            Revisar cierre de junta
          </Button>
          {closing ? (
            <div className="space-y-3 rounded-lg bg-secondary p-3">
              <p>
                Se guardará el resumen de todo el equipo, con las tareas y registros al corte. No se
                podrá sobrescribir. Los compromisos seguirán actualizándose en las fichas.
              </p>
              <Button
                disabled={close.isPending}
                onClick={() =>
                  close.mutate({ data: { date: day, notes, expectedVersion: live.version } })
                }
              >
                Confirmar cierre y guardar resumen
              </Button>
              <Button className="ml-2" variant="outline" onClick={() => setClosing(false)}>
                Seguir revisando
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
