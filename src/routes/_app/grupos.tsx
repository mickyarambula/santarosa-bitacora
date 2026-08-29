import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageBack } from "@/components/page-back";
import { StageChip } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { formGroupFromIds, listGroups } from "@/lib/crm";
import { groupRoleLabel } from "@/lib/catalog";
import { compactMoney, formatPhone, qty } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/grupos")({ component: GruposPage });

function GruposPage() {
  const { agent, agentLabel } = useViewAs();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["groups", agent],
    queryFn: () => listGroups({ data: { agent: agent || undefined } }),
  });
  const formGroup = useMutation({
    mutationFn: formGroupFromIds,
    onSuccess: () => {
      toast.success("Grupo armado. Cada nombre sigue con su papelería.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = q.data?.groups ?? [];
  const shared = q.data?.shared ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageBack to="/" label="Inicio" />
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">Grupos</h1>
        <p className="text-sm text-muted">
          {agentLabel ? `Grupos de ${agentLabel}.` : "Varios nombres de un mismo productor real."} Cada
          ficha lleva su INE, análisis de suelo y crédito. Aquí los ves juntos.
        </p>
      </header>

      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          {shared.length ? (
            <section className="grid gap-3">
              <h2 className="font-display text-xl font-medium">Mismo WhatsApp, sin grupo</h2>
              <p className="text-sm text-muted">
                Suelen ser familiares o amigos que prestan el nombre. Ármalos en grupo; no los
                juntes en una sola ficha.
              </p>
              {shared.map((s) => (
                <SharedPhoneCard
                  key={s.producers.map((p) => p.id).join("-")}
                  producers={s.producers}
                  pending={formGroup.isPending}
                  onForm={(name, titularId) =>
                    formGroup.mutate({
                      data: {
                        producerIds: s.producers.map((p) => p.id),
                        name,
                        titularId,
                      },
                    })
                  }
                />
              ))}
            </section>
          ) : null}

          {!groups.length && !shared.length ? (
            <EmptyState
              icon={<UsersRound className="size-8" />}
              title="Aún no hay grupos"
              body="Al capturar, marca «Sí, es un grupo» si el productor siembra con nombres de familiares o amigos."
              action={
                <Button asChild>
                  <Link to="/productores/nuevo">Capturar</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-4">
              {groups.map((g) => (
                <li key={g.id} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{g.name}</p>
                      <p className="text-sm text-muted">
                        Real: {g.titularName ?? "sin marcar"} · {g.comisionistaName}
                      </p>
                    </div>
                    <p className="text-sm tabular text-muted">
                      {g.members} nombres · {qty(g.hectares, 0)} ha · {compactMoney(g.financing)}
                    </p>
                  </div>
                  <ul className="mt-3 grid gap-2">
                    {g.producers.map((p) => (
                      <li key={p.id}>
                        <Link
                          to="/productores/$id"
                          params={{ id: p.id }}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                        >
                          <span>
                            <span className="font-medium">{p.name}</span>
                            <span className="text-muted"> · {groupRoleLabel(p.groupRole)}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <StageChip stage={p.stage} short />
                            <span className="text-xs text-muted">{qty(p.hectares, 0)} ha</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SharedPhoneCard({
  producers,
  onForm,
  pending,
}: {
  producers: { id: string; name: string; comisionistaName: string; hectares: number; phone: string | null }[];
  onForm: (name: string, titularId: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(() => {
    const last = producers[0]?.name.trim().split(/\s+/).pop();
    return last ? `Grupo ${last}` : "Grupo";
  });
  const [titularId, setTitularId] = useState(producers[0]?.id ?? "");
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-muted">
        WhatsApp {formatPhone(producers[0]?.phone)} · {producers.length} nombres
      </p>
      <ul className="mt-2 text-sm">
        {producers.map((p) => (
          <li key={p.id}>
            {p.name} · {p.comisionistaName} · {qty(p.hectares, 0)} ha
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del grupo" />
        <NativeSelect value={titularId} onChange={(e) => setTitularId(e.target.value)}>
          {producers.map((p) => (
            <option key={p.id} value={p.id}>
              Real: {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        type="button"
        className="mt-3"
        disabled={pending || !name.trim()}
        onClick={() => onForm(name.trim(), titularId)}
      >
        Armar grupo
      </Button>
    </div>
  );
}
