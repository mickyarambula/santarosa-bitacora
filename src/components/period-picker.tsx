import { useState } from "react";
import { appDateKey } from "@/lib/datetime";
import { periodRange, type PeriodSelection } from "@/lib/period";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";

export function PeriodPicker({
  value,
  onChange,
  allLabel = "Todo el ciclo",
  label = "Periodo",
}: {
  value: PeriodSelection;
  onChange: (value: PeriodSelection) => void;
  allLabel?: string;
  label?: string;
}) {
  const today = appDateKey(new Date());
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(value.from ?? today);
  const [until, setUntil] = useState(value.until ?? today);
  const [error, setError] = useState("");
  const editing = custom || value.period === "personalizado";
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-40 flex-1 gap-1 text-sm">
        {label}
        <NativeSelect
          aria-label={label}
          value={editing ? "personalizado" : (value.period ?? "semana")}
          onChange={(e) => {
            const period = e.target.value as PeriodSelection["period"];
            setError("");
            setCustom(period === "personalizado");
            if (period !== "personalizado") onChange({ period, from: undefined, until: undefined });
          }}
        >
          <option value="hoy">Hoy</option>
          <option value="semana">Esta semana</option>
          <option value="anterior">Semana anterior</option>
          <option value="mes">Este mes</option>
          <option value="personalizado">Elegir fechas</option>
          <option value="todo">{allLabel}</option>
        </NativeSelect>
      </label>
      {editing ? (
        <>
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            Desde
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid min-w-0 flex-1 gap-1 text-sm">
            Hasta
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const next = { period: "personalizado" as const, from, until };
              try {
                periodRange(next);
                setError("");
                setCustom(false);
                onChange(next);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Aplicar fechas
          </Button>
        </>
      ) : null}
      {error ? (
        <p className="w-full text-sm text-clay" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
