import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { telHref, whatsappHref } from "@/lib/utils";

export function PhoneActions({
  phone,
  message,
  compact = false,
}: {
  phone: string | null | undefined;
  message?: string;
  compact?: boolean;
}) {
  const tel = telHref(phone);
  const wa = whatsappHref(phone, message);
  if (!tel && !wa) return null;
  return (
    <div className="flex items-center gap-2">
      {tel ? (
        <Button asChild variant={compact ? "ghost" : "outline"} size={compact ? "icon" : "default"}>
          <a href={tel} aria-label="Llamar">
            <Phone />
            {compact ? null : <span>Llamar</span>}
          </a>
        </Button>
      ) : null}
      {wa ? (
        <Button asChild variant={compact ? "ghost" : "secondary"} size={compact ? "icon" : "default"}>
          <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp">
            <MessageCircle />
            {compact ? null : <span>WhatsApp</span>}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
