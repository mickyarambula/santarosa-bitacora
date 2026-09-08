import { Check, Circle, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentItem } from "@/lib/types";
import type { DocStatus } from "@/lib/catalog";
import { DOC_STATUS, docIsComplete } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export function DocsChecklist({
  documents,
  onChange,
  pendingId,
  canValidate = false,
}: {
  documents: DocumentItem[];
  onChange: (id: string, status: DocStatus) => void;
  pendingId?: string | null;
  canValidate?: boolean;
}) {
  const required = documents.filter((d) => d.required);
  const extra = documents.filter((d) => !d.required);
  const left = required.filter((d) => !docIsComplete(d.status)).length;

  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-display text-lg font-medium">Papelería</p>
          <p className="text-sm text-muted">
            {left === 0 ? "Expediente completo de lo obligatorio." : `Faltan ${left} obligatorios.`}
          </p>
        </div>
        <p className="text-sm tabular text-muted">
          {required.filter((d) => docIsComplete(d.status)).length}/{required.length}
        </p>
      </div>
      {documents.some((d) => d.missing) ? (
        <p role="alert" className="text-sm text-rose">
          Faltan registros del expediente. Abre «Editar ficha» y guarda para completar la lista de
          papelería.
        </p>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{
            width: `${required.length ? (required.filter((d) => docIsComplete(d.status)).length / required.length) * 100 : 0}%`,
          }}
        />
      </div>
      <ul className="grid gap-2">
        {required.map((d) => (
          <DocRow
            key={d.id}
            doc={d}
            disabled={pendingId === d.id || d.missing}
            onChange={onChange}
            canValidate={canValidate}
          />
        ))}
      </ul>
      {extra.length ? (
        <>
          <p className="mt-2 text-xs font-medium uppercase tracking-wider text-subtle">
            Opcionales
          </p>
          <ul className="grid gap-2">
            {extra.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                disabled={pendingId === d.id || d.missing}
                onChange={onChange}
                canValidate={canValidate}
              />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function DocRow({
  doc,
  onChange,
  disabled,
  canValidate,
}: {
  doc: DocumentItem;
  onChange: (id: string, status: DocStatus) => void;
  disabled?: boolean;
  canValidate: boolean;
}) {
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <StatusIcon status={doc.status} />
          <div>
            <p className="font-medium leading-snug">{doc.label}</p>
            <p className="text-xs text-muted">
              {DOC_STATUS.find((s) => s.id === doc.status)?.label}
            </p>
            {doc.docType === "analisis_suelo" ? (
              <p className="text-xs text-muted">
                Requisito este ciclo. Lo tiene, sigue pendiente, o de plano no lo hizo.
              </p>
            ) : doc.required ? (
              <p className="text-xs text-subtle">Obligatorio</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {DOC_STATUS.filter((s) => canValidate || !["validado", "no_aplica"].includes(s.id)).map(
          (s) => (
            <Button
              key={s.id}
              type="button"
              size="sm"
              disabled={
                disabled || (!canValidate && ["validado", "no_aplica"].includes(doc.status))
              }
              variant={doc.status === s.id ? "default" : "outline"}
              className={cn("h-10 text-xs", doc.status === s.id && "pointer-events-none")}
              onClick={() => onChange(doc.id, s.id)}
            >
              {s.label}
            </Button>
          ),
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: DocStatus }) {
  if (status === "validado" || status === "recibido") {
    return (
      <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-sage/20 text-sage">
        <Check className="size-3" />
      </span>
    );
  }
  if (status === "no_hizo") {
    return (
      <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-rose/20 text-rose">
        <X className="size-3" />
      </span>
    );
  }
  if (status === "no_aplica") {
    return (
      <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-secondary text-muted">
        <Minus className="size-3" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-clay/15 text-clay">
      <Circle className="size-3" />
    </span>
  );
}
