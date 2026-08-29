import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      tone: {
        stone: "bg-secondary text-muted",
        olive: "bg-primary/12 text-primary",
        clay: "bg-clay/12 text-clay",
        ink: "bg-ink/8 text-ink",
        sage: "bg-sage/15 text-sage",
        rose: "bg-rose/12 text-rose",
        wheat: "bg-wheat/40 text-ink",
      },
    },
    defaultVariants: { tone: "stone" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
