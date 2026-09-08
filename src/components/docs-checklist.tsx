import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentItem } from "@/lib/types";
import { DOC_STATUS, docIsComplete, type DocStatus } from "@/lib/catalog";

export function DocsChecklist({
  documents,
  onChange,
  pendingId,
  canValidate = false,
  canExcept = canValidate,
  readOnly = false,
}: {
  documents: DocumentItem[];
  onChange: (id: string, status: DocStatus, reason?: string) => void;
  pendingId?: string | null;
  canValidate?: boolean;
  canExcept?: boolean;
  readOnly?: boolean;
}) {
  const required = documents.filter((d) => d.required);
  const gathered = required.filter((d) => docIsComplete(d.status)).length;
  const checked = required.filter((d) => ["validado", "no_aplica"].includes(d.status)).length;
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="font-display text-lg font-medium">Papelería</h3>
        <p className="text-sm text-muted">
          Reunidos {gathered} de {required.length} · Validados o autorizados {checked} de{" "}
          {required.length}
        </p>
        <p className="text-xs text-muted">Reunir los papeles no autoriza la habilitación.</p>
      </div>
      {documents.some((d) => d.missing) ? (
        <p role="alert">Faltan registros del expediente. Pide a gerencia completar la ficha.</p>
      ) : null}
      <ul className="grid gap-2">
        {documents.map((d) => (
          <DocRow
            key={d.id}
            doc={d}
            onChange={onChange}
            disabled={readOnly || pendingId === d.id || d.missing}
            canValidate={canValidate}
            canExcept={canExcept}
          />
        ))}
      </ul>
    </div>
  );
}
function DocRow({
  doc,
  onChange,
  disabled,
  canValidate,
  canExcept,
}: {
  doc: DocumentItem;
  onChange: (id: string, status: DocStatus, reason?: string) => void;
  disabled?: boolean;
  canValidate: boolean;
  canExcept: boolean;
}) {
  const [reason, setReason] = useState("");
  const options = DOC_STATUS.filter(
    (s) =>
      (canValidate || !["entregado", "validado", "no_aplica"].includes(s.id)) &&
      (canExcept || s.id !== "no_aplica") &&
      (s.id !== "no_hizo" || doc.docType === "analisis_suelo"),
  );
  const locked =
    (!canValidate && ["validado", "no_aplica", "entregado"].includes(doc.status)) ||
    (!canExcept && doc.status === "no_aplica");
  return (
    <li>
      <details className="rounded-lg border border-border bg-surface px-3">
        <summary className="min-h-14 cursor-pointer py-3">
          <span className="font-medium">{doc.label}</span>
          <span className="mt-1 block text-xs text-muted">
            {DOC_STATUS.find((s) => s.id === doc.status)?.label}
            {doc.required ? " · Obligatorio" : " · Opcional"}
          </span>
        </summary>
        {doc.notes ? <p className="pb-2 text-sm text-muted">Observación: {doc.notes}</p> : null}
        {locked ? (
          <p className="pb-3 text-sm text-muted">
            Revisado por oficina o gerencia. Pídeles cualquier corrección.
          </p>
        ) : null}
        {!disabled && !locked ? (
          <div className="grid gap-2 pb-3">
            <label className="grid gap-1 text-sm">
              Observación o motivo {canExcept ? "(obligatorio para No aplica)" : "(opcional)"}
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={
                !reason.trim() ||
                reason.trim() === doc.notes ||
                (doc.status === "no_aplica" && reason.trim().length < 5)
              }
              onClick={() => onChange(doc.id, doc.status, reason.trim())}
            >
              Guardar observación
            </Button>
            <div className="flex flex-wrap gap-2">
              {options.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant={doc.status === s.id ? "default" : "outline"}
                  disabled={
                    doc.status === s.id || (s.id === "no_aplica" && reason.trim().length < 5)
                  }
                  onClick={() => onChange(doc.id, s.id, reason.trim() || undefined)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </details>
    </li>
  );
}
