import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { VisitForm } from "@/components/visit-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { createVisit, listProducers } from "@/lib/crm";
import { cropLabel } from "@/lib/catalog";
import { useViewAs } from "@/lib/view-as";

export function ScheduleVisitButton() {
  const qc = useQueryClient();
  const { agent } = useViewAs();
  const [open, setOpen] = useState(false);
  const [producerId, setProducerId] = useState("");

  const list = useQuery({
    queryKey: ["producers", { forVisit: true, agent }],
    queryFn: () => listProducers({ data: { agent: agent || undefined } }),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: createVisit,
    onSuccess: () => {
      toast.success("Cita agendada.");
      setOpen(false);
      setProducerId("");
      void qc.invalidateQueries({ queryKey: ["visits"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["producer"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const producers = list.data?.producers ?? [];

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" />
        Hacer cita
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hacer cita</DialogTitle>
            <DialogDescription>
              Elige al productor y cuándo lo van a ver. También se puede agendar desde su ficha.
            </DialogDescription>
          </DialogHeader>
          {list.isPending ? (
            <p className="text-sm text-muted">Cargando productores…</p>
          ) : producers.length === 0 ? (
            <p className="text-sm text-muted">
              Primero captura al productor y luego agenda la visita.
            </p>
          ) : (
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Productor</span>
                <NativeSelect
                  value={producerId}
                  onChange={(e) => setProducerId(e.target.value)}
                >
                  <option value="">Elige…</option>
                  {producers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.zone} · {cropLabel(p.crop)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {producerId ? (
                <VisitForm
                  pending={mut.isPending}
                  onSubmit={(data) =>
                    mut.mutate({
                      data: {
                        producerId,
                        scheduledAt: data.scheduledAt,
                        place: data.place,
                        purpose: data.purpose,
                        notes: data.notes,
                      },
                    })
                  }
                />
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
