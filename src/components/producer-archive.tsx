import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { deleteProducer, restoreProducer, listArchivedProducers } from "@/lib/crm";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
export function ProducerArchive({
  id,
  archived = false,
  canRestore = false,
}: {
  id: string;
  archived?: boolean;
  canRestore?: boolean;
}) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      archived
        ? restoreProducer({ data: { id, reason } })
        : deleteProducer({ data: { id, reason } }),
    onSuccess: () => {
      setReason("");
      toast.success(archived ? "Ficha restaurada." : "Ficha archivada; historial conservado.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (archived && !canRestore)
    return <p className="text-sm">Gerencia puede restaurar esta ficha.</p>;
  return (
    <details className="rounded-lg border p-3">
      <summary className="min-h-11 cursor-pointer py-2">
        {archived ? "Restaurar ficha" : "Archivar ficha"}
      </summary>
      <p className="text-sm text-muted">
        La ficha y su historial se conservan. Las fichas archivadas no aparecen en el trabajo
        diario.
      </p>
      <label className="my-3 grid gap-2 text-sm">
        Motivo
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      </label>
      <Button
        variant="outline"
        disabled={m.isPending || reason.trim().length < 5}
        onClick={() => m.mutate()}
      >
        {archived ? "Confirmar restauración" : "Confirmar archivo"}
      </Button>
    </details>
  );
}
export function ArchivedProducers() {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["archived-producers"],
    queryFn: () => listArchivedProducers(),
    enabled: open,
  });
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} className="my-4 rounded-lg border p-3">
      <summary className="cursor-pointer">Fichas archivadas</summary>
      {q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : q.data?.items.length ? (
        <ul className="mt-3 grid gap-2">
          {q.data.items.map((p) => (
            <li key={p.id}>
              <Link
                to="/productores/$id"
                params={{ id: p.id }}
                className="block min-h-11 underline"
              >
                {p.name} · {p.comisionistaName}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">{q.isPending ? "Cargando…" : "No hay fichas archivadas."}</p>
      )}
    </details>
  );
}
