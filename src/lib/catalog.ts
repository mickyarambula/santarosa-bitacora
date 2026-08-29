export const CYCLE = "26-27";
export const COMPANY = "Almacenes Santa Rosa";

export const ZONES = [
  "Ahome",
  "Guasave",
  "Juan José Ríos",
  "Sinaloa",
  "El Fuerte",
  "Choix",
  "Salvador Alvarado",
  "Angostura",
  "Mocorito",
  "Navolato",
  "Culiacán",
] as const;

export type Zone = (typeof ZONES)[number];

export const CROPS = [
  { id: "maiz_blanco", label: "Maíz blanco", defaultYield: 12, unit: "ton/ha", defaultPerHa: 35000 },
  { id: "sorgo", label: "Sorgo", defaultYield: 9, unit: "ton/ha", defaultPerHa: 18000 },
  { id: "frijol", label: "Frijol", defaultYield: 2, unit: "ton/ha", defaultPerHa: 22000 },
  { id: "garbanzo", label: "Garbanzo", defaultYield: 2.4, unit: "ton/ha", defaultPerHa: 28000 },
  { id: "maiz_amarillo", label: "Maíz amarillo", defaultYield: 11, unit: "ton/ha", defaultPerHa: 32000 },
] as const;

export type CropId = (typeof CROPS)[number]["id"];

export const UNITS = [
  {
    id: "parafinanciero",
    label: "Parafinanciero",
    hint: "Habilitación con insumos, diésel y dinero a través de la parafinanciera.",
  },
  {
    id: "directo",
    label: "Directo",
    hint: "Trato directo con Almacenes Santa Rosa, sin pasar por parafinanciera.",
  },
] as const;

export type BusinessUnit = (typeof UNITS)[number]["id"];

export const SCHEMES = [
  {
    id: "financiamiento",
    label: "Financiamiento (habilitación)",
    hint: "Se le habilita al productor: insumos, diésel y/o dinero.",
  },
  {
    id: "cobertura_fira",
    label: "Cobertura FIRA (sin financiamiento)",
    hint: "No necesita habilitación; entra al programa de cobertura FIRA. Deja el financiamiento en 0.",
  },
  {
    id: "acopio",
    label: "Solo acopio de grano",
    hint: "Compra de cosecha, sin habilitar ni cobertura.",
  },
] as const;

export type SchemeId = (typeof SCHEMES)[number]["id"];

export const RELATIONS = [
  {
    id: "nuevo",
    label: "Nuevo",
    hint: "Primera vez que trabaja con Santa Rosa.",
  },
  {
    id: "recurrente",
    label: "Recurrente",
    hint: "Ya nos entrega o ya lo hemos habilitado.",
  },
  {
    id: "recuperacion",
    label: "Recuperación",
    hint: "Ya había trabajado con nosotros, se fue con otro y lo estamos negociando de vuelta.",
  },
] as const;

export type RelationId = (typeof RELATIONS)[number]["id"];

export function relationLabel(id: string): string {
  return RELATIONS.find((r) => r.id === id)?.label ?? id;
}

export function parseRelation(raw: unknown, isNew?: boolean): RelationId {
  const v = String(raw ?? "");
  if (v === "nuevo" || v === "recurrente" || v === "recuperacion") return v;
  return isNew === false ? "recurrente" : "nuevo";
}

export const GROUP_ROLES = [
  {
    id: "titular",
    label: "Productor real",
    hint: "El que realmente siembra y mueve el trato.",
  },
  {
    id: "familiar",
    label: "Familiar",
    hint: "Esposa, hijo, hermano… prestan el nombre para crédito o apoyo.",
  },
  {
    id: "amigo",
    label: "Amigo / conocido",
    hint: "Presta el nombre. No es el operador.",
  },
  {
    id: "socio",
    label: "Socio",
    hint: "Andan juntos en la operación.",
  },
] as const;

export type GroupRoleId = (typeof GROUP_ROLES)[number]["id"];

export function groupRoleLabel(id: string | null | undefined): string {
  if (!id) return "";
  return GROUP_ROLES.find((r) => r.id === id)?.label ?? id;
}

export function parseGroupRole(raw: unknown): GroupRoleId | null {
  const v = String(raw ?? "");
  if (v === "titular" || v === "familiar" || v === "amigo" || v === "socio") return v;
  return null;
}

export const STAGES = [
  {
    id: "prospecto",
    label: "Prospecto",
    short: "Prospecto",
    hint: "Lo acabamos de captar. Falta visitarlo o convencerlo.",
    tone: "stone",
  },
  {
    id: "visita",
    label: "En visita",
    short: "Visita",
    hint: "Hay cita o ya se está visitando.",
    tone: "olive",
  },
  {
    id: "interesado",
    label: "Convencido",
    short: "Convencido",
    hint: "Ya aceptó. Hay que pedirle la papelería.",
    tone: "clay",
  },
  {
    id: "papeleria",
    label: "Papelería",
    short: "Papeles",
    hint: "Juntando documentos. Esta es la etapa que más se atora.",
    tone: "clay",
  },
  {
    id: "evaluacion",
    label: "En evaluación",
    short: "Evaluación",
    hint: "Expediente en revisión de crédito o cobertura.",
    tone: "ink",
  },
  {
    id: "habilitado",
    label: "Habilitado",
    short: "Habilitado",
    hint: "Aprobado. Ya se le pueden entregar insumos, diésel o dinero.",
    tone: "sage",
  },
  {
    id: "acopio",
    label: "En acopio",
    short: "Acopio",
    hint: "Está entregando o va a entregar grano.",
    tone: "sage",
  },
  {
    id: "cerrado",
    label: "Cerrado / no califica",
    short: "Cerrado",
    hint: "No siguió, no calificó, o se perdió.",
    tone: "rose",
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const DOC_STATUS = [
  { id: "pendiente", label: "Pendiente" },
  { id: "recibido", label: "Lo tiene" },
  { id: "validado", label: "Validado" },
  { id: "no_hizo", label: "No lo hizo" },
  { id: "no_aplica", label: "No aplica" },
] as const;

export type DocStatus = (typeof DOC_STATUS)[number]["id"];

export function docIsComplete(status: string): boolean {
  return status === "recibido" || status === "validado" || status === "no_aplica";
}

export const DOC_CATALOG: Record<
  SchemeId,
  { id: string; label: string; required: boolean }[]
> = {
  financiamiento: [
    { id: "ine", label: "INE vigente", required: true },
    { id: "curp", label: "CURP", required: true },
    { id: "rfc", label: "Constancia de situación fiscal (RFC)", required: true },
    { id: "domicilio", label: "Comprobante de domicilio", required: true },
    { id: "predio", label: "Título o contrato de arrendamiento", required: true },
    { id: "predial", label: "Recibo predial", required: true },
    { id: "cuenta", label: "Estado de cuenta bancario", required: true },
    { id: "croquis", label: "Croquis / ubicación del predio", required: true },
    { id: "analisis_suelo", label: "Análisis de suelo", required: true },
    { id: "solicitud", label: "Solicitud de crédito firmada", required: true },
    { id: "garantia", label: "Garantía (aval, prenda o hipoteca)", required: true },
    { id: "sat", label: "Opinión de cumplimiento SAT", required: false },
    { id: "fira", label: "Alta / expediente FIRA", required: false },
  ],
  cobertura_fira: [
    { id: "ine", label: "INE vigente", required: true },
    { id: "curp", label: "CURP", required: true },
    { id: "rfc", label: "Constancia de situación fiscal (RFC)", required: true },
    { id: "predio", label: "Título o contrato de arrendamiento", required: true },
    { id: "superficie", label: "Superficie a cubrir", required: true },
    { id: "analisis_suelo", label: "Análisis de suelo", required: true },
    { id: "contrato_cobertura", label: "Contrato de cobertura FIRA", required: true },
  ],
  acopio: [
    { id: "ine", label: "INE vigente", required: true },
    { id: "telefono", label: "Teléfono confirmado", required: true },
    { id: "predio", label: "Ubicación de la parcela", required: true },
  ],
};

export const VISIT_PURPOSES = [
  "Primera visita",
  "Convencer / cerrar trato",
  "Recoger papelería",
  "Recoger análisis de suelo",
  "Revisar garantía",
  "Entrega de insumos",
  "Cuadrar volumen",
  "Acopio de grano",
  "Seguimiento",
] as const;

export const VISIT_STATUS = [
  { id: "programada", label: "Programada" },
  { id: "cumplida", label: "Cumplida" },
  { id: "cancelada", label: "Cancelada" },
  { id: "no_asistio", label: "No asistió" },
] as const;

export type VisitStatus = (typeof VISIT_STATUS)[number]["id"];

export const CHANNELS = [
  { id: "llamada", label: "Llamada" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "mensaje", label: "Mensaje" },
  { id: "correo", label: "Correo" },
  { id: "visita", label: "Visita" },
  { id: "nota", label: "Nota" },
] as const;

export type ChannelId = (typeof CHANNELS)[number]["id"];

export const OUTCOMES = [
  { id: "contesto", label: "Contestó" },
  { id: "no_contesto", label: "No contestó" },
  { id: "prometio", label: "Quedó de avanzar" },
  { id: "agendo", label: "Agendamos cita" },
  { id: "no_interesa", label: "No le interesa" },
  { id: "otro", label: "Otro" },
] as const;

export type OutcomeId = (typeof OUTCOMES)[number]["id"];

export function channelLabel(id: string): string {
  return CHANNELS.find((c) => c.id === id)?.label ?? id;
}

export function outcomeLabel(id: string | null | undefined): string {
  if (!id) return "";
  return OUTCOMES.find((o) => o.id === id)?.label ?? id;
}

export function cropLabel(id: string): string {
  return CROPS.find((c) => c.id === id)?.label ?? id;
}

export function cropDefaultYield(id: string): number {
  return CROPS.find((c) => c.id === id)?.defaultYield ?? 10;
}

export function cropDefaultPerHa(id: string): number {
  return CROPS.find((c) => c.id === id)?.defaultPerHa ?? 25000;
}

export function stageMeta(id: string) {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

export function unitLabel(id: string): string {
  return UNITS.find((u) => u.id === id)?.label ?? id;
}

export function schemeLabel(id: string): string {
  return SCHEMES.find((s) => s.id === id)?.label ?? id;
}

export function docsForScheme(scheme: string) {
  return DOC_CATALOG[(scheme as SchemeId) || "financiamiento"] ?? DOC_CATALOG.financiamiento;
}

export function docLabel(scheme: string, docType: string): string {
  return docsForScheme(scheme).find((d) => d.id === docType)?.label ?? docType;
}

export function allDocTypes(): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const docs of Object.values(DOC_CATALOG)) {
    for (const d of docs) {
      if (!map.has(d.id)) map.set(d.id, d.label);
    }
  }
  return [...map.entries()].map(([id, label]) => ({ id, label }));
}

export const REJECTION_REASONS = [
  { id: "credito", label: "No pasó el crédito" },
  { id: "garantia", label: "No alcanzó la garantía" },
  { id: "se_fue", label: "Se fue con otro" },
  { id: "superficie", label: "Superficie / dictamen" },
  { id: "otro", label: "Otro" },
] as const;

export type RejectionReasonId = (typeof REJECTION_REASONS)[number]["id"];
export type RejectionKind = "total" | "parcial";

export function rejectionReasonLabel(id: string | null | undefined): string {
  if (!id) return "";
  return REJECTION_REASONS.find((r) => r.id === id)?.label ?? id;
}

export function parseRejectionReason(raw: unknown): RejectionReasonId | null {
  const v = String(raw ?? "");
  if (v === "credito" || v === "garantia" || v === "se_fue" || v === "superficie" || v === "otro") return v;
  return null;
}

export function parseRejectionKind(raw: unknown): RejectionKind | null {
  const v = String(raw ?? "");
  if (v === "total" || v === "parcial") return v;
  return null;
}
