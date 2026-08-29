import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageBack } from "@/components/page-back";
import { StageChip } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listDuplicateGroups, resolveDuplicate } from "@/lib/crm";
import { cropLabel } from "@/lib/catalog";
import type { Producer } from "@/lib/types";
import { compactMoney, formatPhone, qty } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/duplicados")({ component: DuplicadosPage });

function reasonLabel(reason: string) {
  if (reason === "telefono") return "Mismo teléfono";
  if (reason === "ambos") return "Mismo nombre y teléfono";
  return "Mismo nombre";
}

function DuplicadosPage() {
  const { isGerente } = useViewAs();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["duplicates"],
    queryFn: () => listDuplicateGroups(),
    enabled: isGerente,
  });
  const resolve = useMutation({
    mutationFn: resolveDuplicate,
    onSuccess: () => {
      toast.success("Listo. Quedó una sola ficha y se juntó lo demás.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isGerente) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageBack to="/" label="Inicio" />
        <EmptyState
          title="Solo gerencia"
          body="Los duplicados los revisa gerencia para no borrar la ficha de otro por error."
        />
      </div>
    );
  }

  const groups = q.data?.groups ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageBack to="/" label="Inicio" />
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">Duplicados</h1>
        <p className="text-sm text-muted">
          Revisa en lote los que se parecen. Quédate con una ficha: las otras se juntan ahí (citas,
          papelería y notas) y se borran. Si son dos personas distintas, cambia el nombre en la
          ficha — por ejemplo Juan Pérez Bamoa.
        </p>
      </header>

      {q.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !groups.length ? (
        <EmptyState
          icon={<Copy className="size-8" />}
          title="No hay duplicados"
          body="Nadie repitió productor por nombre o teléfono en este ciclo."
        />
      ) : (
        <ul className="grid gap-4">
          {groups.map((g) => (
            <li key={g.producers.map((p) => p.id).join("-")} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
              <p className="text-xs font-medium uppercase tracking-wider text-clay">
                {reasonLabel(g.reason)} · {g.producers.length} fichas
              </p>
              <ul className="mt-3 grid gap-3">
                {g.producers.map((p) => (
                  <ConflictCard
                    key={p.id}
                    producer={p}
                    busy={resolve.isPending}
                    onKeep={() => {
                      const dropIds = g.producers.filter((x) => x.id !== p.id).map((x) => x.id);
                      const ok = window.confirm(
                        `¿Quedarte con ${p.name} de ${p.comisionistaName}? Las otras ${dropIds.length} se juntan aquí y se borran.`,
                      );
                      if (!ok) return;
                      resolve.mutate({ data: { keepId: p.id, dropIds } });
                    }}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConflictCard({
  producer: p,
  onKeep,
  busy,
}: {
  producer: Producer;
  onKeep: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            to="/productores/$id"
            params={{ id: p.id }}
            className="font-medium hover:underline"
          >
            {p.name}
          </Link>
          <p className="mt-1 text-sm text-muted">
            {p.comisionistaName} · {p.zone}
            {p.locality ? ` / ${p.locality}` : ""}
          </p>
        </div>
        <StageChip stage={p.stage} short />
      </div>
      <p className="mt-2 text-sm text-muted">
        {cropLabel(p.crop)} · {qty(p.hectares, 0)} ha
        {p.financingMxn ? ` · ${compactMoney(p.financingMxn)}` : ""}
        {p.phone ? ` · ${formatPhone(p.phone)}` : " · sin teléfono"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onKeep}>
          Esta es la buena
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <Link to="/productores/$id" params={{ id: p.id }}>
            Abrir ficha
          </Link>
        </Button>
      </div>
    </div>
  );
}
