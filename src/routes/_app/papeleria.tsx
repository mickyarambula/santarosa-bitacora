import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MassWhatsApp } from "@/components/mass-whatsapp";
import { PageBack } from "@/components/page-back";
import { StageChip } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { allDocTypes } from "@/lib/catalog";
import { listPaperwork } from "@/lib/crm";
import { missingDocMessage, paperworkMessage } from "@/lib/reminders";
import { whatsappHref } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/papeleria")({ component: PapeleriaPage });

function PapeleriaPage() {
  const { agent, agentLabel, isGerente } = useViewAs();
  const [docType, setDocType] = useState("");
  const [mass, setMass] = useState(false);
  const q = useQuery({
    queryKey: ["paper", agent, docType],
    queryFn: () => listPaperwork({ data: { agent: agent || undefined, docType: docType || undefined } }),
  });
  const docs = allDocTypes();
  const items = q.data?.items ?? [];
  const counts = q.data?.counts ?? [];
  const selectedLabel = docs.find((d) => d.id === docType)?.label;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageBack to="/" label="Inicio" />
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">Papelería</h1>
        <p className="text-sm text-muted">
          {agentLabel
            ? `Documentos pendientes de la cartera de ${agentLabel}.`
            : "Filtra por el papel que se está pidiendo y ves a quién le falta, uno por uno."}
        </p>
      </header>

      <NativeSelect aria-label="Documento" value={docType} onChange={(e) => { setDocType(e.target.value); setMass(false); }}>
        <option value="">Todos los pendientes</option>
        {counts.map((c) => (
          <option key={c.docType} value={c.docType}>
            {c.label} · {c.n}
          </option>
        ))}
        {docs
          .filter((d) => !counts.some((c) => c.docType === d.id))
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} · 0
            </option>
          ))}
      </NativeSelect>

      {isGerente && items.length ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={mass ? "default" : "outline"} onClick={() => setMass((v) => !v)}>
            {mass ? "Ocultar envío" : `Mandar WhatsApp a estos (${items.filter((i) => i.phone).length})`}
          </Button>
        </div>
      ) : null}

      {mass && isGerente ? (
        <MassWhatsApp
          targets={items}
          summary={selectedLabel ? `Se pidió ${selectedLabel}` : "Se pidió papelería pendiente"}
          messageFor={(t) =>
            selectedLabel
              ? missingDocMessage({
                  producerName: t.name,
                  agentName: t.comisionistaName ?? "Santa Rosa",
                  docLabel: selectedLabel,
                })
              : paperworkMessage({
                  producerName: t.name,
                  agentName: t.comisionistaName ?? "Santa Rosa",
                  missing: items.find((i) => i.id === t.id)?.missing.map((d) => d.label) ?? ["papelería"],
                })
          }
        />
      ) : null}

      {q.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : !items.length ? (
        <EmptyState
          icon={<FolderOpen className="size-8" />}
          title={docType ? "Nadie con ese documento pendiente" : "Nadie con papeles pendientes"}
          body="Cuando un productor pase a Convencido o Papelería, aquí aparecen los documentos que faltan."
          action={
            <Button asChild>
              <Link to="/productores">Ver productores</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((row) => {
            const missing = docType ? row.missing.filter((d) => d.docType === docType) : row.missing;
            const wa = whatsappHref(
              row.phone,
              selectedLabel
                ? missingDocMessage({
                    producerName: row.name,
                    agentName: row.comisionistaName,
                    docLabel: selectedLabel,
                  })
                : paperworkMessage({
                    producerName: row.name,
                    agentName: row.comisionistaName,
                    missing: missing.map((d) => d.label),
                  }),
            );
            return (
              <li key={row.id} className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to="/productores/$id"
                      params={{ id: row.id }}
                      className="font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <StageChip stage={row.stage} short />
                      <span className="text-xs text-muted">{row.comisionistaName}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-clay/12 px-2.5 py-1 text-xs font-medium text-clay">
                    Faltan {missing.length}
                  </span>
                </div>
                <ul className="mt-3 grid gap-1 text-sm text-muted">
                  {missing.slice(0, 6).map((d) => (
                    <li key={d.docType}>· {d.label}</li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  {wa ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={wa} target="_blank" rel="noreferrer">
                        Pedir por WhatsApp
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link to="/productores/$id" params={{ id: row.id }}>
                      Abrir ficha
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
