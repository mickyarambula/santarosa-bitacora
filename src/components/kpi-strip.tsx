import { compactMoney, qty } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function KpiStrip({
  producers,
  hectares,
  volume,
  financing,
}: {
  producers: number;
  hectares: number;
  volume: number;
  financing: number;
}) {
  const items = [
    { label: "Productores", value: qty(producers, 0) },
    { label: "Hectáreas", value: qty(hectares, 0) },
    { label: "Toneladas", value: qty(volume, 0) },
    { label: "Financiamiento", value: compactMoney(financing) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-subtle">{item.label}</p>
          <p className="mt-1 font-display text-2xl font-medium tabular tracking-tight">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}
