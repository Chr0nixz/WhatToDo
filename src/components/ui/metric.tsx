import { cn } from "@/lib/utils";

type MetricProps = {
  label: string;
  value: number | string;
  tone?: "default" | "danger";
};

export function Metric({ label, value, tone = "default" }: MetricProps) {
  return (
    <div className="motion-surface min-w-24 rounded-md border border-border bg-card/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", tone === "danger" && "text-red-500")}>{value}</p>
    </div>
  );
}
