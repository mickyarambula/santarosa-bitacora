import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { toAppDateTimeInput } from "@/lib/datetime";
import { VISIT_PURPOSES } from "@/lib/catalog";

export function VisitForm({
  onSubmit,
  pending,
  initial,
  requireReason = false,
}: {
  onSubmit: (data: {
    scheduledAt: string;
    place: string;
    purpose: string;
    notes: string;
    reason: string;
  }) => void;
  pending?: boolean;
  initial?: {
    scheduledAt: string;
    place: string | null;
    purpose: string | null;
    notes: string | null;
  };
  requireReason?: boolean;
}) {
  const [scheduledAt, setScheduledAt] = useState(
    initial ? toAppDateTimeInput(initial.scheduledAt) : "",
  );
  const [place, setPlace] = useState(initial?.place ?? "");
  const [purpose, setPurpose] = useState<string>(initial?.purpose ?? VISIT_PURPOSES[0]);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [reason, setReason] = useState("");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!scheduledAt) return;
        onSubmit({ scheduledAt, place, purpose, notes, reason });
      }}
    >
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Cuándo</span>
        <Input
          required
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Para qué</span>
        <NativeSelect value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {VISIT_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Dónde</span>
        <Input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Campo, oficina Guasave, casa del productor…"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Nota</span>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </label>
      {requireReason ? (
        <label className="grid gap-1.5 text-sm">
          Motivo del cambio
          <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      ) : null}
      <p className="text-xs text-muted">Hora de Sinaloa (Los Mochis / Guasave).</p>
      <Button type="submit" disabled={pending || !scheduledAt || (requireReason && !reason.trim())}>
        {pending ? "Guardando…" : initial ? "Guardar reprogramación" : "Agendar visita"}
      </Button>
    </form>
  );
}
