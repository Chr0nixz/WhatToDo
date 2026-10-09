import { cn } from "@/lib/utils";

export interface SegmentedProps {
  disabled?: boolean;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function Segmented({
  disabled = false,
  options,
  value,
  onChange,
}: SegmentedProps) {
  return (
    <div className="inline-grid grid-flow-col gap-1 rounded-lg border border-border bg-background/50 p-1">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          key={option.value}
          className={cn(
            "h-8 rounded-md px-3 text-sm transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent active:scale-95 disabled:opacity-50",
            value === option.value && "bg-primary text-primary-foreground hover:bg-primary",
          )}
          disabled={disabled}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
