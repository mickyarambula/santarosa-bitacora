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
import { PeriodPicker } from "@/components/period-picker";
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
  const tab = search.tab ?? "actividad";
  const day =
    tab === "juntas" || !search.period
      ? (search.date ?? appDateKey(new Date()))
      : appDateKey(new Date());
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
        <h1 className="font-display text-3xl">
          {canOperate ? "Seguimiento del equipo" : "Mi seguimiento"}
        </h1>
        <p className="text-muted">
          {canOperate
            ? "Elige a quién revisar, consulta su actividad y da seguimiento a sus pendientes."
            : "Consulta lo trabajado y organiza tus siguientes pasos."}
        </p>
      </header>
      <nav aria-label="Secciones de seguimiento" className="flex flex-wrap gap-2">
        {(
          [
            ["actividad", "Actividad"],
            ["pendientes", "Pendientes actuales"],
            ["juntas", "Juntas"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "outline"}
            onClick={() =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  tab: id,
                  view: "live",
                  section:
                    id === "actividad"
                      ? "avances"
                      : id === "pendientes"
                        ? "compromisos"
                        : "acuerdos",
                  category: id === "pendientes" ? "pendientes" : "",
                  page: 0,
                }),
                resetScroll: false,
              })
            }
          >
            {label}
          </Button>
        ))}
      </nav>
      {tab === "juntas" ? (
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
      ) : null}
      <WeeklyReview key={tab + day} day={day} />
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
    tab = search.tab ?? "actividad",
    scope = tab === "actividad" ? (search.scope ?? "cartera") : "cartera",
    section =
      search.section ??
      (tab === "pendientes" ? "compromisos" : tab === "juntas" ? "acuerdos" : "avances"),
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
    queryKey: ["weekly-report", day, tab, search.period, search.from, search.until],
    queryFn: () =>
      getWeeklyReport({
        data: {
          date: day,
          ...(tab === "actividad"
            ? { period: search.period, from: search.from, until: search.until }
            : {}),
        },
      }),
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
  if (q.isPending) return <p>Cargando seguimiento…</p>;
  if (q.error)
    return (
      <p role="alert">
        {q.error.message}{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Reintentar
        </button>
        <Button
          variant="outline"
          onClick={() => updateSearch({ period: "semana", from: undefined, until: undefined })}
        >
          Volver a esta semana
        </Button>
      </p>
    );
  const live = q.data!,
    saved = tab === "juntas" && search.view !== "live" && live.closed,
    report = saved ? live.closed!.snapshot : live,
    asOf = saved ? live.closed!.closedAt : live.asOf;
  const filteredEvents = report.events.filter(
      (e) => !portfolio || (scope === "persona" ? e.actorId : e.portfolioId) === portfolio,
    ),
    tasks = report.tasks.filter(
      (t) =>
        !portfolio ||
        (scope === "persona"
          ? t.status === "atendida"
            ? t.completedBy
            : t.assigneeId
          : t.portfolioId) === portfolio,
    ),
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
          : tab === "pendientes"
            ? ["pendiente", "esperando"].includes(t.status)
            : true,
  );
  const eventFilter = (e: WeekEvent) =>
    category === "atendidos"
      ? ["contacto", "visita"].includes(e.kind)
      : !category || e.kind === category;
  const displayed = filteredEvents.filter(eventFilter);
  const choose = (id: string, view: typeof section, metric = "") => {
    const nextTab = saved
      ? "juntas"
      : view === "avances" || metric === "atendidas"
        ? "actividad"
        : view === "acuerdos"
          ? "juntas"
          : "pendientes";
    updateSearch({
      portfolio: id,
      section: view,
      tab: nextTab,
      category: metric || (view === "compromisos" ? "pendientes" : ""),
      page: 0,
    });
    setTaskProducer("");
  };
  const people = scope === "persona" ? live.actors : report.portfolios;
  const summaries = portfolioSummaries(people, report.events, report.tasks, asOf, scope);
  // Old immutable snapshots have no roles; keep every recorded portfolio available.
  const effectiveSearch = report.portfolios.some((p) => p.role)
    ? search
    : { ...search, group: search.group ?? ("todos" as const) };
  const visible = filterPortfolios(summaries, effectiveSearch);
  const selected = summaries.find((p) => p.id === portfolio);
  const next = visible[visible.findIndex((p) => p.id === portfolio) + 1];
  const detail = !canOperate || !!portfolio;
  const backSearch = {
    ...search,
    date: day,
    ...(tab !== "actividad" ? { period: undefined, from: undefined, until: undefined } : {}),
  };
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
      <div className="grid items-end gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        {canOperate ? (
          <label className="grid gap-1 text-sm">
            Persona o cartera
            <NativeSelect
              aria-label="Persona o cartera"
              value={portfolio}
              onChange={(e) => updateSearch({ portfolio: e.target.value, page: 0 })}
            >
              <option value="">Ver equipo</option>
              {summaries.map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        {tab === "actividad" ? (
          <>
            <PeriodPicker
              key={[search.period, search.from, search.until].join(":")}
              value={
                !search.period && weekRange(day).key !== weekRange().key
                  ? {
                      period: "personalizado",
                      from: weekRange(day).key,
                      until: weekRange(day).lastDay,
                    }
                  : search
              }
              onChange={(value) =>
                updateSearch({ ...value, date: appDateKey(new Date()), page: 0, view: "live" })
              }
            />
            <label className="grid gap-1 text-sm">
              Qué actividad consultar
              <NativeSelect
                aria-label="Qué actividad consultar"
                value={scope}
                onChange={(e) =>
                  updateSearch({
                    scope: e.target.value as ReviewSearch["scope"],
                    group: "todos",
                    portfolio: ["empresa", "pendiente"].includes(portfolio) ? "" : portfolio,
                    page: 0,
                  })
                }
              >
                <option value="cartera">Actividad de la cartera</option>
                <option value="persona">Trabajo registrado por la persona</option>
              </NativeSelect>
            </label>
          </>
        ) : null}
      </div>
      <div className="space-y-2 rounded-xl bg-secondary p-4">
        <p className="font-medium">
          {tab === "pendientes" ? (
            "Pendientes actuales · no dependen del periodo de actividad"
          ) : search.period === "todo" && tab === "actividad" ? (
            "Todo el historial disponible del ciclo 26–27"
          ) : (
            <>
              Del{" "}
              {formatAppDateTime(report.range.start, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              al{" "}
              {formatAppDateTime(report.range.lastDay + "T12:00:00-07:00", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </>
          )}{" "}
          · Sinaloa
        </p>
        <p className="text-sm">
          {saved ? "Resumen guardado al cerrar la junta" : "Consulta actualizada"} ·{" "}
          {formatAppDateTime(asOf)}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer">Cómo leer estas cifras</summary>
          <p className="mt-2">
            La actividad corresponde al periodo elegido. Los pendientes muestran la situación al
            corte; las carteras, su asignación al consultar o guardar el informe.
          </p>
          <p className="mt-2">
            Sin actividad registrada no significa que no se trabajó. Los cambios de etapa incluyen
            avances y regresos. Los movimientos de papelería no equivalen a expedientes completos.
            El historial anterior puede estar incompleto.
          </p>
        </details>
        {tab === "juntas" && live.closed ? (
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
      {tab === "actividad" && scope === "persona" ? (
        <p className="text-sm text-muted">
          Se cuenta al autor del registro, aunque atendiera una cartera ajena. Las tareas sin autor
          de cierre verificable no se atribuyen a otra persona.
        </p>
      ) : null}
      {canOperate && !detail ? (
        <section
          ref={summaryRef}
          tabIndex={-1}
          className="scroll-mt-24 space-y-4 outline-none"
          aria-label="Resumen del equipo"
        >
          <details className="rounded-xl border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Filtrar la lista del equipo
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                Ver integrantes de
                <NativeSelect
                  aria-label="Ver integrantes de"
                  value={effectiveSearch.group ?? "comisionistas"}
                  onChange={(e) =>
                    updateSearch({ group: e.target.value as ReviewSearch["group"], page: 0 })
                  }
                >
                  <option value="comisionistas">Comisionistas</option>
                  {scope === "cartera" ? (
                    <>
                      <option value="empresa">Clientes de la empresa</option>
                      <option value="pendiente">Pendientes de asignar</option>
                    </>
                  ) : null}
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
          </details>
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
                    {tab === "pendientes"
                      ? `${p.pending} tareas pendientes actuales`
                      : `${p.producers.size} productores con actividad · ${p.completed} tareas atendidas`}
                  </p>
                  <p className={`text-sm ${p.overdue ? "font-medium text-clay" : "text-muted"}`}>
                    {p.overdue ? `${p.overdue} pendientes vencidos` : "Sin pendientes vencidos"}
                  </p>
                  {tab === "actividad" && !p.movements && !p.completed ? (
                    <p className="text-xs text-muted">Sin actividad registrada en este periodo</p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  aria-label={`Revisar seguimiento de ${label(p)}`}
                  onClick={() => updateSearch({ portfolio: p.id, page: 0 })}
                >
                  Revisar →
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
                <Button variant="outline" onClick={() => updateSearch({ portfolio: "", page: 0 })}>
                  ← Volver al equipo
                </Button>
                {next && next.id !== portfolio ? (
                  <Button
                    variant="outline"
                    onClick={() => updateSearch({ portfolio: next.id, page: 0 })}
                  >
                    Siguiente cartera →
                  </Button>
                ) : null}
              </div>
            ) : null}
            <h2 className="break-words font-display text-2xl">
              {selected ? label(selected) : "Cartera no disponible en este informe"}
            </h2>
            <p className="text-sm text-muted">
              {scope === "persona"
                ? "Registros hechos por esta persona. Se indica a qué cartera pertenece cada productor."
                : "Actividad de sus productores, incluida la atención registrada por Oficina o Gerencia."}
            </p>
            {tab === "actividad" ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  [
                    "avances",
                    "alta",
                    "Productores nuevos",
                    filteredEvents.filter((e) => e.kind === "alta").length,
                  ],
                  [
                    "avances",
                    "contacto",
                    "Contactos",
                    filteredEvents.filter((e) => e.kind === "contacto").length,
                  ],
                  [
                    "avances",
                    "documento",
                    "Papelería",
                    filteredEvents.filter((e) => e.kind === "documento").length,
                  ],
                  ["compromisos", "atendidas", "Tareas atendidas", selected?.completed ?? 0],
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
            ) : null}
          </section>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["avances", "Qué hizo"],
                ["compromisos", "Qué tiene pendiente"],
                ["trabas", "Qué necesita apoyo"],
                ["acuerdos", "Qué acordamos"],
              ] as const
            )
              .filter(([key]) =>
                tab === "pendientes" ? ["compromisos", "trabas"].includes(key) : false,
              )
              .map(([key, label]) => (
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
                  {tab === "actividad" ? (
                    <option value="atendidas">Atendidos en el periodo</option>
                  ) : null}
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
                    Responsable: {t.assignee} · {formatAppDateTime(t.dueAt)} · {t.status}
                    {["pendiente", "esperando"].includes(t.status) && t.dueAt < asOf
                      ? " · Vencido"
                      : ""}
                  </p>
                  {t.status === "atendida" ? (
                    <p className="text-sm">
                      Cerró: {t.completedByName ?? "Autor no disponible en el historial"}
                    </p>
                  ) : null}
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
      ) : tab === "juntas" && isGerente && !live.closed && !detail ? (
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
