import { Check, Copy, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { groupMessage, gruposMessage } from "@/lib/guide";
import { whatsappShareHref } from "@/lib/utils";

export function ShareGuide({
  compact = false,
  kind = "full",
}: {
  compact?: boolean;
  kind?: "full" | "grupos";
}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.origin;
  const text = useMemo(() => {
    const href = url || "https://santarosa.app";
    return kind === "grupos" ? gruposMessage(href) : groupMessage(href);
  }, [url, kind]);
  const wa = whatsappShareHref(text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Listo. Pégalo en el grupo.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar. Selecciónalo a mano.");
    }
  }

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "flex flex-col gap-2 sm:flex-row"}>
      <Button type="button" variant={compact ? "outline" : "default"} onClick={() => void copy()}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copiado" : kind === "grupos" ? "Copiar aviso de grupos" : "Copiar para el grupo"}
      </Button>
      <Button asChild variant={compact ? "ghost" : "secondary"}>
        <a href={wa} target="_blank" rel="noreferrer">
          <MessageCircle className="size-4" />
          Abrir WhatsApp
        </a>
      </Button>
    </div>
  );
}
