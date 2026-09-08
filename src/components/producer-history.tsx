import { PeriodPicker } from "./period-picker";
import type { PeriodSelection } from "@/lib/period";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProducerHistory } from "@/lib/operations";
import { formatAppDateTime } from "@/lib/datetime";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
const labels: Record<string, string> = {
  alta: "Captura",
  asignacion: "Asignaciones",
  contacto: "Contactos",
  comunicacion: "Comunicaciones",
  tarea: "Tareas",
  documento: "Papelería",
  papel: "Papelería",
  responsable: "Responsables",
  fusion: "Fichas unificadas",
  etapa: "Etapas",
  dictamen: "Dictámenes",
  edicion: "Ediciones",
  archivo: "Archivo",
  cita: "Citas",
  cuenta: "Cuentas",
  grupo: "Grupos",
  proxima_accion: "Seguimiento anterior",
};
export function ProducerHistory({ producerId }: { producerId: string }) {
  const [period, setPeriod] = useState<PeriodSelection>({ period: "todo" });
  const [page, setPage] = useState(0),
    [kind, setKind] = useState(""),
    [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [opened, setOpened] = useState(false);
  const query = useQuery({
    queryKey: ["producer", producerId, "history", page, kind, q, period],
    queryFn: () => listProducerHistory({ data: { producerId, page, kind, q, ...period } }),
    enabled: opened,
  });
  return (
    <details
      id="bitacora"
      onToggle={(e) => setOpened(e.currentTarget.open)}
      className="scroll-mt-24 rounded-xl border border-border bg-surface p-4"
    >
      <summary className="min-h-11 cursor-pointer py-2 font-display text-lg">
        Bitácora · historia del expediente
      </summary>
      <p className="text-sm text-muted">
        Del registro más reciente al más antiguo, conservando quién hizo cada movimiento.
      </p>
      <PeriodPicker
        key={JSON.stringify(period)}
        value={period}
        allLabel="Toda la historia del expediente"
        label="Periodo de los movimientos"
        onChange={(value) => {
          setPeriod(value);
          setPage(0);
        }}
      />
      <form
        className="my-3 grid gap-2 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setQ(search);
        }}
      >
        <label>
          Tipo de movimiento
          <NativeSelect
            aria-label="Tipo de movimiento"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos</option>
            {query.data?.kinds.map((k) => (
              <option key={k} value={k}>
                {labels[k] ?? k}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          Buscar en la historia
          <Input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={150} />
        </label>
        <Button className="self-end" variant="outline">
          Buscar
        </Button>
      </form>
      {query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : query.isPending ? (
        <p>Cargando historia…</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{query.data.total} movimientos</p>
          <ol className="grid gap-2">
            {query.data.items.map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{a.message}</p>
                <p className="mt-1 text-xs text-muted">
                  {a.actor} · {formatAppDateTime(a.createdAt)} · {labels[a.kind] ?? a.kind}
                </p>
              </li>
            ))}
          </ol>
          {!query.data.items.length ? <p>No hay movimientos con ese filtro.</p> : null}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" disabled={!page} onClick={() => setPage((n) => n - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={!query.data.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              Siguiente página
            </Button>
          </div>
        </>
      )}
    </details>
  );
}
