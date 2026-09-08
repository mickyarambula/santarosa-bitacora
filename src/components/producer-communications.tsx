import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { prepareCommunication, confirmCommunication, listCommunications } from "@/lib/operations";
import type { Producer, DocumentItem } from "@/lib/types";
import { formatAppDateTime } from "@/lib/datetime";
import { whatsappHref } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/native-select";
const labels: Record<string, string> = {
  borrador: "Borrador · aún no se confirma envío",
  enviado_manual: "Envío confirmado manualmente",
  recibido: "Comunicación recibida",
  fallo: "Envío fallido",
  cancelado: "Borrador cancelado",
};
export function ProducerCommunications({
  producer: p,
  documents,
}: {
  producer: Producer;
  documents: DocumentItem[];
}) {
  const qc = useQueryClient(),
    [page, setPage] = useState(0),
    [open, setOpen] = useState(false),
    [id, setId] = useState(""),
    [channel, setChannel] = useState<"whatsapp" | "correo" | "llamada" | "oficina">("whatsapp"),
    [direction, setDirection] = useState<"salida" | "entrada">("salida"),
    [destination, setDestination] = useState(p.phone ?? ""),
    [body, setBody] = useState(""),
    [reference, setReference] = useState(""),
    [result, setResult] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [status, setStatus] = useState<"enviado_manual" | "fallo" | "cancelado">("enviado_manual");
  const q = useQuery({
    queryKey: ["communications", p.id, page],
    queryFn: () => listCommunications({ data: { producerId: p.id, page } }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["producer-history"] });
    void qc.invalidateQueries({ queryKey: ["communications", p.id] });
    void qc.invalidateQueries({ queryKey: ["producer", p.id] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const save = useMutation({
    mutationFn: prepareCommunication,
    onSuccess: () => {
      setOpen(false);
      setPage(0);
      refresh();
      toast.success(
        direction === "entrada"
          ? "Respuesta registrada."
          : "Borrador guardado; revisa el mensaje antes de enviarlo.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const confirm = useMutation({
    mutationFn: confirmCommunication,
    onSuccess: () => {
      setSelected(null);
      setResult("");
      refresh();
      toast.success("Resultado registrado. Programa una revisión si esperas respuesta.");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
  });
  const templates: Record<string, string> = {
    papeleria: `Hola ${p.name}, de Santa Rosa le solicitamos: ${
      documents
        .filter((d) => ["pendiente", "no_hizo"].includes(d.status))
        .map((d) => d.label)
        .join(", ") || "confirmar con Oficina los documentos de su expediente"
    }. ¿Cuándo podría entregarlos?`,
    cita: `Hola ${p.name}, le escribimos de Santa Rosa para confirmar nuestra cita. [Completar fecha, hora y lugar].`,
    pendiente: `Hola ${p.name}, de Santa Rosa damos seguimiento a [completar pendiente]. ¿Nos puede confirmar cómo va?`,
    resultado: `Hola ${p.name}, su expediente tiene una autorización registrada en Santa Rosa. Para conocer el detalle y los siguientes pasos, comuníquese con Oficina.`,
  };
  return (
    <details
      id="comunicaciones"
      className="scroll-mt-24 rounded-xl border border-border bg-surface p-4"
    >
      <summary className="min-h-11 cursor-pointer py-2 font-display text-xl">
        Comunicaciones · qué se envió y qué respondió
      </summary>
      <p className="text-sm text-muted">
        Contenido, destinatario, persona y fecha. No enviamos mensajes automáticamente ni inferimos
        que fueron leídos.
      </p>
      {!p.archivedAt ? (
        <Button
          className="my-3"
          variant="outline"
          onClick={() => {
            setId(crypto.randomUUID());
            setOpen(true);
            setBody("");
            setReference("");
            setDestination(p.phone ?? "");
            setChannel("whatsapp");
            setDirection("salida");
          }}
        >
          Registrar comunicación
        </Button>
      ) : null}
      {open ? (
        <form
          className="my-3 grid gap-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              data: {
                id,
                producerId: p.id,
                channel,
                direction,
                destination,
                body,
                documentReference: reference || undefined,
              },
            });
          }}
        >
          <label>
            Tipo de registro
            <NativeSelect
              aria-label="Tipo de registro"
              value={direction}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
            >
              <option value="salida">Preparar mensaje o registrar lo enviado</option>
              <option value="entrada">Registrar respuesta recibida</option>
            </NativeSelect>
          </label>
          <label>
            Canal
            <NativeSelect
              aria-label="Canal"
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value as typeof channel);
                setDestination(
                  e.target.value === "correo"
                    ? (p.email ?? "")
                    : e.target.value === "oficina"
                      ? p.name
                      : (p.phone ?? ""),
                );
              }}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="correo">Correo</option>
              <option value="llamada">Llamada</option>
              <option value="oficina">Atención en Oficina</option>
            </NativeSelect>
          </label>
          <label>
            {direction === "salida" ? "Destinatario" : "De quién recibimos"}
            <Input
              required
              maxLength={254}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </label>
          {direction === "salida" ? (
            <label>
              Texto de apoyo (opcional)
              <NativeSelect
                defaultValue=""
                onChange={(e) => setBody(templates[e.target.value] ?? "")}
              >
                <option value="">Escribir mi mensaje</option>
                <option value="papeleria">Solicitar papelería</option>
                <option value="cita">Confirmar cita</option>
                <option value="pendiente">Recordar pendiente</option>
                {["habilitado", "acopio"].includes(p.stage) ? (
                  <option value="resultado">Comunicar autorización registrada</option>
                ) : null}
              </NativeSelect>
            </label>
          ) : null}
          <label>
            Contenido exacto
            <Textarea
              required
              minLength={1}
              maxLength={5000}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label>
            Documento o versión mencionada (opcional)
            <Input
              maxLength={1000}
              placeholder="Ej. Lista de requisitos, versión del 8 de septiembre"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted">
            Esta referencia no adjunta ni envía archivos. Completa los datos entre corchetes antes
            de guardar.
          </p>
          <div className="flex gap-2">
            <Button disabled={save.isPending || /\[.*\]/.test(body)}>
              {direction === "entrada" ? "Guardar respuesta" : "Guardar borrador"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      {q.isPending ? (
        <p>Cargando comunicaciones…</p>
      ) : q.error ? (
        <p role="alert">{q.error.message}</p>
      ) : (
        <ul className="my-3 space-y-3">
          {q.data?.items.map((c) => (
            <li key={c.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">{labels[c.status] ?? c.status}</p>
              <p className="text-sm">
                {c.channel} · {c.destination}
              </p>
              <p className="text-xs text-muted">
                {c.actor} · {formatAppDateTime(c.happenedAt ?? c.createdAt)}
              </p>
              <p className="my-2 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              {c.reference ? <p className="text-xs">Documento/version: {c.reference}</p> : null}
              {c.result ? <p className="text-sm">Resultado: {c.result}</p> : null}
              {c.canConfirm && !p.archivedAt ? (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {c.channel === "whatsapp" && whatsappHref(c.destination, c.body) ? (
                      <Button variant="outline" asChild>
                        <a
                          href={whatsappHref(c.destination, c.body)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir WhatsApp con este texto
                        </a>
                      </Button>
                    ) : null}
                    {c.channel === "correo" ? (
                      <Button variant="outline" asChild>
                        <a
                          href={
                            "mailto:" +
                            encodeURIComponent(c.destination) +
                            "?subject=" +
                            encodeURIComponent("Santa Rosa") +
                            "&body=" +
                            encodeURIComponent(c.body)
                          }
                        >
                          Preparar correo
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelected(c.id);
                        setResult("");
                        setStatus("enviado_manual");
                      }}
                    >
                      Confirmar qué ocurrió
                    </Button>
                  </div>
                  {selected === c.id ? (
                    <form
                      className="grid gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        confirm.mutate({
                          data: { id: c.id, expectedVersion: c.version, status, result },
                        });
                      }}
                    >
                      <label>
                        Resultado del envío
                        <NativeSelect
                          aria-label="Resultado del envío"
                          value={status}
                          onChange={(e) => setStatus(e.target.value as typeof status)}
                        >
                          <option value="enviado_manual">Confirmo que lo envié o comuniqué</option>
                          <option value="fallo">Falló el envío</option>
                          <option value="cancelado">No se envió · cancelar borrador</option>
                        </NativeSelect>
                      </label>
                      <label>
                        Qué ocurrió
                        <Textarea
                          required
                          minLength={5}
                          maxLength={1000}
                          value={result}
                          onChange={(e) => setResult(e.target.value)}
                        />
                      </label>
                      <Button disabled={confirm.isPending}>Guardar confirmación</Button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!q.isPending && !q.data?.items.length ? (
        <p className="my-3 text-sm">
          Todavía no hay comunicaciones detalladas. Los contactos anteriores siguen en la bitácora.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!page} onClick={() => setPage((n) => n - 1)}>
          Anterior
        </Button>
        <Button variant="outline" disabled={!q.data?.hasMore} onClick={() => setPage((n) => n + 1)}>
          Siguiente
        </Button>
        <a href="#seguimiento" className="py-2 text-sm underline">
          Programar revisión en tareas
        </a>
      </div>
    </details>
  );
}
