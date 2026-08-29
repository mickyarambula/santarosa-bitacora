import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { OfficeInvite } from "@/components/office-invite";
import { PhoneActions } from "@/components/phone-actions";
import { ScheduleVisitButton } from "@/components/schedule-visit";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { VISIT_STATUS } from "@/lib/catalog";
import { listVisits, setVisitStatus } from "@/lib/crm";
import { formatAppDay, formatAppTime } from "@/lib/datetime";
import { visitConfirmMessage } from "@/lib/reminders";
import type { Visit } from "@/lib/types";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/citas")({ component: CitasPage });

function CitasPage() {
  const qc = useQueryClient();
  const { agent, agentLabel } = useViewAs();
  const [range, setRange] = useState<"hoy" | "semana" | "todas">("semana");
  const q = useQuery({
    queryKey: ["visits", range, agent],
    queryFn: () => listVisits({ data: { range, agent: agent || undefined } }),
  });
  const mut = useMutation({
    mutationFn: setVisitStatus,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["visits"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visits = q.data?.visits ?? [];
  const groups = groupByDay(visits);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Citas</h1>
          <p className="text-sm text-muted">
            {agentLabel
              ? `Agenda de ${agentLabel}.`
              : "Visitas para convencer, recoger papeles o cuadrar el grano."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScheduleVisitButton />
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(
            [
              ["hoy", "Hoy"],
              ["semana", "Semana"],
              ["todas", "Todas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={
                range === id
                  ? "h-10 rounded-md bg-surface px-3 text-sm font-medium shadow-sm"
                  : "h-10 rounded-md px-3 text-sm text-muted"
              }
            >
              {label}
            </button>
          ))}
          </div>
        </div>
      </header>

      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : visits.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title="Sin citas en este periodo"
          body="Pica Hacer cita, elige al productor y cuándo lo van a ver."
          action={<ScheduleVisitButton />}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">{day}</h2>
              <ul className="grid gap-2">
                {items.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                          {v.zone ? ` · ${v.zone}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <NativeSelect
                          className="h-10 w-36"
                          value={v.status}
                          onChange={(e) =>
                            mut.mutate({
                              data: {
                                id: v.id,
                                status: e.target.value as (typeof VISIT_STATUS)[number]["id"],
                              },
                            })
                          }
                        >
                          {VISIT_STATUS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </NativeSelect>
                        <PhoneActions
                          compact
                          phone={v.phone}
                          message={visitConfirmMessage({
                            producerName: v.producerName,
                            when: new Date(v.scheduledAt),
                            purpose: v.purpose,
                            place: v.place,
                          })}
                        />
                        {v.status === "programada" ? (
                          <OfficeInvite compact producerId={v.producerId} visitId={v.id} producerName={v.producerName} />
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDay(visits: Visit[]): [string, Visit[]][] {
  const map = new Map<string, Visit[]>();
  for (const v of visits) {
    const key = formatAppDay(v.scheduledAt);
    const arr = map.get(key) ?? [];
    arr.push(v);
    map.set(key, arr);
  }
  return [...map.entries()];
}
