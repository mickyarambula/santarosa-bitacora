import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { VISIT_PURPOSES } from "@/lib/catalog";

export function VisitForm({
  onSubmit,
  pending,
}: {
  onSubmit: (data: { scheduledAt: string; place: string; purpose: string; notes: string }) => void;
  pending?: boolean;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [place, setPlace] = useState("");
  const [purpose, setPurpose] = useState<string>(VISIT_PURPOSES[0]);
  const [notes, setNotes] = useState("");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!scheduledAt) return;
        onSubmit({ scheduledAt, place, purpose, notes });
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
      <Button type="submit" disabled={pending || !scheduledAt}>
        {pending ? "Agendando…" : "Agendar visita"}
      </Button>
    </form>
  );
}
