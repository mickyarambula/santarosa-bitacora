import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getWeeklyEvent } from "@/lib/weekly";
import type { ReviewSearch } from "@/lib/weekly-review";
import { formatAppDateTime } from "@/lib/datetime";
import { Button } from "./ui/button";

export function WeeklyEventContext({
  producerId,
  search,
}: {
  producerId: string;
  search: ReviewSearch & { movement?: string };
}) {
  const box = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: [
      "weekly-event",
      producerId,
      search.date,
      search.period,
      search.from,
      search.until,
      search.movement,
    ],
    queryFn: () =>
      getWeeklyEvent({
        data: { ...search, producerId, date: search.date!, eventId: search.movement! },
      }),
    enabled: !!search.date && !!search.movement,
  });
  useEffect(() => {
    if (q.data || q.error) {
      box.current?.focus({ preventScroll: true });
      box.current?.scrollIntoView({ block: "start" });
    }
  }, [q.data, q.error]);
  const back = { ...search, movement: undefined };
  if (!search.date) return null;
  const openRecord = () => {
    const target = q.data?.target ?? "bitacora";
    const element = document.getElementById(target);
    if (!element) return;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement)
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    const inner = element.querySelector("details");
    if (inner instanceof HTMLDetailsElement) inner.open = true;
    element.scrollIntoView({ block: "center" });
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    element.classList.add("ring-2", "ring-primary");
    element.addEventListener("blur", () => element.classList.remove("ring-2", "ring-primary"), {
      once: true,
    });
  };
  return (
    <div
      ref={box}
      tabIndex={-1}
      className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-secondary p-4 outline-none"
      aria-label="Movimiento del seguimiento"
    >
      <Link
        to="/junta"
        search={back}
        className="inline-flex min-h-11 items-center font-medium underline"
      >
        ← Volver al seguimiento
      </Link>
      {search.movement ? (
        q.isPending ? (
          <p>Cargando movimiento…</p>
        ) : q.error ? (
          <p role="alert">{q.error.message}</p>
        ) : q.data ? (
          <>
            <h2 className="font-display text-xl">Movimiento que estás revisando</h2>
            <p className="whitespace-pre-wrap break-words">{q.data.detail}</p>
            <p className="text-sm">
              Registró: {q.data.actor} · {formatAppDateTime(q.data.at)}
            </p>
            <p className="text-sm text-muted">
              Este es el registro de esa fecha. El expediente de abajo muestra la situación actual.
            </p>
            <Button variant="outline" onClick={openRecord}>
              {q.data.kind === "documento"
                ? "Ver documento en papelería"
                : q.data.kind === "visita"
                  ? "Ver cita"
                  : q.data.kind === "contacto"
                    ? "Ver seguimiento del contacto"
                    : "Ver historia del expediente"}{" "}
              →
            </Button>
          </>
        ) : null
      ) : null}
    </div>
  );
}
