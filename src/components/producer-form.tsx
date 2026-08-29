import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChoiceCards } from "@/components/choice-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  CROPS,
  GROUP_ROLES,
  RELATIONS,
  SCHEMES,
  STAGES,
  UNITS,
  ZONES,
  cropDefaultYield,
  type BusinessUnit,
  type CropId,
  type GroupRoleId,
  type RelationId,
  type SchemeId,
  type StageId,
} from "@/lib/catalog";
import { listGroups } from "@/lib/crm";
import type { Producer, ProducerInput } from "@/lib/types";
import { loanOf, money, num, qty, suggestedPerHa, volumeOf } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

const empty: ProducerInput = {
  name: "",
  businessUnit: "parafinanciero",
  scheme: "financiamiento",
  relation: "nuevo",
  isNew: true,
  zone: "Guasave",
  locality: "",
  crop: "maiz_blanco",
  hectares: 0,
  yieldTonHa: 12,
  financingMxn: 0,
  financingPerHa: 35000,
  phone: "",
  email: "",
  stage: "prospecto",
  blocker: "",
  notes: "",
  groupId: null,
  newGroupName: "",
  groupRole: "familiar",
};

function fromProducer(p: Producer): ProducerInput {
  return {
    name: p.name,
    comisionistaName: p.comisionistaName,
    businessUnit: p.businessUnit,
    scheme: p.scheme,
    relation: p.relation ?? (p.isNew ? "nuevo" : "recurrente"),
    isNew: p.isNew,
    zone: p.zone,
    locality: p.locality ?? "",
    crop: p.crop,
    hectares: p.hectares,
    yieldTonHa: p.yieldTonHa,
    financingMxn: p.financingMxn,
    financingPerHa: p.financingPerHa || (p.hectares ? Math.round(p.financingMxn / p.hectares) : suggestedPerHa(p.crop)),
    phone: p.phone ?? "",
    email: p.email ?? "",
    stage: p.stage,
    blocker: p.blocker ?? "",
    notes: p.notes ?? "",
    groupId: p.groupId,
    newGroupName: "",
    groupRole: p.groupRole ?? "familiar",
  };
}

export function ProducerForm({
  initial,
  defaultAgent,
  submitLabel,
  onSubmit,
  pending,
}: {
  initial?: Producer;
  defaultAgent?: string;
  submitLabel: string;
  onSubmit: (data: ProducerInput) => void | Promise<void>;
  pending?: boolean;
}) {
  const [form, setForm] = useState<ProducerInput>(() =>
    initial
      ? fromProducer(initial)
      : { ...empty, comisionistaName: defaultAgent, yieldTonHa: 12, financingPerHa: 35000 },
  );
  const [inGroup, setInGroup] = useState(Boolean(initial?.groupId));
  const [groupPick, setGroupPick] = useState(initial?.groupId || "new");
  const { agent } = useViewAs();
  const groupsQ = useQuery({
    queryKey: ["groups", agent],
    queryFn: () => listGroups({ data: { agent: agent || undefined } }),
  });
  const [rateTouched, setRateTouched] = useState(Boolean(initial && (initial.financingPerHa || initial.financingMxn)));

  const volume = useMemo(
    () => volumeOf(num(form.hectares), num(form.yieldTonHa)),
    [form.hectares, form.yieldTonHa],
  );
  const suggestedRate = useMemo(() => suggestedPerHa(form.crop), [form.crop]);
  const perHa =
    form.scheme === "financiamiento"
      ? rateTouched
        ? num(form.financingPerHa)
        : suggestedRate
      : 0;
  const financing = form.scheme === "financiamiento" ? loanOf(num(form.hectares), perHa) : 0;

  function patch<K extends keyof ProducerInput>(key: K, value: ProducerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <form
      className="flex flex-col gap-4 pb-36 md:pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...form,
          hectares: num(form.hectares),
          yieldTonHa: num(form.yieldTonHa),
          financingMxn: financing,
          financingPerHa: perHa,
          locality: form.locality || null,
          phone: form.phone || null,
          email: form.email || null,
          blocker: form.blocker || null,
          notes: form.notes || null,
          groupId: inGroup && groupPick !== "new" ? groupPick : null,
          newGroupName:
            inGroup && groupPick === "new"
              ? (form.newGroupName || "").trim() || suggestedGroupName(form.name)
              : null,
          groupRole: inGroup ? form.groupRole ?? "familiar" : null,
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>1. ¿Quién es?</CardTitle>
          <CardDescription>Nombre, teléfono y dónde siembra. Con eso ya queda captado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Productor / razón social">
            <Input
              required
              value={form.name}
              onChange={(e) => patch("name", e.target.value)}
              placeholder="Ej. Agrícola El Roble o Don Ramón Payán"
              autoComplete="name"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono">
              <Input
                inputMode="tel"
                value={form.phone ?? ""}
                onChange={(e) => patch("phone", e.target.value)}
                placeholder="687 123 4567"
              />
            </Field>
            <Field label="Correo (opcional)">
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => patch("email", e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </Field>
            <Field label="Municipio">
              <NativeSelect
                value={form.zone}
                onChange={(e) => patch("zone", e.target.value)}
              >
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Localidad / ejido (opcional)">
            <Input
              value={form.locality ?? ""}
              onChange={(e) => patch("locality", e.target.value)}
              placeholder="Bamoa, El Carrizo, 27 de Septiembre…"
            />
          </Field>
          <div>
            <Label className="mb-2 block">¿Cómo es el trato?</Label>
            <div className="grid grid-cols-3 gap-2">
              {RELATIONS.map((r) => (
                <Toggle
                  key={r.id}
                  active={form.relation === r.id}
                  onClick={() => {
                    patch("relation", r.id as RelationId);
                    patch("isNew", r.id === "nuevo");
                  }}
                  label={r.label}
                />
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {RELATIONS.find((r) => r.id === form.relation)?.hint}
            </p>
          </div>
          <div>
            <Label className="mb-2 block">¿Va con otros nombres?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Toggle active={!inGroup} onClick={() => setInGroup(false)} label="No, va solo" />
              <Toggle active={inGroup} onClick={() => setInGroup(true)} label="Sí, es un grupo" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Familiares o amigos que prestan el nombre para crédito o apoyo. Cada uno lleva su
              papelería.
            </p>
          </div>
          {inGroup ? (
            <div className="grid gap-3 rounded-lg border border-border p-3">
              <Field label="Grupo">
                <NativeSelect value={groupPick} onChange={(e) => setGroupPick(e.target.value)}>
                  <option value="new">Nuevo grupo</option>
                  {(groupsQ.data?.groups ?? [])
                    .filter((g) => g.id !== "new")
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                        {g.titularName ? ` · ${g.titularName}` : ""} ({g.members})
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              {groupPick === "new" ? (
                <Field label="Nombre del grupo">
                  <Input
                    value={form.newGroupName ?? ""}
                    onChange={(e) => patch("newGroupName", e.target.value)}
                    placeholder={suggestedGroupName(form.name) || "Grupo Ramírez"}
                  />
                </Field>
              ) : null}
              <div>
                <Label className="mb-2 block">Este nombre es</Label>
                <div className="grid grid-cols-2 gap-2">
                  {GROUP_ROLES.map((r) => (
                    <Toggle
                      key={r.id}
                      active={form.groupRole === r.id}
                      onClick={() => patch("groupRole", r.id as GroupRoleId)}
                      label={r.label}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {GROUP_ROLES.find((r) => r.id === form.groupRole)?.hint}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. ¿Qué siembra?</CardTitle>
          <CardDescription>El volumen se calcula solo: hectáreas × rendimiento.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <Label className="mb-2 block">Cultivo</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CROPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    patch("crop", c.id as CropId);
                    patch("yieldTonHa", c.defaultYield);
                    if (!rateTouched) patch("financingPerHa", c.defaultPerHa);
                  }}
                  className={
                    form.crop === c.id
                      ? "rounded-lg border border-primary bg-primary/8 px-3 py-3 text-left font-medium"
                      : "rounded-lg border border-border bg-surface px-3 py-3 text-left hover:bg-secondary"
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hectáreas">
              <Input
                inputMode="decimal"
                value={form.hectares || ""}
                onChange={(e) => {
                  const ha = num(e.target.value);
                  patch("hectares", ha);
                }}
                placeholder="0"
              />
            </Field>
            <Field label={`Rendimiento (${cropDefaultYield(form.crop)} ton/ha típico)`}>
              <Input
                inputMode="decimal"
                value={form.yieldTonHa || ""}
                onChange={(e) => patch("yieldTonHa", num(e.target.value))}
              />
            </Field>
          </div>
          <div className="rounded-lg bg-primary/8 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Volumen estimado</p>
            <p className="font-display text-3xl font-medium tabular tracking-tight">
              {qty(volume, 1)} <span className="text-lg text-muted">ton</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. ¿Cómo lo habilitamos?</CardTitle>
          <CardDescription>
            Si no necesita dinero pero quiere cobertura FIRA, elige Directo + Cobertura y deja el
            financiamiento en 0.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div>
            <Label className="mb-2 block">Unidad de negocio</Label>
            <ChoiceCards
              value={form.businessUnit}
              onChange={(v) => patch("businessUnit", v as BusinessUnit)}
              options={UNITS.map((u) => ({ id: u.id, label: u.label, hint: u.hint }))}
            />
          </div>
          <div>
            <Label className="mb-2 block">Esquema / servicio</Label>
            <ChoiceCards
              value={form.scheme}
              onChange={(v) => {
                patch("scheme", v as SchemeId);
                if (v !== "financiamiento") {
                  patch("financingPerHa", 0);
                } else if (!rateTouched) {
                  patch("financingPerHa", suggestedPerHa(form.crop));
                }
              }}
              options={SCHEMES.map((s) => ({ id: s.id, label: s.label, hint: s.hint }))}
            />
          </div>
          {form.scheme === "financiamiento" ? (
            <div className="grid gap-3">
              <Field label={`Monto por hectárea · típico ${money(suggestedRate)}`}>
                <Input
                  inputMode="numeric"
                  value={perHa || ""}
                  onChange={(e) => {
                    setRateTouched(true);
                    patch("financingPerHa", num(e.target.value));
                  }}
                />
              </Field>
              <div className="rounded-lg bg-primary/8 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-primary">
                  Préstamo estimado · {qty(num(form.hectares), 1)} ha × {money(perHa)}
                </p>
                <p className="font-display text-3xl font-medium tabular tracking-tight">{money(financing)}</p>
              </div>
            </div>
          ) : (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted">
              Este esquema no lleva habilitación. El financiamiento queda en $0.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. ¿En qué va y qué falta?</CardTitle>
          <CardDescription>La papelería siempre se atora. Anota qué le falta desde ahora.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Etapa">
            <NativeSelect
              value={form.stage}
              onChange={(e) => patch("stage", e.target.value as StageId)}
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="¿Qué falta para habilitarlo / entrar?">
            <Input
              value={form.blocker ?? ""}
              onChange={(e) => patch("blocker", e.target.value)}
              placeholder="Falta validar garantía, reunir INE…"
            />
          </Field>
          <Field label="Notas / próximo paso">
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => patch("notes", e.target.value)}
              placeholder="Visitarlo el jueves, recoger papeles en oficina…"
            />
          </Field>
          {initial ? null : defaultAgent ? (
            <Field label="Comisionista">
              <Input
                value={form.comisionistaName ?? defaultAgent}
                onChange={(e) => patch("comisionistaName", e.target.value)}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-bg p-3 md:sticky md:bottom-0 md:inset-x-auto md:z-10 md:rounded-xl md:border md:bg-surface">
        <Button type="submit" size="xl" className="w-full" disabled={pending || !form.name.trim()}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function suggestedGroupName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? `Grupo ${last}` : "";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "h-12 rounded-lg border border-primary bg-primary px-1 text-xs font-medium text-primary-foreground sm:text-sm"
          : "h-12 rounded-lg border border-border bg-surface px-1 text-xs font-medium hover:bg-secondary sm:text-sm"
      }
    >
      {label}
    </button>
  );
}

