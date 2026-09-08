import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisitForm } from "@/components/visit-form";
import { rescheduleVisit } from "@/lib/crm";
import type { Visit } from "@/lib/types";
export function RescheduleVisit({ visit }: { visit: Visit }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: rescheduleVisit,
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries();
      toast.success("Cita reprogramada; el cambio quedó en la bitácora.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (visit.status !== "programada") return null;
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Reprogramar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprogramar cita</DialogTitle>
            <DialogDescription>
              {visit.producerName}. Conservaremos la fecha anterior y el motivo del cambio.
            </DialogDescription>
          </DialogHeader>
          <VisitForm
            key={visit.scheduledAt}
            initial={visit}
            requireReason
            pending={change.isPending}
            onSubmit={(data) =>
              change.mutate({
                data: { ...data, id: visit.id, expectedScheduledAt: visit.scheduledAt },
              })
            }
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
