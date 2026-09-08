import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { previewBroadcast, prepareBroadcast, listBroadcasts, getBroadcast } from "@/lib/broadcasts";
import { confirmCommunication } from "@/lib/operations";
import { STAGES } from "@/lib/catalog";
import { formatAppDateTime } from "@/lib/datetime";
import { useViewAs } from "@/lib/view-as";
import { whatsappHref } from "@/lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";

export function BroadcastPanel() {
  const [stage, setStage] = useState("papeleria"),
    [body, setBody] = useState(""),
    [review, setReview] = useState(false),
    [active, setActive] = useState<string | null>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [page, setPage] = useState(0);
  const { displayName } = useViewAs(),
    qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["broadcast-preview", stage],
    queryFn: () => previewBroadcast({ data: { stage } }),
  });
  const batches = useQuery({
    queryKey: ["broadcast-batches", page],
    queryFn: () => listBroadcasts({ data: { page } }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["broadcast-batches"] });
    void qc.invalidateQueries({ queryKey: ["communications"] });
  };
  const prepare = useMutation({
    mutationFn: prepareBroadcast,
    onSuccess: (r) => {
      setActive(r.id);
      setReview(false);
      setBody("");
      setRequestId(crypto.randomUUID());
      setPage(0);
      refresh();
      toast.success("Lista guardada. Todavía no se envía ningún mensaje.");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void preview.refetch();
      setReview(false);
    },
  });
  const eligible = preview.data?.items.filter((p) => p.eligible) ?? [],
    excluded = preview.data?.items.filter((p) => !p.eligible) ?? [];
  return (
    <section className="space-y-5" aria-label="Mensajes a productores">
      <header>
        <h2 className="font-display text-2xl">Mensajes a productores</h2>
        <p className="text-sm text-muted">
          Revisa a quién escribirás. Los mensajes se envían uno por uno desde tu WhatsApp.
        </p>
      </header>
      {active ? (
        <>
          <Button variant="outline" onClick={() => setActive(null)}>
            Volver a mis listas
          </Button>
          <PreparedBroadcast key={active} id={active} />
        </>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <h3 className="font-medium">1. Elegir destinatarios</h3>
            <label className="grid gap-1">
              Etapa del productor
              <NativeSelect
                aria-label="Etapa del productor"
                disabled={prepare.isPending}
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setReview(false);
                  setRequestId(crypto.randomUUID());
                }}
              >
                <option value="">Todas las etapas activas</option>
                {STAGES.filter((s) => s.id !== "cerrado").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <p className="text-sm text-muted">
              «Papelería» selecciona esa etapa. Para pedir un documento faltante usa el módulo
              Papelería. Una conversación por ficha, incluso si un grupo comparte teléfono.
            </p>
            {preview.isPending ? (
              <p>Cargando destinatarios…</p>
            ) : preview.error ? (
              <p role="alert">
                {preview.error.message}{" "}
                <button className="underline" onClick={() => void preview.refetch()}>
                  Reintentar
                </button>
              </p>
            ) : (
              <>
                <p role="status" className="rounded-lg bg-secondary p-3">
                  <strong>{eligible.length} destinatarios con teléfono</strong> · {excluded.length}{" "}
                  excluidos
                </p>
                {!preview.data?.items.length ? (
                  <p>No hay productores activos en esta etapa. Elige otra etapa.</p>
                ) : !eligible.length ? (
                  <p>
                    Hay productores en esta etapa, pero ninguno tiene teléfono válido. Corrige sus
                    teléfonos antes de preparar.
                  </p>
                ) : null}
                <details>
                  <summary className="cursor-pointer">
                    Ver destinatarios y excluidos ({preview.data?.items.length})
                  </summary>
                  <ul className="mt-2 max-h-64 space-y-2 overflow-auto">
                    {preview.data?.items.map((p) => (
                      <li key={p.id} className="border-b border-border pb-2 text-sm">
                        <Link to="/productores/$id" params={{ id: p.id }} className="underline">
                          {p.name}
                        </Link>{" "}
                        · {p.portfolio}
                        <br />
                        {p.eligible ? p.phone : "Excluido: teléfono ausente o inválido"}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            <h3 className="pt-2 font-medium">2. Escribir y revisar</h3>
            <label className="grid gap-1">
              Mensaje
              <Textarea
                rows={4}
                maxLength={4000}
                disabled={prepare.isPending}
                value={body}
                placeholder="Escribe el recado que quieres enviar…"
                onChange={(e) => {
                  setBody(e.target.value);
                  setReview(false);
                  setRequestId(crypto.randomUUID());
                }}
              />
            </label>
            <Button
              variant="outline"
              disabled={!body.trim() || !eligible.length || preview.isFetching || prepare.isPending}
              onClick={() => setReview(true)}
            >
              Revisar mensaje y destinatarios
            </Button>
            {review && eligible[0] ? (
              <div className="space-y-3 rounded-lg border border-primary/30 p-4">
                <p className="font-medium">Vista previa · {eligible[0].name}</p>
                <p className="whitespace-pre-wrap">
                  Hola {eligible[0].name}, le escribe {displayName} de Almacenes Santa Rosa.
                  <br />
                  <br />
                  {body.trim()}
                </p>
                <p className="text-sm">
                  Se guardarán {eligible.length} mensajes personalizados. Preparar no envía ni
                  registra un contacto.
                </p>
                <Button
                  disabled={prepare.isPending || preview.isFetching}
                  onClick={() =>
                    prepare.mutate({
                      data: { id: requestId, stage, body, expectedVersion: preview.data!.version },
                    })
                  }
                >
                  {prepare.isPending ? "Guardando…" : "Guardar lista preparada"}
                </Button>
              </div>
            ) : null}
          </div>
          <h3 className="font-display text-xl">Mis listas preparadas</h3>
          <p className="text-sm text-muted">
            Aquí puedes retomar lo pendiente y consultar lo confirmado. Los borradores también
            aparecen en Comunicaciones de cada productor.
          </p>
          {batches.isPending ? (
            <p>Cargando listas…</p>
          ) : batches.error ? (
            <p role="alert">{batches.error.message}</p>
          ) : !batches.data?.items.length ? (
            <p>Todavía no has guardado una lista con este flujo.</p>
          ) : (
            batches.data.items.map((b) => (
              <article key={b.id} className="space-y-2 rounded-xl border border-border p-4">
                <p className="text-sm text-muted">{formatAppDateTime(b.createdAt)}</p>
                <p className="line-clamp-2 whitespace-pre-wrap">{b.body}</p>
                <p className="text-sm">
                  {b.pending} pendientes · {b.sent} enviados confirmados · {b.cancelled} cancelados
                  o fallidos
                </p>
                <Button variant="outline" onClick={() => setActive(b.id)}>
                  {b.pending ? "Retomar lista" : "Ver resultado"}
                </Button>
              </article>
            ))
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={!batches.data?.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
function PreparedBroadcast({ id }: { id: string }) {
  const qc = useQueryClient(),
    [opened, setOpened] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["broadcast-batch", id],
    queryFn: () => getBroadcast({ data: { id } }),
  });
  const confirm = useMutation({
    mutationFn: confirmCommunication,
    onSuccess: () => {
      setOpened(null);
      for (const key of [
        "broadcast-batch",
        "broadcast-batches",
        "communications",
        "producer-history",
        "producer",
        "dashboard",
        "weekly-report",
      ])
        void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void q.refetch();
    },
  });
  if (q.isPending) return <p>Cargando lista guardada…</p>;
  if (q.error)
    return (
      <p role="alert">
        {q.error.message}{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Reintentar
        </button>
      </p>
    );
  const items = q.data!.items,
    pending = items.filter((i) => i.status === "borrador"),
    current = pending.find((i) => i.available),
    sent = items.filter((i) => i.status === "enviado_manual").length;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <h3 className="font-display text-xl">3. Enviar y confirmar</h3>
      <p role="status">
        {sent} enviados confirmados · {pending.length} pendientes ·{" "}
        {items.length - sent - pending.length} cancelados o fallidos
      </p>
      {current ? (
        <>
          <p className="font-medium">
            Siguiente: {current.producer_name} · {current.destination}
          </p>
          <p className="whitespace-pre-wrap rounded-lg bg-secondary p-3">{current.body}</p>
          <p className="text-sm">
            Abre el chat y pulsa enviar dentro de WhatsApp. Después vuelve aquí y confirma. Abrir el
            chat no acredita un envío ni una respuesta.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a
                href={whatsappHref(current.destination, current.body)!}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpened(current.id)}
              >
                Abrir WhatsApp
              </a>
            </Button>
            <Button
              disabled={opened !== current.id || confirm.isPending}
              onClick={() =>
                confirm.mutate({
                  data: {
                    id: current.id,
                    expectedVersion: current.version,
                    status: "enviado_manual",
                    result:
                      "Envío confirmado manualmente desde la lista de gerencia; sin respuesta registrada.",
                  },
                })
              }
            >
              Ya lo envié
            </Button>
            <Button
              variant="outline"
              disabled={confirm.isPending}
              onClick={() =>
                confirm.mutate({
                  data: {
                    id: current.id,
                    expectedVersion: current.version,
                    status: "cancelado",
                    result: "Destinatario omitido manualmente; no se envió el mensaje.",
                  },
                })
              }
            >
              Omitir · no enviar
            </Button>
          </div>
        </>
      ) : (
        <p>
          {pending.length
            ? "Hay fichas archivadas o fuera del ciclo. Revisa sus expedientes antes de continuar."
            : "Lista terminada. Puedes consultar el resultado abajo."}
        </p>
      )}
      <details>
        <summary className="cursor-pointer">Resultado por productor ({items.length})</summary>
        <ul className="mt-3 space-y-2">
          {items.map((i) => (
            <li key={i.id} className="border-b border-border pb-2 text-sm">
              <Link
                to="/productores/$id"
                params={{ id: i.producer_id }}
                hash="comunicaciones"
                className="underline"
              >
                {i.producer_name}
              </Link>{" "}
              ·{" "}
              {{
                borrador: "Preparado · sin enviar",
                enviado_manual: "Enviado · confirmación manual",
                cancelado: "Omitido / cancelado",
                fallo: "Falló",
                recibido: "Recibido",
              }[i.status] ?? i.status}
              {!i.available ? " · Ficha no disponible para envío" : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
