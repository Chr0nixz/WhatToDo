import type { ReactNode } from "react";

export interface FilterSelectProps {
  children: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function FilterSelect({
  children,
  label,
  value,
  onChange,
}: FilterSelectProps) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
