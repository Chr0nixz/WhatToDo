import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export interface RecoveryGroupProps {
  emptyLabel: string;
  items: { id: string; title: string; meta: string }[];
  title: string;
  onRestore: (id: string) => Promise<unknown>;
}

export function RecoveryGroup({
  emptyLabel,
  items,
  title,
  onRestore,
}: RecoveryGroupProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md bg-background/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-card/65 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.meta}</p>
              </div>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => void onRestore(item.id)}
              >
                {t("restore")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
