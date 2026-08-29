import { stageMeta, type StageId } from "@/lib/catalog";
import { Badge } from "@/components/ui/badge";

const toneMap: Record<string, "stone" | "olive" | "clay" | "ink" | "sage" | "rose"> = {
  stone: "stone",
  olive: "olive",
  clay: "clay",
  ink: "ink",
  sage: "sage",
  rose: "rose",
};

export function StageChip({ stage, short }: { stage: string; short?: boolean }) {
  const meta = stageMeta(stage as StageId);
  return <Badge tone={toneMap[meta.tone] ?? "stone"}>{short ? meta.short : meta.label}</Badge>;
}
