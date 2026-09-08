import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { archiveAnnouncement, editAnnouncement, getAnnouncementHistory } from "@/lib/crm";
import { formatAppDateTime, toAppDateTimeInput } from "@/lib/datetime";
import type { Announcement } from "@/lib/types";
export function AnnouncementCard({ notice }: { notice: Announcement }) {
  const [editing, setEditing] = useState(false),
    [history, setHistory] = useState(false);
  const [title, setTitle] = useState(notice.title),
    [body, setBody] = useState(notice.body),
    [expiry, setExpiry] = useState(notice.expiresAt ? toAppDateTimeInput(notice.expiresAt) : "");
  const [editingVersion, setEditingVersion] = useState(notice.updatedAt);
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["announcements"] });
    void qc.invalidateQueries({ queryKey: ["announcement-history", notice.id] });
  };
  const archive = useMutation({
    mutationFn: archiveAnnouncement,
    onSuccess: (_, v) => {
      refresh();
      toast.success(
        v.data.archive
          ? "Aviso retirado de Hoy. Se conserva en Historial."
          : "Aviso restaurado. Revisa su vigencia.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: editAnnouncement,
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast.success("Aviso actualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const audit = useQuery({
    queryKey: ["announcement-history", notice.id],
    queryFn: () => getAnnouncementHistory({ data: { id: notice.id } }),
    enabled: history,
  });
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{notice.title}</h3>
        <span className="rounded-full bg-secondary px-2 py-1 text-xs">
          {notice.state === "vigente"
            ? "Vigente"
            : notice.state === "vencido"
              ? "Vencido"
              : "Retirado"}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{notice.body}</p>
      <p className="mt-3 text-xs text-muted">
        {notice.authorName} · {formatAppDateTime(notice.createdAt)}
      </p>
      <p className="text-xs text-muted">
        {notice.expiresAt
          ? `Visible hasta ${formatAppDateTime(notice.expiresAt)} · hora de Sinaloa`
          : "Sin fecha de vencimiento"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {notice.archivedAt ? (
          <Button
            variant="outline"
            disabled={archive.isPending}
            onClick={() => archive.mutate({ data: { id: notice.id, archive: false } })}
          >
            Restaurar
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditingVersion(notice.updatedAt);
                setTitle(notice.title);
                setBody(notice.body);
                setExpiry(notice.expiresAt ? toAppDateTimeInput(notice.expiresAt) : "");
                setEditing((v) => !v);
              }}
            >
              Editar
            </Button>
            <Button
              variant="outline"
              disabled={archive.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `¿Retirar «${notice.title}»? Dejará de salir en Hoy y se conservará en Historial.`,
                  )
                )
                  archive.mutate({ data: { id: notice.id, archive: true } });
              }}
            >
              Retirar de Hoy
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => setHistory((v) => !v)}>
          Historial
        </Button>
      </div>
      {editing ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              data: {
                id: notice.id,
                title,
                body,
                expiresAt: expiry || null,
                expectedUpdatedAt: editingVersion,
              },
            });
          }}
        >
          <label className="grid gap-1 text-sm">
            Título
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Mensaje
            <Textarea required value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Visible hasta (opcional)
            <Input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>
          <Button disabled={save.isPending}>Guardar aviso</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </form>
      ) : null}
      {history ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm font-medium">Historial del aviso</p>
          {audit.isPending ? (
            <p>Cargando…</p>
          ) : audit.error ? (
            <p role="alert">No se pudo cargar el historial.</p>
          ) : !audit.data?.items.length ? (
            <p className="text-sm text-muted">
              Aviso anterior a esta mejora; conservamos su fecha y autor originales.
            </p>
          ) : (
            <ol className="mt-2 grid gap-3">
              {audit.data.items.map((a) => (
                <li key={a.id} className="text-sm">
                  <p>
                    {a.actor} ·{" "}
                    {(
                      {
                        publicar: "Publicó",
                        preparar: "Preparó",
                        editar: "Editó",
                        retirar: "Retiró",
                        restaurar: "Restauró",
                      } as Record<string, string>
                    )[a.action] ?? a.action}{" "}
                    · {formatAppDateTime(a.at)}
                  </p>
                  {a.action === "editar" ? (
                    <details className="mt-1 text-muted">
                      <summary>Ver cambio de contenido</summary>
                      <p className="whitespace-pre-wrap">
                        Antes: {a.beforeTitle} — {a.beforeBody}
                      </p>
                      <p className="whitespace-pre-wrap">
                        Después: {a.afterTitle} — {a.afterBody}
                      </p>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </article>
  );
}
