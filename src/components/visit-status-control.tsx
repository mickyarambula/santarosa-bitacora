import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setVisitStatus } from "@/lib/crm";
import { VISIT_STATUS, type VisitStatus } from "@/lib/catalog";
import type { Visit } from "@/lib/types";
import { NativeSelect } from "./ui/native-select";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
export function VisitStatusControl({ visit }: { visit: Visit }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<VisitStatus | null>(null);
  const [result, setResult] = useState("");
  const m = useMutation({
    mutationFn: setVisitStatus,
    onSuccess: () => {
      setPending(null);
      setResult("");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <NativeSelect
        aria-label="Estado de la cita"
        className="h-11 w-40"
        value={visit.status}
        disabled={m.isPending}
        onChange={(e) => {
          setPending(e.target.value as VisitStatus);
          setResult("");
        }}
      >
        {VISIT_STATUS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </NativeSelect>
      <Dialog
        open={pending !== null}
        onOpenChange={(v) => {
          if (!v && !m.isPending) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Qué pasó con la cita?</DialogTitle>
            <DialogDescription>
              {pending === "cumplida"
                ? "Registra el resultado de la visita. Se contará como contacto realizado."
                : "Explica el cambio para conservarlo en la bitácora."}
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2">
            Resultado o motivo
            <Textarea value={result} onChange={(e) => setResult(e.target.value)} maxLength={1000} />
          </label>
          <Button
            disabled={m.isPending || result.trim().length < 5}
            onClick={() =>
              pending && m.mutate({ data: { id: visit.id, status: pending, notes: result } })
            }
          >
            Guardar resultado de la cita
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
