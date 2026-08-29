import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const MARK = "/brand/isotipo.png";
const LOCKUP = {
  light: "/brand/imagotipo-negro.png",
  dark: "/brand/imagotipo-blanco.png",
} as const;
const WORD = {
  light: "/brand/logotipo-negro.png",
  dark: "/brand/logotipo-blanco.png",
} as const;

type BrandLogoProps = {
  variant?: "mark" | "lockup" | "wordmark" | "header";
  on?: "light" | "dark";
  className?: string;
  home?: boolean;
  priority?: boolean;
};

export function BrandLogo({
  variant = "lockup",
  on = "light",
  className,
  home = false,
  priority = false,
}: BrandLogoProps) {
  const inner = <Mark variant={variant} on={on} className={className} priority={priority} />;
  if (!home) return inner;
  return (
    <Link to="/" className="inline-flex min-w-0 items-center" aria-label="Santa Rosa · inicio">
      {inner}
    </Link>
  );
}

function Mark({
  variant,
  on,
  className,
  priority,
}: Required<Pick<BrandLogoProps, "variant" | "on">> & {
  className?: string;
  priority?: boolean;
}) {
  if (variant === "mark") {
    return (
      <img
        src={MARK}
        alt="Santa Rosa"
        draggable={false}
        fetchPriority={priority ? "high" : undefined}
        className={cn("h-10 w-auto select-none object-contain", className)}
      />
    );
  }
  if (variant === "wordmark") {
    return (
      <img
        src={WORD[on]}
        alt="Santa Rosa"
        draggable={false}
        className={cn("h-5 w-auto select-none object-contain", className)}
      />
    );
  }
  if (variant === "header") {
    return (
      <span className={cn("flex min-w-0 items-center gap-2", className)}>
        <img src={MARK} alt="" draggable={false} className="h-9 w-auto shrink-0 select-none object-contain" />
        <span className="flex min-w-0 flex-col justify-center">
          <img
            src={WORD[on]}
            alt="Santa Rosa"
            draggable={false}
            className="h-3.5 w-auto max-w-28 select-none object-contain object-left"
          />
        </span>
      </span>
    );
  }
  return (
    <img
      src={LOCKUP[on]}
      alt="Santa Rosa"
      draggable={false}
      fetchPriority={priority ? "high" : undefined}
      className={cn("h-auto w-44 select-none object-contain", className)}
    />
  );
}
