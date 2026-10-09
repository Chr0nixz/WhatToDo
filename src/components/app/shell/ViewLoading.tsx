import { Loader2 } from "lucide-react";

export interface ViewLoadingProps {
  label: string;
}

export function ViewLoading({ label }: ViewLoadingProps) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        {label}
      </div>
    </div>
  );
}
