import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
  const withPhone = targets.filter((t) => t.phone);
  const [i, setI] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const log = useMutation({
    mutationFn: createTouch,
  });

  if (!withPhone.length) {
    return <p className="text-sm text-muted">Nadie de esta lista tiene teléfono.</p>;
  }

  const current = withPhone[Math.min(i, withPhone.length - 1)]!;
  const finished = i >= withPhone.length;
  const wa = finished ? null : whatsappHref(current.phone, messageFor(current));

  function markSent() {
    log.mutate({
      data: {
        producerId: current.id,
        channel: "whatsapp",
        outcome: "prometio",
        summary,
      },
    });
    setDone((d) => [...d, current.id]);
    setI((n) => n + 1);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-medium">Mandar por WhatsApp</p>
      <p className="mt-1 text-sm text-muted">
        Gerencia. Se abre el chat de cada uno; tú picas enviar. Queda asentado en la ficha.
      </p>
      {finished ? (
        <p className="mt-3 text-sm">Listo. Se mandó a {done.length} de {withPhone.length}.</p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            {i + 1} de {withPhone.length}: <span className="font-medium">{current.name}</span>
            {current.comisionistaName ? ` · ${current.comisionistaName}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {wa ? (
              <Button asChild>
                <a href={wa} target="_blank" rel="noreferrer" onClick={markSent}>
                  Abrir WhatsApp
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setI((n) => n + 1)}>
                Sin teléfono, siguiente
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                toast.message(`Saltamos a ${current.name}.`);
                setI((n) => n + 1);
              }}
            >
              Saltar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
