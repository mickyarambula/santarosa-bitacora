import { dateBoundary, periodSchema, type PeriodSelection } from "./period";
import { weekRange } from "./weekly-dates";
import type { WeekEvent, WeekTask } from "./weekly";
export type ReviewSearch = PeriodSelection & {
  tab?: "actividad" | "pendientes" | "juntas";
  scope?: "cartera" | "persona";
  date?: string;
  view?: "live" | "saved";
  portfolio?: string;
  section?: "avances" | "compromisos" | "trabas" | "acuerdos";
  category?: string;
  group?: "comisionistas" | "empresa" | "pendiente" | "todos";
  filter?: "todos" | "actividad" | "sin-actividad" | "vencidos";
  q?: string;
  page?: number;
};
export function reviewSearch(raw: Record<string, unknown>): ReviewSearch {
  const parsed = periodSchema.safeParse(raw);
  const result: ReviewSearch = parsed.success ? parsed.data : {};
  if (["actividad", "pendientes", "juntas"].includes(String(raw.tab)))
    result.tab = raw.tab as ReviewSearch["tab"];
  if (raw.scope === "cartera" || raw.scope === "persona") result.scope = raw.scope;
  if (raw.view === "live" || raw.view === "saved") result.view = raw.view;
  if (typeof raw.date === "string") {
    try {
      dateBoundary(raw.date);
      result.date = result.period ? raw.date : weekRange(raw.date).key;
    } catch {
      /* Invalid URL dates use this week. */
    }
  }
  for (const key of ["portfolio", "category", "q"] as const)
    if (typeof raw[key] === "string") result[key] = raw[key].slice(0, 150);
  if (["avances", "compromisos", "trabas", "acuerdos"].includes(String(raw.section)))
    result.section = raw.section as ReviewSearch["section"];
  if (["comisionistas", "empresa", "pendiente", "todos"].includes(String(raw.group)))
    result.group = raw.group as ReviewSearch["group"];
  if (["todos", "actividad", "sin-actividad", "vencidos"].includes(String(raw.filter)))
    result.filter = raw.filter as ReviewSearch["filter"];
  const page = Number(raw.page);
  if (Number.isInteger(page) && page >= 0 && page <= 500) result.page = page;
  return result;
}
export type ReviewPortfolio = { id: string; name: string; role?: string; identity?: string };
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function portfolioSummaries(
  portfolios: ReviewPortfolio[],
  events: WeekEvent[],
  tasks: WeekTask[],
  asOf: string,
  scope: "cartera" | "persona" = "cartera",
) {
  const summaries = portfolios.map((p) => ({
    ...p,
    producers: new Set<string>(),
    movements: 0,
    completed: 0,
    overdue: 0,
    pending: 0,
  }));
  const index = new Map(summaries.map((p) => [p.id, p]));
  for (const e of events) {
    const p = index.get(scope === "persona" ? (e.actorId ?? "") : e.portfolioId);
    if (p) {
      p.producers.add(e.producerId);
      p.movements++;
    }
  }
  for (const t of tasks) {
    const p = index.get(
      scope === "persona"
        ? t.status === "atendida"
          ? (t.completedBy ?? "")
          : (t.assigneeId ?? "")
        : t.portfolioId,
    );
    if (p) {
      if (t.status === "atendida") p.completed++;
      if (["pendiente", "esperando"].includes(t.status)) p.pending++;
      if (["pendiente", "esperando"].includes(t.status) && t.dueAt < asOf) p.overdue++;
    }
  }
  return summaries;
}
export function filterPortfolios<
  T extends ReviewPortfolio & { movements: number; completed: number; overdue: number },
>(items: T[], search: ReviewSearch) {
  return items.filter((p) => {
    const group = search.group ?? "comisionistas",
      filter = search.filter ?? "todos";
    const belongs =
      group === "todos" || (group === "comisionistas" ? p.role === "comisionista" : p.id === group);
    const active = p.movements > 0 || p.completed > 0;
    return (
      belongs &&
      normalize(p.name + " " + (p.identity ?? "")).includes(normalize(search.q ?? "")) &&
      (filter === "todos" ||
        (filter === "actividad" ? active : filter === "sin-actividad" ? !active : p.overdue > 0))
    );
  });
}
