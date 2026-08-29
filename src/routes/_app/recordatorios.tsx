import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, FolderOpen, MessageCircle, Timer } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageBack } from "@/components/page-back";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getOfficeDigest, listReminders, pingOffice } from "@/lib/crm";
import type { ReminderKind } from "@/lib/types";
import { whatsappHref } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/recordatorios")({ component: RecordatoriosPage });

const GROUPS: { kind: ReminderKind; title: string; hint: string; icon: typeof MessageCircle }[] = [
  {
    kind: "cita",
    title: "Confirmar visita",
    hint: "Citas de las próximas 48 horas.",
    icon: CalendarClock,
  },
  {
    kind: "papeleria",
    title: "Pedir papeles",
    hint: "Expedientes atorados en documentos.",
    icon: FolderOpen,
  },
  {
    kind: "estancado",
    title: "Dar seguimiento",
    hint: "Prospectos o visitas sin movimiento en 3 días.",
    icon: Timer,
  },
];

function RecordatoriosPage() {
  const { agent } = useViewAs();
  const q = useQuery({
    queryKey: ["reminders", agent],
    queryFn: () => listReminders({ data: { agent: agent || undefined } }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageBack to="/" label="Inicio" />
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">Recordatorios</h1>
        <p className="text-sm text-muted">
          Un toque abre WhatsApp con el mensaje listo. También puedes avisarle a oficina (papá,
          director) sin que ellos entren a la app.
        </p>
      </header>

      <OfficeAviso />

      {q.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : !q.data?.items.length ? (
        <EmptyState
          icon={<MessageCircle className="size-8" />}
          title="Nada que recordar ahora"
          body="Cuando haya citas cerca, papeles faltantes o productores estancados, aparecen aquí."
          action={
            <Button asChild>
              <Link to="/citas">Ver citas</Link>
            </Button>
          }
        />
      ) : (
        GROUPS.map((g) => {
          const items = q.data!.items.filter((i) => i.kind === g.kind);
          if (items.length === 0) return null;
          const Icon = g.icon;
          return (
            <section key={g.kind}>
              <div className="mb-2 flex items-center gap-2">
                <Icon className="size-4 text-clay" />
                <h2 className="font-display text-xl font-medium">{g.title}</h2>
              </div>
              <p className="mb-3 text-sm text-muted">{g.hint}</p>
              <ul className="grid gap-2">
                {items.map((row) => {
                  const wa = whatsappHref(row.phone, row.message);
                  return (
                    <li
                      key={row.id}
                      className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <Link
                            to="/productores/$id"
                            params={{ id: row.producerId }}
                            className="font-medium hover:underline"
                          >
                            {row.title}
                          </Link>
                          <p className="text-sm text-muted">{row.detail}</p>
                          {!agent ? (
                            <p className="text-xs text-subtle">{row.comisionistaName}</p>
                          ) : null}
                        </div>
                        <div className="flex gap-2">
                          {wa ? (
                            <Button asChild variant="secondary" size="sm">
                              <a href={wa} target="_blank" rel="noreferrer">
                                WhatsApp
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-subtle">Sin teléfono</span>
                          )}
                          <Button asChild variant="outline" size="sm">
                            <Link to="/productores/$id" params={{ id: row.producerId }}>
                              Ficha
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function OfficeAviso() {
  const qc = useQueryClient();
  const { agent } = useViewAs();
  const digest = useQuery({
    queryKey: ["office-digest", agent],
    queryFn: () => getOfficeDigest({ data: { agent: agent || undefined } }),
  });
  const ping = useMutation({
    mutationFn: (personId: string) => pingOffice({ data: { personId, kind: "aviso" } }),
    onSuccess: (res) => {
      toast.success(`Aviso listo para ${res.personName}.`);
      void qc.invalidateQueries({ queryKey: ["office-pings"] });
      window.open(res.href, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (digest.isPending) return <Skeleton className="h-28" />;
  const people = digest.data?.people ?? [];
  if (people.length === 0) return null;
  const lines = digest.data?.lines ?? [];

  return (
    <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <div className="mb-2 flex items-center gap-2">
        <Bell className="size-4 text-clay" />
        <h2 className="font-display text-xl font-medium">Avisar a oficina</h2>
      </div>
      <p className="mb-3 text-sm text-muted">
        Un mensaje con el avance. Ellos solo lo leen en WhatsApp; no tienen que entrar aquí.
      </p>
      {lines.length ? (
        <ul className="mb-4 grid gap-1 text-sm">
          {lines.slice(0, 6).map((line) => (
            <li key={line} className="text-muted">
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">Hoy no hay pendientes fuertes, igual puedes mandar el aviso.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {people.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="secondary"
            size="sm"
            disabled={ping.isPending}
            onClick={() => ping.mutate(p.id)}
          >
            <MessageCircle className="size-4" />
            Avisar a {p.name.split(" ")[0]}
          </Button>
        ))}
      </div>
    </section>
  );
}