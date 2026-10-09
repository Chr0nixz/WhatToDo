import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { TaskViewFilters } from "@/data/types";
import { FilterSelect } from "./FilterSelect";

export interface TagFilterPanelProps {
  availableTags: string[];
  filters: TaskViewFilters;
  onChange: (next: Pick<TaskViewFilters, "tags" | "tagMatch">) => void;
}

export function TagFilterPanel({
  availableTags,
  filters,
  onChange,
}: TagFilterPanelProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || filters.tags.includes(tag)) {
      setDraft("");
      return;
    }
    onChange({ tags: [...filters.tags, tag], tagMatch: filters.tagMatch });
    setDraft("");
  };

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card/60 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label={t("tagMatch")}
          value={filters.tagMatch}
          onChange={(value) => onChange({ tags: filters.tags, tagMatch: value as TaskViewFilters["tagMatch"] })}
        >
          <option value="any">{t("tagMatchAny")}</option>
          <option value="all">{t("tagMatchAll")}</option>
          <option value="none">{t("tagMatchNone")}</option>
        </FilterSelect>
        <label className="grid min-w-[12rem] flex-1 gap-1 text-xs text-muted-foreground">
          <span>{t("tags")}</span>
          <input
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
            list="overview-tag-suggestions"
            placeholder={t("tagFilterPlaceholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag(draft);
              }
            }}
          />
          <datalist id="overview-tag-suggestions">
            {availableTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </label>
        <Button className="mt-4" size="sm" type="button" variant="secondary" onClick={() => addTag(draft)}>
          {t("addTagFilter")}
        </Button>
      </div>
      {filters.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.tags.map((tag) => (
            <button
              key={tag}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              type="button"
              onClick={() =>
                onChange({
                  tags: filters.tags.filter((item) => item !== tag),
                  tagMatch: filters.tagMatch,
                })
              }
            >
              {tag}
              <X aria-hidden="true" className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
