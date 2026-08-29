import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { REJECTION_REASONS, rejectionReasonLabel, type RejectionKind, type RejectionReasonId } from "@/lib/catalog";
import type { Producer } from "@/lib/types";
import { qty } from "@/lib/utils";

export function RejectionPanel({
  producer,
  pending,
  onSave,
}: {
  producer: Producer;
  pending?: boolean;
  onSave: (data: {
    kind: RejectionKind | "none";
    reason?: string | null;
    notes?: string | null;
    hectaresAuthorized?: number | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RejectionKind>(producer.rejectionKind === "parcial" ? "parcial" : "total");
  const [reason, setReason] = useState<RejectionReasonId>(producer.rejectionReason ?? "credito");
  const [notes, setNotes] = useState(producer.rejectionNotes ?? "");
  const requested = producer.hectaresRequested || producer.hectares;
  const [authorized, setAuthorized] = useState(
    producer.rejectionKind === "parcial" ? String(producer.hectares) : "",
  );

  if (producer.rejectionKind && !open) {
    return (
      <div className="rounded-xl border border-rose/30 bg-rose/8 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-rose">
          {producer.rejectionKind === "total" ? "Rechazo total" : "Rechazo parcial"}
        </p>
        <p className="mt-1 font-medium">
          {rejectionReasonLabel(producer.rejectionReason)}
          {producer.rejectionKind === "parcial"
            ? ` · ${qty(producer.hectares, 0)} ha de ${qty(requested, 0)} pedidas`
            : ` · ${qty(requested, 0)} ha que se pidieron`}
        </p>
        {producer.rejectionNotes ? <p className="mt-1 text-sm text-muted">{producer.rejectionNotes}</p> : null}
        <p className="mt-2 text-xs text-muted">
          {producer.rejectedBy ? `${producer.rejectedBy} · ` : ""}queda en el expediente para el siguiente ciclo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            Cambiar dictamen
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onSave({ kind: "none" })}>
            Quitar rechazo
          </Button>
        </div>
      </div>
    );
  }

  if (!open && !producer.rejectionKind) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Registrar rechazo o recorte de ha
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-medium">Dictamen</p>
      <p className="mt-1 text-sm text-muted">
        Queda en el expediente. El próximo ciclo se ve para terquearle o buscarle otra manera.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={
            kind === "total"
              ? "rounded-lg border border-primary bg-primary/8 px-3 py-3 text-left font-medium"
              : "rounded-lg border border-border px-3 py-3 text-left"
          }
          onClick={() => setKind("total")}
        >
          Rechazo total
        </button>
        <button
          type="button"
          className={
            kind === "parcial"
              ? "rounded-lg border border-primary bg-primary/8 px-3 py-3 text-left font-medium"
              : "rounded-lg border border-border px-3 py-3 text-left"
          }
          onClick={() => setKind("parcial")}
        >
          Recortar hectáreas
        </button>
      </div>
      <label className="mt-3 grid gap-1.5 text-sm">
        Motivo
        <NativeSelect value={reason} onChange={(e) => setReason(e.target.value as RejectionReasonId)}>
          {REJECTION_REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {kind === "parcial" ? (
        <label className="mt-3 grid gap-1.5 text-sm">
          Hectáreas que sí se autorizan (pidió {qty(requested, 0)})
          <Input
            inputMode="decimal"
            value={authorized}
            onChange={(e) => setAuthorized(e.target.value)}
            placeholder="50"
          />
        </label>
      ) : null}
      <label className="mt-3 grid gap-1.5 text-sm">
        Especificación (opcional)
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Lo que haya que saber el año que entra."
          rows={3}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            onSave({
              kind,
              reason,
              notes: notes.trim() || null,
              hectaresAuthorized: kind === "parcial" ? Number(authorized) : null,
            })
          }
        >
          Guardar dictamen
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
