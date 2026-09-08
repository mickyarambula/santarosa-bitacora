import { PeriodPicker } from "./period-picker";
import type { PeriodSelection } from "@/lib/period";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listWorkInbox } from "@/lib/operations";
import { useViewAs } from "@/lib/view-as";
import { formatAppDateTime } from "@/lib/datetime";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
const views = [
  ["hoy", "Para hoy"],
  ["vencido", "Vencido"],
  ["esperando", "Esperando respuesta"],
  ["pendientes", "Todas las tareas"],
  ["asignacion", "Pendiente de asignar"],
  ["sin_accion", "Sin siguiente paso"],
  ["papeleria", "Papelería por revisar"],
  ["gerencia", "Decisiones de Gerencia"],
] as const;
type View = (typeof views)[number][0];
export function NextActionsPanel({ agent }: { agent: string | null }) {
  const { canOperate, isGerente, isOffice } = useViewAs(),
    [view, setView] = useState<View>(isGerente ? "gerencia" : isOffice ? "papeleria" : "hoy"),
    [scope, setScope] = useState<"mine" | "team">(canOperate ? "team" : "mine"),
    [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(0);
  const [period, setPeriod] = useState<PeriodSelection>({ period: "todo" });
  const taskView = ["hoy", "vencido", "esperando", "pendientes"].includes(view);
  const r = useQuery({
    queryKey: ["work-inbox", view, scope, q, page, agent, period],
    queryFn: () =>
      listWorkInbox({ data: { ...period, view, scope, q, page, agent: agent ?? undefined } }),
    refetchInterval: 60000,
  });
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display text-xl">
        {isGerente
          ? "Pendientes y decisiones del equipo"
          : isOffice
            ? "Atención de Oficina"
            : "Mis pendientes"}
      </h2>
      <p className="text-sm text-muted">
        Qué falta, quién lo atiende y para cuándo. Horarios de Sinaloa.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          Ver pendientes
          <NativeSelect
            aria-label="Ver pendientes"
            value={view}
            onChange={(e) => {
              setView(e.target.value as View);
              setPage(0);
            }}
          >
            {views
              .filter((v) => canOperate || v[0] !== "gerencia")
              .map((v) => (
                <option key={v[0]} value={v[0]}>
                  {v[1]}
                </option>
              ))}
          </NativeSelect>
        </label>
        {canOperate ? (
          <label>
            Responsabilidad
            <NativeSelect
              aria-label="Responsabilidad"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as "mine" | "team");
                setPage(0);
              }}
            >
              <option value="mine">Mi atención</option>
              <option value="team">Todo el equipo</option>
            </NativeSelect>
          </label>
        ) : null}
      </div>
      {taskView ? (
        <PeriodPicker
          key={JSON.stringify(period)}
          value={period}
          allLabel="Todas las fechas"
          label="Fecha para atender"
          onChange={(value) => {
            setPeriod(value);
            setView("pendientes");
            setPage(0);
          }}
        />
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search);
          setPage(0);
        }}
      >
        <Input
          aria-label="Buscar pendientes"
          placeholder="Productor, cartera o tarea"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="outline">Buscar</Button>
      </form>
      {r.isPending ? (
        <p>Cargando pendientes…</p>
      ) : r.error ? (
        <p role="alert">{r.error.message}</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {r.data?.total ?? 0} resultados · página {page + 1}
          </p>
          {!r.data?.items.length ? (
            <p className="py-3 text-sm">
              No hay pendientes con este filtro. Revisa también «Sin siguiente paso».
            </p>
          ) : (
            <ul className="space-y-2">
              {r.data.items.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/productores/$id"
                    params={{ id: t.producerId }}
                    hash={
                      view === "papeleria"
                        ? "papeleria"
                        : view === "asignacion"
                          ? "asignacion"
                          : "seguimiento"
                    }
                    className="block rounded-lg border border-border p-3"
                  >
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm">{t.title}</p>
                    <p className="text-xs text-muted">
                      {t.assignee} · {t.portfolio}
                      {t.dueAt ? " · " + formatAppDateTime(t.dueAt) : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!page} onClick={() => setPage((n) => n - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={!r.data?.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
