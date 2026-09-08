import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getOfficeFile, listOfficeFiles, setDocumentStatus } from "@/lib/crm";
import { signOut } from "@/lib/auth/client";
import { DocsChecklist } from "./docs-checklist";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Profile } from "@/lib/types";
export function OfficeWorkspace({ profile }: { profile: Profile }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["office-files", profile.userId],
    queryFn: () => listOfficeFiles(),
  });
  const file = useQuery({
    queryKey: ["office-file", selected],
    queryFn: () => getOfficeFile({ data: { id: selected! } }),
    enabled: !!selected,
  });
  const change = useMutation({
    mutationFn: setDocumentStatus,
    onSuccess: () => {
      toast.success("Expediente actualizado.");
      void qc.invalidateQueries({ queryKey: ["office-file"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-5 bg-bg p-4 pb-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Santa Rosa · {profile.displayName}</p>
          <h1 className="font-display text-2xl">Oficina · Expedientes</h1>
        </div>
        <Button variant="ghost" onClick={() => void signOut("/login")}>
          Salir
        </Button>
      </header>
      <p className="text-sm text-muted">
        Recibe papelería, revisa documentos y deja observaciones. Las autorizaciones y excepciones
        corresponden a gerencia.
      </p>
      {selected ? (
        <>
          <Button variant="outline" onClick={() => setSelected(null)}>
            Volver a expedientes
          </Button>
          {file.error ? (
            <p role="alert">{file.error.message}</p>
          ) : file.isPending ? (
            <p>Cargando expediente…</p>
          ) : file.data ? (
            <section className="space-y-4">
              <h2 className="font-display text-xl">{file.data.name}</h2>
              <p className="text-sm">Responsable: {file.data.ownerName}</p>
              <DocsChecklist
                documents={file.data.documents}
                canValidate
                canExcept={false}
                pendingId={change.isPending ? change.variables?.data.id : null}
                onChange={(id, status, reason) => change.mutate({ data: { id, status, reason } })}
              />
            </section>
          ) : null}
        </>
      ) : (
        <>
          <Input
            aria-label="Buscar expediente"
            placeholder="Buscar productor o comisionista"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {list.error ? (
            <p role="alert">{list.error.message}</p>
          ) : list.isPending ? (
            <p>Cargando expedientes…</p>
          ) : !list.data?.items.length ? (
            <p>Gerencia todavía no te ha asignado carteras con expedientes activos.</p>
          ) : (
            <ul className="grid gap-2">
              {list.data.items
                .filter((p) =>
                  (p.name + " " + p.ownerName)
                    .toLocaleLowerCase("es")
                    .includes(search.toLocaleLowerCase("es")),
                )
                .map((p) => (
                  <li key={p.id}>
                    <button
                      className="min-h-16 w-full rounded-lg border bg-surface p-3 text-left"
                      onClick={() => setSelected(p.id)}
                    >
                      <span className="block font-medium">{p.name}</span>
                      <span className="text-sm text-muted">{p.ownerName} · Abrir papelería</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
