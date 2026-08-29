import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageBack({
  to = "/productores",
  label = "Volver",
  className,
}: {
  to?: string;
  label?: string;
  className?: string;
}) {
  const nav = useNavigate();
  const router = useRouter();

  return (
    <div className={cn("mb-3", className)}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-fg"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.history.back();
            return;
          }
          void nav({ to });
        }}
      >
        <ChevronLeft className="size-5" />
        {label}
      </button>
    </div>
  );
}

export function PageBackLink({
  to,
  label = "Volver",
  className,
}: {
  to: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-fg",
        className,
      )}
    >
      <ChevronLeft className="size-5" />
      {label}
    </Link>
  );
}
