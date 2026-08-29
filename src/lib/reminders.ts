import { APP_TZ } from "@/lib/datetime";

export function visitConfirmMessage(opts: {
  producerName: string;
  when: Date;
  purpose?: string | null;
  place?: string | null;
}): string {
  const when = opts.when.toLocaleString("es-MX", {
    timeZone: APP_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const extra = [opts.purpose, opts.place].filter(Boolean).join(" · ");
  return `Hola ${opts.producerName}, le confirmo la visita de Almacenes Santa Rosa el ${when}${extra ? ` (${extra})` : ""}. ¿Sigue en pie?`;
}

export function paperworkMessage(opts: {
  producerName: string;
  agentName: string;
  missing: string[];
}): string {
  const list = opts.missing.map((d) => `• ${d}`).join("\n");
  return `Hola ${opts.producerName}, soy ${opts.agentName} de Almacenes Santa Rosa. Nos faltan:\n\n${list}\n\n¿Cuándo se los recogeríamos?`;
}

export function followUpMessage(opts: {
  producerName: string;
  agentName: string;
  stageLabel: string;
}): string {
  return `Hola ${opts.producerName}, soy ${opts.agentName} de Almacenes Santa Rosa. Quedamos en ${opts.stageLabel.toLowerCase()} y no hemos avanzado. ¿Cuándo nos vemos o le recogo lo que falte?`;
}

export function inviteToVisitMessage(opts: {
  personName: string;
  agentName: string;
  producerName: string;
  when: Date;
  purpose?: string | null;
  place?: string | null;
  crop?: string | null;
  hectares?: number | null;
  zone?: string | null;
}): string {
  const when = opts.when.toLocaleString("es-MX", {
    timeZone: APP_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const extra = [
    opts.crop,
    opts.hectares ? `${opts.hectares} ha` : null,
    opts.zone,
    opts.purpose,
    opts.place,
  ]
    .filter(Boolean)
    .join(", ");
  return `Hola ${opts.personName}, soy ${opts.agentName} de Almacenes Santa Rosa. ¿Me puede acompañar con ${opts.producerName} el ${when}?${extra ? ` ${extra}.` : ""} Quedo al pendiente.`;
}

export function inviteToCloseMessage(opts: {
  personName: string;
  agentName: string;
  producerName: string;
  crop?: string | null;
  hectares?: number | null;
  zone?: string | null;
  stageLabel?: string | null;
}): string {
  const extra = [opts.crop, opts.hectares ? `${opts.hectares} ha` : null, opts.zone, opts.stageLabel]
    .filter(Boolean)
    .join(", ");
  return `Hola ${opts.personName}, soy ${opts.agentName} de Almacenes Santa Rosa. Necesito apoyo para cerrar con ${opts.producerName}${extra ? ` (${extra})` : ""}. ¿Cuándo podemos ir o hablarle?`;
}

export function officeDigestMessage(opts: {
  personName: string;
  lines: string[];
}): string {
  const body = opts.lines.length ? opts.lines.map((l) => `• ${l}`).join("\n") : "Hoy no hay pendientes fuertes.";
  return `Hola ${opts.personName}, le mando el avance de Almacenes Santa Rosa:\n\n${body}\n\nQuedo al pendiente.`;
}

export function missingDocMessage(opts: {
  producerName: string;
  agentName: string;
  docLabel: string;
}): string {
  return `Hola ${opts.producerName}, soy ${opts.agentName} de Almacenes Santa Rosa. Para seguir con el ciclo nos hace falta el ${opts.docLabel}. ¿Cuándo se lo podemos recoger?`;
}

export function producerBroadcastMessage(opts: {
  producerName: string;
  agentName: string;
  body: string;
}): string {
  return `Hola ${opts.producerName}, le escribe ${opts.agentName} de Almacenes Santa Rosa.\n\n${opts.body}`;
}

export function teamAnnouncementShare(opts: { title: string; body: string; author: string }): string {
  return [`Aviso de gerencia — Almacenes Santa Rosa`, opts.title, "", opts.body, "", `— ${opts.author}`]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}
