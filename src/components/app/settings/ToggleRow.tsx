import { cn } from "@/lib/utils";

export interface ToggleRowProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

export function ToggleRow({
  checked,
  disabled = false,
  label,
  onClick,
}: ToggleRowProps) {
  return (
    <button
      aria-checked={checked}
      className="motion-surface flex items-center justify-between rounded-md bg-background/50 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
      disabled={disabled}
      role="switch"
      type="button"
      onClick={onClick}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "relative h-6 w-10 rounded-full border border-border transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
