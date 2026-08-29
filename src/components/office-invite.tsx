import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, MessageCircle } from "lucide-react";
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
import { listOfficePeople, pingOffice } from "@/lib/crm";
import { cn } from "@/lib/utils";

export function OfficeInvite({
  producerId,
  visitId,
  producerName,
  compact = false,
  className,
}: {
  producerId?: string;
  visitId?: string;
  producerName?: string;
  compact?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const people = useQuery({
    queryKey: ["office-people"],
    queryFn: () => listOfficePeople(),
    enabled: open,
  });
  const ping = useMutation({
    mutationFn: (personId: string) =>
      pingOffice({
        data: {
          personId,
          kind: "invite",
          producerId,
          visitId,
        },
      }),
    onSuccess: (res) => {
      toast.success(`WhatsApp listo para ${res.personName}.`);
      void qc.invalidateQueries({ queryKey: ["producer"] });
      window.open(res.href, "_blank", "noopener,noreferrer");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invitees = (people.data?.people ?? []).filter((p) => p.forInvite);

  return (
    <>
      <Button
        type="button"
        variant={compact ? "outline" : "secondary"}
        size={compact ? "sm" : "default"}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Handshake className="size-4" />
        {compact ? "Apoyo" : "Pedir apoyo"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Quién te acompaña?</DialogTitle>
            <DialogDescription>
              {producerName
                ? `Se abre WhatsApp con el mensaje listo para ${producerName}. Queda en la bitácora.`
                : "Se abre WhatsApp con el mensaje listo. Queda asentado."}
            </DialogDescription>
          </DialogHeader>
          {people.isPending ? (
            <p className="text-sm text-muted">Cargando oficina…</p>
          ) : invitees.length === 0 ? (
            <p className="text-sm text-muted">
              Gerencia aún no cargó a quién invitar. Pídeles que agreguen al director o a los socios
              en Equipo.
            </p>
          ) : (
            <ul className="grid gap-2">
              {invitees.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={ping.isPending}
                    onClick={() => ping.mutate(p.id)}
                    className={cn(
                      "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg px-4 py-3 text-left",
                      "hover:bg-secondary disabled:opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      {p.title ? <span className="block text-xs text-muted">{p.title}</span> : null}
                    </span>
                    <MessageCircle className="size-5 shrink-0 text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
