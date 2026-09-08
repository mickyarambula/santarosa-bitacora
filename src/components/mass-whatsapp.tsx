import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createTouch } from "@/lib/crm";
import { whatsappHref } from "@/lib/utils";
export type MassTarget = {
  id: string;
  name: string;
  phone: string | null;
  comisionistaName?: string;
};
export function MassWhatsApp({
  targets,
  messageFor,
  summary,
}: {
  targets: MassTarget[];
  messageFor: (t: MassTarget) => string;
  summary: string;
}) {
  const [list] = useState(() =>
    targets
      .filter((t) => Boolean(whatsappHref(t.phone, "")))
      .map((t) => ({ ...t, message: messageFor(t) })),
  );
  const [i, setI] = useState(0),
    [done, setDone] = useState<string[]>([]),
    [opened, setOpened] = useState(false);
  const qc = useQueryClient();
  const log = useMutation({
    mutationFn: createTouch,
    onSuccess: (_, vars) => {
      setDone((d) => [...d, vars.data.producerId]);
      setI((n) => n + 1);
      setOpened(false);
      void qc.invalidateQueries({ queryKey: ["producer"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (e: Error) =>
      toast.error(`No se guardó el registro: ${e.message}. Puedes reintentar.`),
  });
  if (!list.length)
    return <p className="text-sm text-muted">Nadie de esta lista tiene teléfono válido.</p>;
  const current = list[i],
    finished = !current;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-medium">Mandar por WhatsApp</p>
      <p className="mt-1 text-sm text-muted">
        Abre el chat, envía el mensaje y vuelve para marcar «Ya lo envié». Abrir WhatsApp no
        registra un envío ni una respuesta.
      </p>
      {finished ? (
        <p className="mt-3 text-sm">
          Marcaste como enviados {done.length} de {list.length}. Los demás se omitieron.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            {i + 1} de {list.length}: <strong>{current.name}</strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild>
              <a
                href={whatsappHref(current.phone, current.message)!}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpened(true)}
              >
                Abrir WhatsApp
              </a>
            </Button>
            <Button
              disabled={!opened || log.isPending}
              onClick={() =>
                log.mutate({
                  data: {
                    producerId: current.id,
                    channel: "whatsapp",
                    outcome: null,
                    summary: `${summary}. Envío confirmado manualmente; sin respuesta registrada.\n${current.message}`,
                  },
                })
              }
            >
              {log.isPending ? "Guardando…" : "Ya lo envié"}
            </Button>
            <Button
              variant="outline"
              disabled={log.isPending}
              onClick={() => {
                setI((n) => n + 1);
                setOpened(false);
              }}
            >
              Omitir
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
