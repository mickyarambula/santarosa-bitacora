import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, MapPin, Trash2 } from "lucide-react";
import { ContactLog } from "@/components/contact-log";
import { DocsChecklist } from "@/components/docs-checklist";
import { OfficeInvite } from "@/components/office-invite";
import { PageBack } from "@/components/page-back";
import { ProducerForm } from "@/components/producer-form";
import { RejectionPanel } from "@/components/rejection-panel";
import { StageChip } from "@/components/stage-chip";
import { VisitForm } from "@/components/visit-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  STAGES,
  VISIT_STATUS,
  cropLabel,
  docsForScheme,
  groupRoleLabel,
  relationLabel,
  schemeLabel,
  stageMeta,
  unitLabel,
} from "@/lib/catalog";
import {
  createVisit,
  deleteProducer,
  getProducer,
  setDocumentStatus,
  setRejection,
  setStage,
  setVisitStatus,
  updateProducer,
} from "@/lib/crm";
import type { DocStatus, StageId } from "@/lib/catalog";
import { compactMoney, formatPhone, money, qty, whatsappHref } from "@/lib/utils";
import { formatAppDateTime } from "@/lib/datetime";

export const Route = createFileRoute("/_app/productores/$id")({
  component: ProducerDetailPage,
});

function ProducerDetailPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["producer", id],
    queryFn: () => getProducer({ data: { id } }),
  });

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["producer", id] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
      qc.invalidateQueries({ queryKey: ["producers"] }),
      qc.invalidateQueries({ queryKey: ["visits"] }),
      qc.invalidateQueries({ queryKey: ["paper"] }),
    ]);

  const stageMut = useMutation({
    mutationFn: (stage: StageId) => setStage({ data: { id, stage } }),
    onSuccess: () => {
      toast.success("Etapa actualizada.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const docMut = useMutation({
    mutationFn: (vars: { id: string; status: DocStatus }) => setDocumentStatus({ data: vars }),
    onMutate: (vars) => setPendingDoc(vars.id),
    onSettled: () => setPendingDoc(null),
    onSuccess: () => void invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const visitMut = useMutation({
    mutationFn: createVisit,
    onSuccess: () => {
      toast.success("Cita agendada.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visitStatusMut = useMutation({
    mutationFn: setVisitStatus,
    onSuccess: () => void invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: updateProducer,
    onSuccess: () => {
      toast.success("Cambios guardados.");
      setEditing(false);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: setRejection,
    onSuccess: () => {
      toast.success("Dictamen guardado en el expediente.");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => deleteProducer({ data: { id } }),
    onSuccess: async () => {
      toast.success("Productor eliminado.");
      await qc.invalidateQueries();
      void nav({ to: "/productores" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return <p className="text-muted">{(q.error as Error)?.message ?? "No encontrado."}</p>;
  }

  const { producer: p, documents, progress, visits, activity, touches, group, roster } = q.data;
  const missing = documents.filter((d) => d.required && d.status === "pendiente");
  const waDocs = whatsappHref(
    p.phone,
    `Hola ${p.name}, soy ${p.comisionistaName} de Almacenes Santa Rosa. Para seguir con el ciclo 26-27 nos faltan estos documentos:\n\n${missing
      .map((d) => `• ${d.label}`)
      .join("\n")}\n\n¿Cuándo se los podemos recoger?`,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <PageBack to="/productores" label="Productores" />
      <p className="sr-only">
        <Link to="/productores">Productores</Link>
        <span className="mx-1.5">/</span>
        {p.name}
      </p>

      <header className="grid gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-medium tracking-tight">{p.name}</h1>
            <StageChip stage={p.stage} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5" />
            {p.zone}
            {p.locality ? ` · ${p.locality}` : ""}
            {" · "}
            {relationLabel(p.relation)}
            {" · "}
            {p.comisionistaName}
            {p.groupName ? ` · ${p.groupName}` : ""}
          </p>
          {p.phone ? <p className="mt-1 text-sm tabular text-muted">{formatPhone(p.phone)}</p> : null}
          {p.email ? <p className="mt-1 text-sm text-muted">{p.email}</p> : null}
        </div>
        <OfficeInvite
          producerId={p.id}
          producerName={p.name}
          visitId={visits.find((v) => v.status === "programada")?.id}
        />
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Cultivo" value={cropLabel(p.crop)} />
        <Stat
          label="Hectáreas"
          value={
            p.rejectionKind === "parcial"
              ? `${qty(p.hectares, 1)} de ${qty(p.hectaresRequested, 1)} ha`
              : `${qty(p.hectares, 1)} ha`
          }
        />
        <Stat label="Volumen" value={`${qty(p.volumeTon, 1)} t`} />
        <Stat
          label="Préstamo"
          value={
            p.financingMxn
              ? `${compactMoney(p.financingMxn)}${p.financingPerHa ? ` · ${compactMoney(p.financingPerHa)}/ha` : ""}`
              : "—"
          }
        />
      </div>

      <RejectionPanel
        producer={p}
        pending={rejectMut.isPending}
        onSave={(data) => rejectMut.mutate({ data: { id: p.id, ...data } })}
      />

      {group ? (
        <Card>
          <CardHeader>
            <CardTitle>{group.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted">
              Productor real: {group.titularName ?? "sin marcar"}. {group.members} nombres ·{" "}
              {qty(group.hectares, 0)} ha · {compactMoney(group.financing)}. Cada uno tiene su
              papelería.
            </p>
            <ul className="grid gap-2">
              {(roster?.length ? roster : group.producers.map((m) => ({ producer: m, progress: { total: 0, required: 0, done: 0, requiredDone: 0 } }))).map(
                (row) => {
                  const m = row.producer;
                  const left = row.progress.required - row.progress.requiredDone;
                  return (
                    <li key={m.id}>
                      <Link
                        to="/productores/$id"
                        params={{ id: m.id }}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                      >
                        <span>
                          <span className="font-medium">{m.name}</span>
                          <span className="text-muted">
                            {" "}
                            · {groupRoleLabel(m.groupRole)}
                            {m.id === p.id ? " · este" : ""}
                          </span>
                        </span>
                        <span className="text-xs text-muted">
                          {qty(m.hectares, 0)} ha
                          {left > 0 ? ` · faltan ${left} papeles` : " · papeles listos"}
                        </span>
                      </Link>
                    </li>
                  );
                },
              )}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Contacto</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactLog
            producerId={p.id}
            producerName={p.name}
            phone={p.phone}
            email={p.email}
            agentName={p.comisionistaName}
            touches={touches ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:flex sm:items-end sm:justify-between">
          <label className="grid flex-1 gap-1.5">
            <span className="text-sm font-medium">Mover de etapa</span>
            <NativeSelect
              value={p.stage}
              onChange={(e) => stageMut.mutate(e.target.value as StageId)}
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            <span className="text-xs text-muted">{stageMeta(p.stage).hint}</span>
          </label>
          <p className="text-sm text-muted">
            {unitLabel(p.businessUnit)} · {schemeLabel(p.scheme)}
          </p>
        </CardContent>
      </Card>

      {p.blocker ? (
        <div className="rounded-xl border border-clay/30 bg-clay/8 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-clay">Qué falta</p>
          <p className="mt-1 font-medium">{p.blocker}</p>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-5">
          <DocsChecklist
            documents={documents}
            pendingId={pendingDoc}
            onChange={(docId, status) => docMut.mutate({ id: docId, status })}
          />
          {missing.length && waDocs ? (
            <Button asChild variant="secondary" className="mt-4 w-full">
              <a href={waDocs} target="_blank" rel="noreferrer">
                Pedir los {missing.length} faltantes por WhatsApp
              </a>
            </Button>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {progress.requiredDone}/{progress.required} obligatorios en regla.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Citas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <VisitForm
            pending={visitMut.isPending}
            onSubmit={(data) =>
              visitMut.mutate({
                data: {
                  producerId: p.id,
                  scheduledAt: data.scheduledAt,
                  place: data.place,
                  purpose: data.purpose,
                  notes: data.notes,
                },
              })
            }
          />
          {visits.length ? (
            <ul className="grid gap-2">
              {visits.map((v) => (
                <li key={v.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {formatAppDateTime(v.scheduledAt, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-sm text-muted">
                        {v.purpose}
                        {v.place ? ` · ${v.place}` : ""}
                      </p>
                    </div>
                    <NativeSelect
                      className="h-10 w-40"
                      value={v.status}
                      onChange={(e) =>
                        visitStatusMut.mutate({
                          data: { id: v.id, status: e.target.value as (typeof VISIT_STATUS)[number]["id"] },
                        })
                      }
                    >
                      {VISIT_STATUS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between p-5 text-left"
          onClick={() => setEditing((v) => !v)}
        >
          <span className="font-display text-lg font-medium">Editar ficha</span>
          <ChevronDown className={`size-5 transition-transform ${editing ? "rotate-180" : ""}`} />
        </button>
        {editing ? (
          <CardContent className="pt-0">
            <ProducerForm
              initial={p}
              submitLabel="Guardar cambios"
              pending={saveMut.isPending}
              onSubmit={(data) => saveMut.mutate({ data: { ...data, id: p.id } })}
            />
          </CardContent>
        ) : null}
      </Card>

      {activity.length ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-medium">Bitácora</h2>
          <ol className="grid gap-2">
            {activity.map((a) => (
              <li key={a.id} className="rounded-lg bg-surface px-4 py-3 text-sm shadow-[var(--shadow-border)]">
                <p>{a.message}</p>
                <p className="mt-1 text-xs text-subtle">
                  {new Date(a.createdAt).toLocaleString("es-MX")}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            if (confirm(`¿Eliminar a ${p.name}? Esta acción no se puede deshacer.`)) delMut.mutate();
          }}
        >
          <Trash2 className="size-4" />
          Eliminar
        </Button>
      </div>
      <p className="sr-only">{money(p.financingMxn)} {docsForScheme(p.scheme).length}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 font-display text-xl font-medium tabular">{value}</p>
    </div>
  );
}
