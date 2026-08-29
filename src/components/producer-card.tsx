import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { StageChip } from "@/components/stage-chip";
import { channelLabel, cropLabel, relationLabel, unitLabel } from "@/lib/catalog";
import type { Producer } from "@/lib/types";
import { cn, compactMoney, daysAgoLabel, qty } from "@/lib/utils";
import { useViewAs } from "@/lib/view-as";

export function ProducerCard({
  producer,
  className,
}: {
  producer: Producer;
  className?: string;
}) {
  const { agent } = useViewAs();
  return (
    <Link
      to="/productores/$id"
      params={{ id: producer.id }}
      className={cn(
        "block rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-shadow duration-150 hover:shadow-[0_0_0_1px_rgba(26,25,20,0.10),0_8px_20px_-12px_rgba(26,25,20,0.18)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{producer.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {producer.zone}
              {producer.locality ? ` · ${producer.locality}` : ""}
              {!agent ? ` · ${producer.comisionistaName}` : ""}
            </span>
          </p>
        </div>
        <StageChip stage={producer.stage} short />
      </div>
      {producer.rejectionKind ? (
        <p className="mt-2 text-xs font-medium text-rose">
          {producer.rejectionKind === "total"
            ? "Rechazo total"
            : `Recorte: ${qty(producer.hectares, 0)} de ${qty(producer.hectaresRequested || producer.hectares, 0)} ha`}
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-subtle">Cultivo</p>
          <p className="font-medium">{cropLabel(producer.crop)}</p>
        </div>
        <div>
          <p className="text-xs text-subtle">Superficie</p>
          <p className="font-medium tabular">{qty(producer.hectares, 1)} ha</p>
        </div>
        <div>
          <p className="text-xs text-subtle">Volumen</p>
          <p className="font-medium tabular">{qty(producer.volumeTon, 0)} t</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          {relationLabel(producer.relation)} · {unitLabel(producer.businessUnit)}
          {producer.groupName
            ? ` · ${producer.groupName}${producer.groupRole === "titular" ? " · real" : ""}`
            : ""}
        </span>
        {producer.financingMxn > 0 ? (
          <span className="tabular text-primary">
            {compactMoney(producer.financingMxn)}
            {producer.financingPerHa ? ` · ${compactMoney(producer.financingPerHa)}/ha` : ""}
          </span>
        ) : (
          <span>Sin financiamiento</span>
        )}
      </div>
      <p className="mt-2 text-xs text-subtle">
        {producer.lastTouchAt
          ? `${channelLabel(producer.lastTouchChannel ?? "nota")} ${daysAgoLabel(producer.lastTouchAt)}`
          : "Sin contacto registrado"}
      </p>
    </Link>
  );
}
