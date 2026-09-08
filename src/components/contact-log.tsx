import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CHANNELS, OUTCOMES, channelLabel, outcomeLabel } from "@/lib/catalog";
import { NextAction } from "./next-action";
import { formatAppDateTime } from "@/lib/datetime";
import { createTouch } from "@/lib/crm";
import type { TouchItem } from "@/lib/types";
import { cn, mailtoHref, telHref, whatsappHref } from "@/lib/utils";

export function ContactLog({
  producerId,
  producerName,
  phone,
  email,
  agentName,
  touches,
}: {
  producerId: string;
  producerName: string;
  phone: string | null;
  email: string | null;
  agentName: string;
  touches: TouchItem[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("llamada");
  const [outcome, setOutcome] = useState("");
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState("");

  const log = useMutation({
    mutationFn: createTouch,
    onSuccess: () => {
      toast.success("Quedó en la bitácora.");
      setSaved(true);
      setSummary("");
      void qc.invalidateQueries({ queryKey: ["producer", producerId] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["weekly-report"] });
      void qc.invalidateQueries({ queryKey: ["producer-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function quick(ch: string) {
    setChannel(ch);
    setOutcome("");
    setSaved(false);
    setOpen(true);
  }

  const tel = telHref(phone);
  const wa = whatsappHref(
    phone,
    `Hola ${producerName}, le escribe ${agentName} de Almacenes Santa Rosa por el ciclo 26-27.`,
  );
  const mail = mailtoHref(email, `Almacenes Santa Rosa · ${producerName}`);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {tel ? (
          <Button asChild variant="outline">
            <a href={tel} onClick={() => quick("llamada")}>
              <Phone className="size-4" />
              Llamar
            </a>
          </Button>
        ) : null}
        {wa ? (
          <Button asChild variant="secondary">
            <a href={wa} target="_blank" rel="noreferrer" onClick={() => quick("whatsapp")}>
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          </Button>
        ) : null}
        {mail ? (
          <Button asChild variant="outline">
            <a href={mail} onClick={() => quick("correo")}>
              <Mail className="size-4" />
              Correo
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="wheat"
          onClick={() => {
            setSaved(false);
            setOutcome("");
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Registrar seguimiento
        </Button>
      </div>
      {!tel && !wa && !mail ? (
        <p className="text-sm text-muted">Falta teléfono o correo para marcar o escribirle.</p>
      ) : null}

      {touches.length ? (
        <details id="contactos">
          <summary className="cursor-pointer text-sm text-muted">
            Últimos contactos ({touches.length})
          </summary>
          <ol className="grid gap-2">
            {touches.map((t) => (
              <li key={t.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <p className="font-medium">
                  {channelLabel(t.channel)}
                  {t.outcome ? ` · ${outcomeLabel(t.outcome)}` : ""}
                </p>
                {t.summary ? <p className="text-muted">{t.summary}</p> : null}
                <p className="mt-0.5 text-xs text-subtle">{formatAppDateTime(t.happenedAt)}</p>
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <p className="text-sm text-muted">
          Aquí va cada llamada, WhatsApp, mensaje o correo. Así se ve cómo va el trato.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {saved ? "3. ¿Qué sigue y para cuándo?" : "Registrar seguimiento"}
            </DialogTitle>
            <DialogDescription>
              Abrir el teléfono o WhatsApp no registra un contacto. Guarda únicamente la gestión
              realizada.
            </DialogDescription>
          </DialogHeader>
          {saved ? (
            <>
              <p className="text-sm">Resultado guardado. Puedes acordar aquí el siguiente paso.</p>
              <NextAction producerId={producerId} embedded />
              <Button variant="outline" onClick={() => setOpen(false)}>
                Terminar
              </Button>
            </>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                log.mutate({
                  data: { producerId, channel, outcome, summary: summary.trim() || null },
                });
              }}
            >
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">1. ¿Qué hiciste?</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CHANNELS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChannel(c.id)}
                      className={cn(
                        "min-h-11 rounded-lg border px-3 text-sm font-medium",
                        channel === c.id
                          ? "border-primary bg-primary/8"
                          : "border-border bg-bg hover:bg-secondary",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">2. ¿Qué pasó?</span>
                <NativeSelect
                  aria-label="¿Cómo quedó?"
                  required
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <option value="">Elige qué pasó</option>
                  {OUTCOMES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Nota (opcional)</span>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Quedó de traer el predial el jueves…"
                />
              </label>
              <Button type="submit" disabled={log.isPending || !outcome}>
                {log.isPending ? "Guardando…" : "Guardar en la bitácora"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                No se realizó · cerrar sin registrar
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
