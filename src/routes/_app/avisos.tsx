import { AnnouncementCard } from "@/components/announcement-card";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MassWhatsApp } from "@/components/mass-whatsapp";
import { PageBack } from "@/components/page-back";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { STAGES, stageMeta } from "@/lib/catalog";
import { listAnnouncements, listBroadcastTargets, postAnnouncement } from "@/lib/crm";
import { producerBroadcastMessage, teamAnnouncementShare } from "@/lib/reminders";
import { whatsappShareHref } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export const Route = createFileRoute("/_app/avisos")({ component: AvisosPage });

function AvisosPage() {
  const { isGerente, displayName } = useViewAs();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["announcements", "history"],
    queryFn: () => listAnnouncements({ data: { includeHistory: true } }),
    enabled: isGerente,
    refetchInterval: 60000,
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [preparedBody, setPreparedBody] = useState("");
  const [prodStage, setProdStage] = useState("papeleria");
  const [prodBody, setProdBody] = useState("");
  const [mass, setMass] = useState(false);

  const post = useMutation({
    mutationFn: postAnnouncement,
    onSuccess: (_, vars) => {
      toast.success(
        vars.data.kind === "equipo"
          ? "Aviso publicado. Les sale en Hoy."
          : "Lista preparada. Confirma cada envío después de hacerlo.",
      );
      if (vars.data.kind === "equipo") {
        setTitle("");
        setBody("");
        setExpiresAt("");
      } else {
        setPreparedBody(vars.data.body.trim());
        setMass(true);
      }
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const targets = useQuery({
    queryKey: ["broadcast", prodStage],
    queryFn: () => listBroadcastTargets({ data: { stage: prodStage } }),
    enabled: isGerente && mass,
  });

  const teamShare = useMemo(() => {
    if (!body.trim()) return "";
    return teamAnnouncementShare({
      title: title.trim() || "Aviso al equipo",
      body: body.trim(),
      author: displayName,
    });
  }, [title, body, displayName]);

  if (!isGerente) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageBack to="/" label="Inicio" />
        <p className="text-muted">Los avisos los manda gerencia.</p>
      </div>
    );
  }

  const equipo = (list.data?.items ?? []).filter((a) => a.kind === "equipo");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageBack to="/" label="Inicio" />
      <header>
        <h1 className="font-display text-3xl font-medium tracking-tight">Avisos</h1>
        <p className="text-sm text-muted">
          Al equipo les sale en Hoy y lo puedes volcar al WhatsApp del grupo. A productores, según
          etapa, WhatsApp uno por uno (queda en la ficha).
        </p>
      </header>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="font-medium">Al equipo (comisionistas)</p>
        <Input
          className="mt-3"
          placeholder="Título, ej. Esta semana INE y análisis de suelo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          className="mt-2"
          rows={4}
          placeholder="El recado…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label className="mt-3 grid gap-1 text-sm">
          Visible hasta (opcional) · hora de Sinaloa
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <span className="text-xs text-muted">Al vencer, sale de Hoy y queda en Historial.</span>
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={post.isPending || !body.trim()}
            onClick={() =>
              post.mutate({ data: { kind: "equipo", title, body, expiresAt: expiresAt || null } })
            }
          >
            Publicar en Hoy
          </Button>
          {teamShare ? (
            <Button asChild variant="secondary">
              <a href={whatsappShareHref(teamShare)} target="_blank" rel="noreferrer">
                Mandar al grupo de WhatsApp
              </a>
            </Button>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="font-medium">A productores, según etapa</p>
        <label className="mt-3 grid gap-1.5 text-sm">
          Quiénes
          <NativeSelect
            value={prodStage}
            onChange={(e) => {
              setProdStage(e.target.value);
              setMass(false);
            }}
          >
            <option value="">Todas las etapas vivas</option>
            {STAGES.filter((s) => s.id !== "cerrado").map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Textarea
          className="mt-2"
          rows={4}
          placeholder="Ej. Esta semana ocupamos el análisis de suelo. Pásenlo a su comisionista."
          value={prodBody}
          onChange={(e) => setProdBody(e.target.value)}
        />
        <Button
          type="button"
          className="mt-3"
          variant="outline"
          disabled={post.isPending || !prodBody.trim()}
          onClick={() => {
            post.mutate({
              data: {
                kind: "productores",
                title: stageMeta(prodStage || "papeleria").label,
                body: prodBody,
                stage: prodStage || null,
              },
            });
          }}
        >
          Preparar envío
        </Button>
        {mass ? (
          <div className="mt-4">
            {targets.isPending ? (
              <p className="text-sm text-muted">Cargando lista…</p>
            ) : targets.error ? (
              <p role="alert">
                No se pudo cargar la lista.{" "}
                <button onClick={() => void targets.refetch()}>Reintentar</button>
              </p>
            ) : (
              <MassWhatsApp
                targets={targets.data?.targets ?? []}
                key={preparedBody + prodStage}
                summary="Aviso de gerencia"
                messageFor={(t) =>
                  producerBroadcastMessage({
                    producerName: t.name,
                    agentName: t.comisionistaName ?? "Santa Rosa",
                    body: preparedBody,
                  })
                }
              />
            )}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3">
        <div className="flex gap-2">
          <Button
            variant={!showHistory ? "default" : "outline"}
            onClick={() => setShowHistory(false)}
          >
            Vigentes
          </Button>
          <Button
            variant={showHistory ? "default" : "outline"}
            onClick={() => setShowHistory(true)}
          >
            Historial / retirados
          </Button>
        </div>
        {list.isPending ? (
          <p>Cargando avisos…</p>
        ) : list.error ? (
          <p role="alert">
            No se pudieron cargar los avisos.{" "}
            <button onClick={() => void list.refetch()}>Reintentar</button>
          </p>
        ) : (
          <>
            {equipo.filter((a) => (showHistory ? a.state !== "vigente" : a.state === "vigente"))
              .length === 0 ? (
              <p className="text-sm text-muted">
                {showHistory ? "No hay avisos vencidos o retirados." : "No hay avisos vigentes."}
              </p>
            ) : null}
            {equipo
              .filter((a) => (showHistory ? a.state !== "vigente" : a.state === "vigente"))
              .map((a) => (
                <AnnouncementCard key={a.id} notice={a} />
              ))}
          </>
        )}
      </section>
    </div>
  );
}
