import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getWeeklyReport, closeWeeklyMeeting, type WeekEvent } from "@/lib/weekly";
import {
  reviewSearch,
  portfolioSummaries,
  filterPortfolios,
  type ReviewSearch,
} from "@/lib/weekly-review";
import { weekRange } from "@/lib/weekly-dates";
import { appDateKey, formatAppDateTime } from "@/lib/datetime";
import { useViewAs } from "@/lib/view-as";
import { ProducerTasks } from "@/components/producer-tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
export const Route = createFileRoute("/_app/junta")({
  validateSearch: reviewSearch,
  component: WeeklyPage,
});
function WeeklyPage() {
  const { canOperate } = useViewAs();
  const search = Route.useSearch(),
    navigate = Route.useNavigate();
  const day = search.date ?? appDateKey(new Date());
  const setDay = (date: string) =>
    void navigate({ search: (previous) => ({ ...previous, date, page: 0 }), resetScroll: false });
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
        <Button variant="outline" aria-label="Semana anterior" onClick={() => move(-7)}>
          ←
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
        <Button variant="outline" aria-label="Semana siguiente" onClick={() => move(7)}>
          →
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
  const search = Route.useSearch(),
    navigate = Route.useNavigate();
  const portfolio = canOperate ? (search.portfolio ?? "") : userId,
    section = search.section ?? "avances",
    category = search.category ?? "",
    page = search.page ?? 0;
  const updateSearch = (patch: Partial<ReviewSearch>, replace = false) =>
    void navigate({
      search: (previous) => ({ ...previous, date: day, ...patch }),
      replace,
      resetScroll: false,
    });
  const setPage = (value: number | ((n: number) => number)) =>
    updateSearch({ page: typeof value === "function" ? value(page) : value });
  const detailRef = useRef<HTMLElement>(null),
    summaryRef = useRef<HTMLElement>(null),
    previousPortfolio = useRef(portfolio);
  const [notes, setNotes] = useState(""),
    [taskProducer, setTaskProducer] = useState(""),
    [closing, setClosing] = useState(false);
  const q = useQuery({
    queryKey: ["weekly-report", day],
    queryFn: () => getWeeklyReport({ data: { date: day } }),
  });
  useEffect(() => {
    if (!q.isPending && (portfolio || previousPortfolio.current)) {
      const target = portfolio ? detailRef.current : summaryRef.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "start" });
    }
    previousPortfolio.current = portfolio;
  }, [portfolio, q.isPending]);
  const close = useMutation({
    mutationFn: closeWeeklyMeeting,
    onSuccess: () => {
      toast.success("Junta cerrada. El resumen queda guardado.");
      setClosing(false);
      updateSearch({ view: "saved" });
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
    saved = search.view !== "live" && live.closed,
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
    updateSearch({ portfolio: id, section: view, category: metric, page: 0 });
    setTaskProducer("");
  };
  const summaries = portfolioSummaries(report.portfolios, report.events, report.tasks, asOf);
  // Old immutable snapshots have no roles; keep every recorded portfolio available.
  const effectiveSearch = report.portfolios.some((p) => p.role)
    ? search
    : { ...search, group: search.group ?? ("todos" as const) };
  const visible = filterPortfolios(summaries, effectiveSearch);
  const selected = summaries.find((p) => p.id === portfolio);
  const next = visible[visible.findIndex((p) => p.id === portfolio) + 1];
  const detail = !canOperate || !!portfolio;
  const backSearch = { ...search, date: day };
  const label = (p: { id: string; name: string; identity?: string }) => {
    const duplicate = summaries.some(
      (other) =>
        other.id !== p.id &&
        other.name.trim().toLocaleLowerCase() === p.name.trim().toLocaleLowerCase(),
    );
    return p.identity || duplicate
      ? `${p.name} · ${p.identity || `Cuenta ${p.id.slice(-8)}`}`
      : p.name;
  };
  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-xl bg-secondary p-4">
        <p className="font-medium">
          Semana del {formatAppDateTime(report.range.start, { day: "numeric", month: "long" })} al{" "}
          {formatAppDateTime(report.range.lastDay + "T12:00:00-07:00", {
            day: "numeric",
            month: "long",
          })}{" "}
          · Sinaloa
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
                updateSearch({ view: saved ? "live" : "saved" });
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
      {canOperate && !detail ? (
        <section
          ref={summaryRef}
          tabIndex={-1}
          className="scroll-mt-24 space-y-4 outline-none"
          aria-label="Resumen del equipo"
        >
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              Ver carteras de
              <NativeSelect
                aria-label="Ver carteras de"
                value={effectiveSearch.group ?? "comisionistas"}
                onChange={(e) =>
                  updateSearch({ group: e.target.value as ReviewSearch["group"], page: 0 })
                }
              >
                <option value="comisionistas">Comisionistas</option>
                <option value="empresa">Clientes de la empresa</option>
                <option value="pendiente">Pendientes de asignar</option>
                <option value="todos">Todo el equipo</option>
              </NativeSelect>
            </label>
            <label className="order-3 col-span-2 grid gap-1 text-sm sm:order-2 sm:col-span-1">
              Buscar nombre o correo
              <Input
                value={search.q ?? ""}
                onChange={(e) => updateSearch({ q: e.target.value, page: 0 }, true)}
                placeholder="Nombre del comisionista"
              />
            </label>
            <label className="order-2 grid gap-1 text-sm sm:order-3">
              Mostrar
              <NativeSelect
                aria-label="Mostrar"
                value={search.filter ?? "todos"}
                onChange={(e) =>
                  updateSearch({ filter: e.target.value as ReviewSearch["filter"], page: 0 })
                }
              >
                <option value="todos">Todos</option>
                <option value="actividad">Con actividad</option>
                <option value="sin-actividad">Sin actividad registrada</option>
                <option value="vencidos">Con pendientes vencidos</option>
              </NativeSelect>
            </label>
          </div>
          <p className="text-sm text-muted" role="status">
            {visible.length} {visible.length === 1 ? "cartera" : "carteras"} · Elige a quién
            revisar.
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {visible.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-medium">{label(p)}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {p.producers.size} {p.producers.size === 1 ? "productor" : "productores"} con
                    actividad · {p.completed} tareas atendidas
                  </p>
                  <p className={`text-sm ${p.overdue ? "font-medium text-clay" : "text-muted"}`}>
                    {p.overdue ? `${p.overdue} pendientes vencidos` : "Sin pendientes vencidos"}
                  </p>
                  {!p.movements && !p.completed ? (
                    <p className="text-xs text-muted">Sin actividad registrada esta semana</p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  aria-label={`Revisar semana de ${label(p)}`}
                  onClick={() => choose(p.id, "avances")}
                >
                  Revisar semana →
                </Button>
              </li>
            ))}
          </ul>
          {!visible.length ? (
            <p>No hay carteras que coincidan. Cambia los filtros para ver otras.</p>
          ) : null}
        </section>
      ) : null}
      {detail ? (
        <>
          <section
            ref={detailRef}
            tabIndex={-1}
            className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-surface p-4 outline-none"
            aria-label="Revisión individual"
          >
            {canOperate ? (
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={() => choose("", "avances")}>
                  ← Volver al equipo
                </Button>
                {next && next.id !== portfolio ? (
                  <Button variant="outline" onClick={() => choose(next.id, "avances")}>
                    Siguiente cartera →
                  </Button>
                ) : null}
              </div>
            ) : null}
            <h2 className="break-words font-display text-2xl">
              {selected ? label(selected) : "Cartera no disponible en este informe"}
            </h2>
            <p className="text-sm text-muted">
              Los productores pertenecen a esta cartera. Cada movimiento indica quién lo registró.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["avances", "", "Productores con actividad", selected?.producers.size ?? 0],
                ["avances", "", "Movimientos", selected?.movements ?? 0],
                ["compromisos", "atendidas", "Tareas atendidas", selected?.completed ?? 0],
                ["compromisos", "vencidas", "Pendientes vencidos", selected?.overdue ?? 0],
              ].map(([view, metric, text, count]) => (
                <button
                  key={text}
                  className="rounded-lg border border-border p-3 text-left hover:bg-secondary focus-visible:ring-2"
                  onClick={() => choose(portfolio, view as typeof section, String(metric))}
                >
                  <span className="block text-xl font-medium">{count}</span>
                  <span className="text-sm">{text} →</span>
                </button>
              ))}
            </div>
          </section>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["avances", "Qué hizo"],
                ["compromisos", "Qué tiene pendiente"],
                ["trabas", "Qué necesita apoyo"],
                ["acuerdos", "Qué acordamos"],
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
                    updateSearch({ category: e.target.value, page: 0 });
                  }}
                >
                  <option value="">Todos los movimientos</option>
                  <option value="atendidos">
                    Productores atendidos · contactos y citas cumplidas
                  </option>
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
                      search={{ ...backSearch, movement: e.id }}
                    >
                      {e.name} · Ver movimiento →
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
                    updateSearch({ category: e.target.value, page: 0 });
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
                    search={backSearch}
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
              {!selectedTasks.length ? (
                <p>No hay compromisos registrados para esta selección.</p>
              ) : null}
            </section>
          ) : null}
          {section === "trabas" ? (
            <section className="space-y-3">
              <p className="text-sm">
                {blocked.length} productores por revisar ·{" "}
                {openTasks.filter((t) => t.status === "esperando").length} tareas esperando
                respuesta.
              </p>
              {blocked.slice(page * 20, (page + 1) * 20).map((p) => (
                <article key={p.id} className="space-y-2 rounded-xl border border-border p-4">
                  <Link
                    to="/productores/$id"
                    params={{ id: p.id }}
                    search={backSearch}
                    className="font-medium underline"
                  >
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        choose(portfolio, "acuerdos");
                        setTaskProducer(p.id);
                      }}
                    >
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
          {["compromisos", "trabas"].includes(section) ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm">Página {page + 1}</span>
              <Button
                variant="outline"
                disabled={
                  (page + 1) * 20 >=
                  (section === "compromisos" ? selectedTasks.length : blocked.length)
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          ) : null}
          {saved && section === "acuerdos" ? (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <p>
                Esta junta ya está cerrada. Sus tareas quedaron guardadas en el resumen; los
                acuerdos generales aparecen al final.
              </p>
              <Button variant="outline" onClick={() => choose(portfolio, "compromisos")}>
                Ver tareas del resumen →
              </Button>
            </div>
          ) : null}
          {!saved && section === "acuerdos" ? (
            <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
              <h2 className="font-display text-xl">Acordar el siguiente paso</h2>
              <p className="text-sm text-muted">
                El acuerdo se guarda como tarea en la ficha y aparece en los pendientes del
                responsable. No necesitas capturarlo otra vez.
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
        </>
      ) : null}
      {saved ? (
        <section className="space-y-2 rounded-xl border border-border p-4">
          <h2 className="font-display text-xl">Resumen de la junta</h2>
          <p className="whitespace-pre-wrap">{live.closed!.notes}</p>
        </section>
      ) : isGerente && !live.closed && !detail ? (
        <details className="space-y-3 rounded-xl border border-border p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-display text-xl">
            Cerrar junta y conservar resumen
          </summary>
          <label className="grid gap-1">
            Acuerdos y apoyos de Gerencia
            <Textarea
              value={notes}
              maxLength={5000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qué se acordó y qué apoyo se dará. Guarda los compromisos con fecha desde la revisión de cada cartera."
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
        </details>
      ) : null}
    </div>
  );
}
