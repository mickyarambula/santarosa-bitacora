import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StageChip } from "@/components/stage-chip";
import { KpiStrip } from "@/components/kpi-strip";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGES, cropLabel, type StageId } from "@/lib/catalog";
import { listProducers, setStage } from "@/lib/crm";
import { compactMoney, qty } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/embudo")({ component: EmbudoPage });

function EmbudoPage() {
  const qc = useQueryClient();
  const { agent, agentLabel } = useViewAs();
  const list = useQuery({
    queryKey: ["producers", { all: true, agent }],
    queryFn: () => listProducers({ data: { agent: agent || undefined } }),
  });
  const move = useMutation({
    mutationFn: (vars: { id: string; stage: StageId }) => setStage({ data: vars }),
    onSuccess: () => {
      toast.success("Se movió de etapa.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (list.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const producers = list.data?.producers ?? [];
  const live = producers.filter((p) => p.rejectionKind !== "total");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">Embudo</h1>
        <p className="text-sm text-muted">
          {agentLabel
            ? `Etapas de la cartera de ${agentLabel}. Abajo, sus números vivos (sin rechazos totales).`
            : "Arrastra con la vista: cada columna es una etapa. En el teléfono, usa el selector de cada ficha."}
        </p>
      </header>

      <KpiStrip
        producers={live.length}
        hectares={live.reduce((s, p) => s + p.hectares, 0)}
        volume={live.reduce((s, p) => s + p.volumeTon, 0)}
        financing={live.reduce((s, p) => s + p.financingMxn, 0)}
      />

      <div className="flex gap-3 overflow-x-auto pb-4 md:pb-2">
        {STAGES.map((st) => {
          const items = producers.filter((p) => p.stage === st.id);
          const ha = items.reduce((s, p) => s + p.hectares, 0);
          return (
            <section
              key={st.id}
              className="flex w-72 shrink-0 flex-col rounded-xl bg-secondary/60 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <StageChip stage={st.id} />
                <span className="text-xs tabular text-muted">
                  {items.length} · {qty(ha, 0)} ha
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <p className="px-1 py-8 text-center text-xs text-subtle">Nadie aquí</p>
                ) : (
                  items.map((p) => (
                    <article key={p.id} className="rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
                      <Link
                        to="/productores/$id"
                        params={{ id: p.id }}
                        className="block font-medium leading-snug hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {cropLabel(p.crop)} · {qty(p.hectares, 1)} ha · {qty(p.volumeTon, 0)} t
                        {!agent ? ` · ${p.comisionistaName}` : ""}
                      </p>
                      {p.financingMxn ? (
                        <p className="text-xs tabular text-primary">{compactMoney(p.financingMxn)}</p>
                      ) : null}
                      {p.blocker ? <p className="mt-1 text-xs text-clay">{p.blocker}</p> : null}
                      <NativeSelect
                        className="mt-2 h-10 text-sm"
                        value={p.stage}
                        onChange={(e) => move.mutate({ id: p.id, stage: e.target.value as StageId })}
                      >
                        {STAGES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.short}
                          </option>
                        ))}
                      </NativeSelect>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
