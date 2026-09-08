import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { searchReception } from "@/lib/operations";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function ReceptionSearch() {
  const [text, setText] = useState(""),
    [q, setQ] = useState("");
  const result = useQuery({
    queryKey: ["reception-search", q],
    queryFn: () => searchReception({ data: { q } }),
    enabled: q.length >= 2,
  });
  return (
    <section className="mb-5 rounded-xl border border-border bg-secondary p-4">
      <h2 className="font-display text-xl">¿Ya tiene expediente?</h2>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(text.trim());
        }}
      >
        <label className="min-w-0 flex-1">
          Buscar por nombre o teléfono
          <Input
            required
            minLength={2}
            maxLength={150}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <Button variant="outline">Buscar expediente</Button>
      </form>
      {q ? (
        <div className="mt-3">
          {result.isPending ? (
            <p>Buscando…</p>
          ) : result.error ? (
            <p role="alert">{result.error.message}</p>
          ) : (
            <>
              <ul className="space-y-2">
                {result.data.items.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/productores/$id"
                      params={{ id: p.id }}
                      className="block rounded-lg bg-surface p-3"
                    >
                      <strong>{p.name}</strong>
                      <span className="block text-sm">
                        {p.portfolio} · {p.phone ?? "Sin teléfono"}
                        {p.archived ? " · Archivado" : ""}
                      </span>
                      <span className="text-sm underline">Abrir expediente existente</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {!result.data.items.length ? (
                <p>No encontramos coincidencias. Puedes continuar con la captura.</p>
              ) : (
                <p className="mt-2 text-sm">
                  Si es la misma persona, abre su ficha para registrar la atención.
                </p>
              )}
              {result.data.hasMore ? (
                <p className="text-sm">
                  Hay más coincidencias. Escribe un nombre o teléfono más específico.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
