import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listNextActions } from "@/lib/crm";
import { formatAppDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
export function NextActionsPanel({ agent }: { agent: string | null }) {
  const [view, setView] = useState<"pendientes" | "sin_accion">("pendientes"),
    [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ["next-actions", agent, view],
    queryFn: () => listNextActions({ data: { agent: agent ?? undefined, view } }),
    refetchInterval: 60000,
  });
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display text-xl font-medium">Qué sigue con los productores</h2>
      <p className="mt-1 text-sm text-muted">
        Acciones acordadas y fechas de seguimiento. Las citas se consultan en la agenda.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={view === "pendientes" ? "default" : "outline"}
          onClick={() => {
            setView("pendientes");
            setAll(false);
          }}
        >
          Pendientes{q.data ? ` (${q.data.stats.pending})` : ""}
        </Button>
        <Button
          variant={view === "sin_accion" ? "default" : "outline"}
          onClick={() => {
            setView("sin_accion");
            setAll(false);
          }}
        >
          Sin próxima acción{q.data ? ` (${q.data.stats.missing})` : ""}
        </Button>
      </div>
      {q.isPending ? (
        <p className="mt-3">Cargando acciones…</p>
      ) : q.error ? (
        <p className="mt-3" role="alert">
          No se pudo cargar el seguimiento.{" "}
          <Button variant="ghost" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        </p>
      ) : q.data ? (
        <>
          {view === "pendientes" && q.data.stats.overdue > 0 ? (
            <p className="mt-3 text-sm font-medium text-clay">
              {q.data.stats.overdue} con fecha vencida; confirma qué pasó.
            </p>
          ) : null}
          {!q.data.items.length ? (
            <p className="mt-3 text-sm text-muted">
              {view === "pendientes"
                ? "No hay acciones programadas en esta cartera. Revisa las fichas sin próxima acción."
                : "Las fichas abiertas de esta cartera ya tienen próxima acción."}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {q.data.items.slice(0, all ? 100 : 6).map((a) => (
                <li key={a.id}>
                  <Link
                    to="/productores/$id"
                    params={{ id: a.id }}
                    hash="seguimiento"
                    className="block rounded-lg border border-border p-3 hover:bg-secondary"
                  >
                    <p className="font-medium">{a.name}</p>
                    <p className="mt-1 break-words text-sm">{a.text ?? "Definir qué sigue"}</p>
                    <p className="mt-1 text-xs text-muted">
                      {a.ownerName}
                      {a.dueAt ? ` · ${formatAppDateTime(a.dueAt)} · Sinaloa` : ""}
                      {a.overdue ? " · Vencida" : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {q.data.items.length > 6 ? (
            <Button className="mt-3" variant="ghost" onClick={() => setAll((v) => !v)}>
              {all ? "Mostrar menos" : "Ver más acciones"}
            </Button>
          ) : null}
          {(view === "pendientes" ? q.data.stats.pending : q.data.stats.missing) > 100 ? (
            <p className="mt-2 text-xs text-muted">
              Se muestran las primeras 100 fichas; filtra una cartera para acotar la lista.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
