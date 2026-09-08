import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mergeAccounts, previewAccountMerge } from "@/lib/crm";
import type { Profile } from "@/lib/types";
type Member = Profile & { email: string | null; producers: number };
export function AccountMerge({ members, actorId }: { members: Member[]; actorId: string }) {
  const [open, setOpen] = useState(false),
    [sourceId, setSource] = useState(""),
    [targetId, setTarget] = useState(""),
    [confirmEmail, setConfirm] = useState("");
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["account-merge", sourceId, targetId],
    queryFn: () => previewAccountMerge({ data: { sourceId, targetId } }),
    enabled: open && !!sourceId && !!targetId && sourceId !== targetId,
  });
  const merge = useMutation({
    mutationFn: mergeAccounts,
    onSuccess: (r) => {
      setOpen(false);
      setSource("");
      setTarget("");
      setConfirm("");
      void qc.invalidateQueries();
      toast.success(`Cartera unificada: ${r.total} productores en ${r.email}.`);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      void preview.refetch();
    },
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Unificar cuentas duplicadas
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!merge.isPending) setOpen(v);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Una cuenta, una cartera</DialogTitle>
            <DialogDescription>
              Usa esta opción solo cuando ambas cuentas pertenecen a la misma persona. Conserva
              fichas, papelería y autores anteriores; no cambia la contraseña de la cuenta que se
              conserva.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm">
            Cuenta duplicada que se inhabilita
            <NativeSelect
              value={sourceId}
              onChange={(e) => {
                setSource(e.target.value);
                setConfirm("");
              }}
            >
              <option value="">Elige la duplicada…</option>
              {members
                .filter((m) => m.userId !== actorId && m.userId !== targetId)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName} · {m.email ?? "sin correo"} · {m.producers} productores
                  </option>
                ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Cuenta que conserva el acceso
            <NativeSelect
              value={targetId}
              onChange={(e) => {
                setTarget(e.target.value);
                setConfirm("");
              }}
            >
              <option value="">Elige la cuenta definitiva…</option>
              {members
                .filter((m) => m.status === "activo" && m.userId !== sourceId)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName} · {m.email ?? "sin correo"} · {m.producers} productores
                  </option>
                ))}
            </NativeSelect>
          </label>
          {sourceId && targetId ? (
            <>
              {preview.isPending ? (
                <p>Revisando carteras…</p>
              ) : preview.error ? (
                <p role="alert">{preview.error.message}</p>
              ) : preview.data ? (
                <div className="grid gap-3">
                  <p className="rounded-lg bg-secondary p-3 text-sm">
                    Se moverán <strong>{preview.data.sourceCount}</strong> productores.{" "}
                    <strong>{preview.data.target.email}</strong> quedará con{" "}
                    <strong>{preview.data.producers.length}</strong>. La cuenta duplicada perderá
                    acceso.
                  </p>
                  <label className="grid gap-1 text-sm">
                    Escribe el correo que se conserva
                    <Input
                      value={confirmEmail}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <Button
                    disabled={
                      merge.isPending ||
                      confirmEmail.trim().toLowerCase() !== preview.data.target.email.toLowerCase()
                    }
                    onClick={() =>
                      merge.mutate({
                        data: {
                          sourceId,
                          targetId,
                          confirmEmail,
                          expectedSourceCount: preview.data!.sourceCount,
                          expectedTargetCount: preview.data!.targetCount,
                        },
                      })
                    }
                  >
                    {merge.isPending ? "Unificando…" : "Confirmar unificación"}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
