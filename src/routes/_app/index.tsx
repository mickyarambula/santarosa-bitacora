import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, Copy, FolderOpen, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { KpiStrip } from "@/components/kpi-strip";
import { OfficeInvite } from "@/components/office-invite";
import { PhoneActions } from "@/components/phone-actions";
import { ProducerCard } from "@/components/producer-card";
import { ShareGuide } from "@/components/share-guide";
import { StageChip } from "@/components/stage-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, clearExamples, listDuplicateGroups, listAnnouncements } from "@/lib/crm";
import { CYCLE } from "@/lib/catalog";
import { teamAnnouncementShare, visitConfirmMessage } from "@/lib/reminders";
import { qty, whatsappShareHref } from "@/lib/utils";
import { formatAppTime } from "@/lib/datetime";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/")({ component: Hoy });

function Hoy() {
  const qc = useQueryClient();
  const { agent, agentLabel, setAgent, names, isGerente } = useViewAs();
  const dash = useQuery({
    queryKey: ["dashboard", agent],
    queryFn: () => getDashboard({ data: { agent: agent || undefined } }),
  });
  const dups = useQuery({
    queryKey: ["duplicates"],
    queryFn: () => listDuplicateGroups(),
    enabled: isGerente,
  });
  const news = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncements(),
  });
  const clear = useMutation({
    mutationFn: () => clearExamples(),
    onSuccess: (r) => {
      toast.success(
        r.removed ? `Quitamos ${r.removed} de ejemplo. Ya puedes capturar los reales.` : "No había ejemplos.",
      );
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (dash.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (dash.error) {
    return <p className="text-muted">{(dash.error as Error).message}</p>;
  }

  const d = dash.data;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const empty = d.kpis.producers === 0;
  const title = agentLabel ?? d.profile.displayName;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{hello}</p>
          <h1 className="font-display text-3xl font-medium tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            {agentLabel
              ? `Así ve ${agentLabel} el ciclo ${CYCLE}`
              : d.profile.role === "gerente"
                ? `Tablero del ciclo ${CYCLE} · ves a todo el equipo`
                : `Tu captura del ciclo ${CYCLE}`}
          </p>
        </div>
        <Button asChild>
          <Link to="/productores/nuevo">
            <Plus className="size-4" />
            Capturar productor
          </Link>
        </Button>
      </header>

      {(news.data?.items ?? [])
        .filter((a) => a.kind === "equipo")
        .slice(0, 3)
        .map((a) => (
          <article key={a.id} className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Aviso de gerencia</p>
            <p className="mt-1 font-medium">{a.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
            <p className="mt-2 text-xs text-subtle">{a.authorName}</p>
            <a
              className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={whatsappShareHref(
                teamAnnouncementShare({ title: a.title, body: a.body, author: a.authorName }),
              )}
              target="_blank"
              rel="noreferrer"
            >
              Pasar al grupo de WhatsApp
            </a>
          </article>
        ))}

      {isGerente && (dups.data?.groups.length ?? 0) > 0 ? (
        <Link
          to="/duplicados"
          className="flex items-start gap-3 rounded-xl border border-clay/30 bg-clay/8 px-4 py-4 hover:bg-clay/12"
        >
          <Copy className="mt-0.5 size-5 shrink-0 text-clay" />
          <div>
            <p className="font-medium">
              {dups.data!.groups.length === 1
                ? "Hay 1 productor repetido"
                : `Hay ${dups.data!.groups.length} productores repetidos`}
            </p>
            <p className="text-sm text-muted">
              Revísalos en lote y quédate con una ficha. Las demás se juntan ahí.
            </p>
          </div>
        </Link>
      ) : null}

      {d.exampleCount > 0 ? (
        <div className="grid gap-3 rounded-xl border border-border bg-secondary px-4 py-4">
          <p className="text-sm">
            Estás viendo <span className="font-medium">{d.exampleCount} de ejemplo</span>. No son
            productores reales. Quítalos para empezar el ciclo en limpio.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={clear.isPending}
            onClick={() => {
              if (window.confirm("¿Quitar los de ejemplo? Los productores reales se quedan.")) {
                clear.mutate();
              }
            }}
          >
            {clear.isPending ? "Quitando…" : "Quitar los de ejemplo"}
          </Button>
        </div>
      ) : null}

      {d.profile.role === "gerente" && !agent ? (
        <Card>
          <CardContent className="grid gap-3 pt-5 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Pasar al grupo de comisionistas</p>
              <p className="text-sm text-muted">
                Un recado listo, con el link y los 5 pasos. También está en Más → Cómo se usa.
              </p>
            </div>
            <ShareGuide compact />
          </CardContent>
        </Card>
      ) : null}

      {isGerente && !agent && names.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Probar la vista de un comisionista</p>
              <p className="text-sm text-muted">
                Hoy, embudo, citas y papelería se filtran a lo suyo. Tú sigues siendo gerencia.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {names.slice(0, 3).map((n) => (
                <Button key={n} variant="outline" size="sm" onClick={() => setAgent(n)}>
                  {n.split(" ")[0]}
                </Button>
              ))}
              <Button asChild variant="ghost" size="sm">
                <Link to="/equipo">Ver desglose</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {empty ? (
        <EmptyState
          icon={<img src="/brand/isotipo.png" alt="" className="h-14 w-auto" />}
          title="Aún no hay productores"
          body="Empieza capturando al primero — nombre, teléfono y hectáreas bastan."
          action={
            <Button asChild>
              <Link to="/productores/nuevo">Capturar el primero</Link>
            </Button>
          }
        />
      ) : (
        <>
          <KpiStrip
            producers={d.kpis.producers}
            hectares={d.kpis.hectares}
            volume={d.kpis.volume}
            financing={d.kpis.financing}
          />

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Hoy en el campo</CardTitle>
                <Link to="/citas" className="text-sm text-primary hover:underline">
                  Ver citas
                </Link>
              </CardHeader>
              <CardContent className="grid gap-3">
                {d.todayVisits.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">
                    No hay visitas programadas para hoy.
                  </p>
                ) : (
                  d.todayVisits.map((v) => (
                    <div
                      key={v.id}
                      className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/productores/$id"
                          params={{ id: v.producerId }}
                          className="font-medium hover:underline"
                        >
                          {v.producerName}
                        </Link>
                        <p className="text-sm text-muted">
                          {formatAppTime(v.scheduledAt)}
                          {v.purpose ? ` · ${v.purpose}` : ""}
                          {v.place ? ` · ${v.place}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PhoneActions
                          phone={v.phone}
                          message={visitConfirmMessage({
                            producerName: v.producerName,
                            when: new Date(v.scheduledAt),
                            purpose: v.purpose,
                            place: v.place,
                          })}
                        />
                        <OfficeInvite compact producerId={v.producerId} visitId={v.id} producerName={v.producerName} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Qué urge</CardTitle>
                <Link to="/recordatorios" className="text-sm text-primary hover:underline">
                  WhatsApp
                </Link>
              </CardHeader>
              <CardContent className="grid gap-2">
                {d.attention.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">Nada atorado por ahora.</p>
                ) : (
                  d.attention.slice(0, 6).map((a) => (
                    <Link
                      key={a.id}
                      to="/productores/$id"
                      params={{ id: a.producerId }}
                      className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-secondary"
                    >
                      <span className="mt-0.5 text-clay">
                        {a.kind === "papeleria" ? (
                          <FolderOpen className="size-4" />
                        ) : a.kind === "cita_hoy" ? (
                          <CalendarClock className="size-4" />
                        ) : a.kind === "sin_contacto" ? (
                          <Phone className="size-4" />
                        ) : (
                          <AlertCircle className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{a.title}</span>
                        <span className="block text-sm text-muted">{a.detail}</span>
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-medium">Por etapa</h2>
              <Link to="/embudo" className="text-sm text-primary hover:underline">
                Ver embudo
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {d.stages
                .filter((s) => s.count > 0)
                .map((s) => (
                  <Link
                    key={s.stage}
                    to="/productores"
                    search={{ etapa: s.stage }}
                    className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
                  >
                    <StageChip stage={s.stage} />
                    <p className="mt-3 font-display text-2xl tabular">{s.count}</p>
                    <p className="text-xs text-muted">{qty(s.hectares, 0)} ha</p>
                  </Link>
                ))}
            </div>
          </section>

          {d.profile.role === "gerente" && !agent && d.agents.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl font-medium">Por comisionista</h2>
                <Link to="/equipo" className="text-sm text-primary hover:underline">
                  Ver desglose
                </Link>
              </div>
              <div className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-subtle">
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 font-medium">Nombre</th>
                      <th className="px-4 py-3 font-medium">Prod.</th>
                      <th className="px-4 py-3 font-medium">Ha</th>
                      <th className="px-4 py-3 font-medium">Ton</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.agents.map((a) => (
                      <tr key={a.name} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="font-medium hover:underline"
                            onClick={() => setAgent(a.name)}
                          >
                            {a.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 tabular">{a.count}</td>
                        <td className="px-4 py-3 tabular">{qty(a.hectares, 0)}</td>
                        <td className="px-4 py-3 tabular">{qty(a.volume, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">Toca un nombre para ver el ciclo como lo ve él.</p>
            </section>
          ) : null}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-medium">Recién movidos</h2>
              <Link to="/productores" className="text-sm text-primary hover:underline">
                Todos
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {d.recent.map((p) => (
                <ProducerCard key={p.id} producer={p} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
