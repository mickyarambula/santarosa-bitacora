import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STAGES, needsApproval, type StageId } from "@/lib/catalog";
import { setStage } from "@/lib/crm";
import type { Producer } from "@/lib/types";
import { NativeSelect } from "./ui/native-select";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
export function StageControl({
  producer: p,
  isGerente,
}: {
  producer: Producer;
  isGerente: boolean;
}) {
  const qc = useQueryClient();
  const [closing, setClosing] = useState(false);
  const [kind, setKind] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: setStage,
    onSuccess: () => {
      setClosing(false);
      void qc.invalidateQueries();
      toast.success("Etapa guardada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <label className="grid gap-2 text-sm">
        Mover de etapa
        <NativeSelect
          value={p.stage}
          disabled={m.isPending || !!p.archivedAt}
          onChange={(e) => {
            const stage = e.target.value as StageId;
            if (stage === "cerrado") {
              setClosing(true);
              setKind("");
              setReason("");
            } else m.mutate({ data: { id: p.id, stage } });
          }}
        >
          {STAGES.filter(
            (s) =>
              isGerente || (!needsApproval(s.id) && !needsApproval(p.stage)) || s.id === p.stage,
          ).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {p.stage === "cerrado" ? (
        <p className="text-sm">
          Resultado:{" "}
          {p.closeKind === "ganado"
            ? "Trato concretado"
            : p.closeKind === "perdido"
              ? "Trato perdido"
              : p.closeKind === "cancelado"
                ? "Cancelado"
                : "Cierre anterior sin resultado clasificado"}
          . {p.closeReason}
        </p>
      ) : null}
      <Dialog open={closing} onOpenChange={setClosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cómo terminó el trato?</DialogTitle>
            <DialogDescription>
              El cierre conserva la ficha y deja de sumarla a la cartera activa.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2">
            Resultado del cierre
            <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Elige el resultado</option>
              <option value="ganado">Se concretó el trato</option>
              <option value="perdido">Se perdió / no calificó</option>
              <option value="cancelado">Se canceló</option>
            </NativeSelect>
          </label>
          <label className="grid gap-2">
            Motivo del cierre
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </label>
          <Button
            disabled={!kind || reason.trim().length < 5 || m.isPending}
            onClick={() =>
              m.mutate({ data: { id: p.id, stage: "cerrado", closeKind: kind, reason } })
            }
          >
            Guardar cierre
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
