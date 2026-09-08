import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setOfficeAssignments, setAccessAdmin } from "@/lib/crm";
import type { Profile } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
export function RolePermissions({
  member,
  members,
}: {
  member: Profile;
  members: (Profile & { email?: string | null })[];
}) {
  const [owners, setOwners] = useState(member.officeOwnerIds ?? []);
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const options = {
    onSuccess: () => {
      toast.success("Permisos guardados con historial.");
      setReason("");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  };
  const office = useMutation({ mutationFn: setOfficeAssignments, ...options });
  const admin = useMutation({ mutationFn: setAccessAdmin, ...options });
  if (!["oficina", "gerente"].includes(member.role)) return null;
  return (
    <details className="mt-2 max-w-xs text-sm">
      <summary className="min-h-11 cursor-pointer py-2">
        {member.role === "oficina"
          ? "Carteras asignadas"
          : member.accessAdmin
            ? "Administra accesos"
            : "Permiso de accesos"}
      </summary>
      <div className="grid gap-3 rounded-lg border p-3">
        {member.role === "oficina" ? (
          members
            .filter((p) => p.role !== "oficina" && p.status === "activo")
            .map((p) => (
              <label key={p.userId} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={owners.includes(p.userId)}
                  onChange={(e) =>
                    setOwners((a) =>
                      e.target.checked ? [...a, p.userId] : a.filter((id) => id !== p.userId),
                    )
                  }
                />
                {p.displayName}
                {members.filter((m) => m.displayName === p.displayName).length > 1
                  ? ` · ${p.email ?? p.userId}`
                  : ""}
              </label>
            ))
        ) : (
          <p>Este permiso permite administrar usuarios, roles y el candado.</p>
        )}
        <label>
          Motivo del cambio
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </label>
        <Button
          disabled={office.isPending || admin.isPending || reason.trim().length < 5}
          onClick={() =>
            member.role === "oficina"
              ? office.mutate({ data: { userId: member.userId, ownerIds: owners, reason } })
              : admin.mutate({
                  data: { userId: member.userId, enabled: !member.accessAdmin, reason },
                })
          }
        >
          {member.role === "oficina"
            ? "Guardar carteras"
            : member.accessAdmin
              ? "Retirar administración"
              : "Dar administración"}
        </Button>
      </div>
    </details>
  );
}
