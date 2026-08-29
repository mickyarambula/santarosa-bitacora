import { cn } from "@/lib/utils";

export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; hint?: string }[];
}) {
  return (
    <div className="grid gap-2">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-lg border px-4 py-3 text-left transition-colors duration-150",
              active
                ? "border-primary bg-primary/8 shadow-[inset_0_0_0_1px_var(--color-primary)]"
                : "border-border bg-surface hover:bg-secondary",
            )}
          >
            <p className="font-medium">{opt.label}</p>
            {opt.hint ? <p className="mt-0.5 text-sm text-muted">{opt.hint}</p> : null}
          </button>
        );
      })}
    </div>
  );
}
