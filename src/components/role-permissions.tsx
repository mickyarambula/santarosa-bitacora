import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setAccessAdmin } from "@/lib/crm";
import type { Profile } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
export function RolePermissions({
  member,
}: {
  member: Profile;
  members: (Profile & { email?: string | null })[];
}) {
  const [reason, setReason] = useState(""),
    qc = useQueryClient();
  const m = useMutation({
    mutationFn: setAccessAdmin,
    onSuccess: () => {
      void qc.invalidateQueries();
      setReason("");
      toast.success("Permiso guardado con historial.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (member.role === "oficina")
    return (
      <p className="text-sm text-muted">
        Atención de todas las carteras. No autoriza habilitación ni administra accesos.
      </p>
    );
  if (member.role !== "gerente") return null;
  return (
    <details className="mt-2 max-w-xs text-sm">
      <summary className="min-h-11 cursor-pointer py-2">
        {member.accessAdmin ? "Administra accesos" : "Permiso de accesos"}
      </summary>
      <div className="grid gap-2 rounded-lg border p-3">
        <p>Permite administrar usuarios, roles y candado.</p>
        <label>
          Motivo del cambio
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </label>
        <Button
          disabled={m.isPending || reason.trim().length < 5}
          onClick={() =>
            m.mutate({ data: { userId: member.userId, enabled: !member.accessAdmin, reason } })
          }
        >
          {member.accessAdmin ? "Retirar administración" : "Dar administración"}
        </Button>
      </div>
    </details>
  );
}
