import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { KpiStrip } from "@/components/kpi-strip";
import { ProducerCard } from "@/components/producer-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { CROPS, RELATIONS, STAGES, ZONES } from "@/lib/catalog";
import { listProducers, listTeam } from "@/lib/crm";
import { MINE_SCOPE, useViewAs } from "@/lib/view-as";

type Search = { etapa?: string };

export const Route = createFileRoute("/_app/productores/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    etapa: typeof s.etapa === "string" ? s.etapa : undefined,
  }),
  component: ProductoresPage,
});

function ProductoresPage() {
  const { etapa } = Route.useSearch();
  const { agent, setAgent, names, isGerente, displayName, agentLabel } = useViewAs();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState(etapa ?? "");
  const [crop, setCrop] = useState("");
  const [zone, setZone] = useState("");
  const [relation, setRelation] = useState("");
  const [debounced, setDebounced] = useState("");

  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => listTeam(),
    enabled: isGerente,
  });

  const comisionistas = useMemo(() => {
    const set = new Set<string>(names);
    for (const a of team.data?.agents ?? []) set.add(a.displayName);
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [names, team.data]);

  const list = useQuery({
    queryKey: ["producers", { q: debounced, stage, crop, zone, relation, agent }],
    queryFn: () =>
      listProducers({
        data: {
          q: debounced || undefined,
          stage: stage || undefined,
          crop: crop || undefined,
          zone: zone || undefined,
          relation: relation || undefined,
          agent: agent || undefined,
        },
      }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Productores</h1>
          <p className="text-sm text-muted">
            {agentLabel
              ? `Cartera de ${agentLabel}: números de lo que estás viendo.`
              : isGerente
                ? "Todo el equipo. Filtra por comisionista para ver sus números."
                : "Una ficha por productor, como el formato de captura."}
          </p>
        </div>
        <Button asChild>
          <Link to="/productores/nuevo">
            <Plus className="size-4" />
            Nuevo
          </Link>
        </Button>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            className="pl-10"
            placeholder="Buscar por nombre, zona o teléfono"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              window.clearTimeout((window as unknown as { _t?: number })._t);
              (window as unknown as { _t?: number })._t = window.setTimeout(
                () => setDebounced(e.target.value.trim()),
                250,
              );
            }}
          />
        </label>
        {isGerente ? (
          <NativeSelect
            aria-label="Filtrar por comisionista"
            value={agent ?? ""}
            onChange={(e) => setAgent(e.target.value || null)}
          >
            <option value="">Todos los comisionistas</option>
            <option value={MINE_SCOPE}>Mi cartera</option>
            {comisionistas
              .filter((n) => n !== displayName)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </NativeSelect>
        ) : null}
        <NativeSelect value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Todas las etapas</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={crop} onChange={(e) => setCrop(e.target.value)}>
          <option value="">Todos los cultivos</option>
          {CROPS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={relation} onChange={(e) => setRelation(e.target.value)}>
          <option value="">Nuevo, recurrente o recuperación</option>
          {RELATIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="">Todos los municipios</option>
          {ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </NativeSelect>
      </div>

      {list.data?.producers.length ? (
        <KpiStrip
          producers={list.data.producers.filter((p) => p.rejectionKind !== "total").length}
          hectares={list.data.producers.filter((p) => p.rejectionKind !== "total").reduce((s, p) => s + p.hectares, 0)}
          volume={list.data.producers.filter((p) => p.rejectionKind !== "total").reduce((s, p) => s + p.volumeTon, 0)}
          financing={list.data.producers.filter((p) => p.rejectionKind !== "total").reduce((s, p) => s + p.financingMxn, 0)}
        />
      ) : null}

      {list.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : list.data?.producers.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.producers.map((p) => (
            <ProducerCard key={p.id} producer={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nada con ese filtro"
          body="Prueba otro comisionista o etapa, o captura un productor nuevo."
          action={
            <Button asChild>
              <Link to="/productores/nuevo">Capturar</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
