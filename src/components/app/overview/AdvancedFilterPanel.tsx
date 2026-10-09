import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { FilterCondition, FilterConditionField, FilterConditionOperator, FilterGroup, TaskViewFilters } from "@/data/types";

export interface AdvancedFilterPanelProps {
  filters: TaskViewFilters;
  onChange: (advancedFilter: FilterGroup | null) => void;
}

const ADVANCED_FIELDS: FilterConditionField[] = [
  "priority",
  "status",
  "projectId",
  "tags",
  "hasReminder",
  "hasFolder",
  "dueDate",
  "parentId",
];

const operatorsForField = (field: FilterConditionField): FilterConditionOperator[] => {
  switch (field) {
    case "priority":
    case "status":
      return ["eq", "neq"];
    case "projectId":
    case "parentId":
      return ["eq", "isEmpty", "isNotEmpty"];
    case "tags":
      return ["contains", "notContains", "isEmpty", "isNotEmpty"];
    case "hasReminder":
    case "hasFolder":
      return ["eq"];
    case "dueDate":
      return ["eq", "neq", "before", "after"];
    default:
      return ["eq"];
  }
};

export function AdvancedFilterPanel({
  filters,
  onChange,
}: AdvancedFilterPanelProps) {
  const { t } = useTranslation();
  const group = filters.advancedFilter;
  const conditions = group?.conditions ?? [];

  const updateConditions = (next: FilterCondition[]) => {
    if (next.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      operator: "AND",
      negate: false,
      conditions: next,
      groups: group?.groups ?? [],
    });
  };

  const fieldLabel = (field: FilterConditionField) => {
    switch (field) {
      case "priority":
        return t("filterFieldPriority");
      case "status":
        return t("filterFieldStatus");
      case "projectId":
        return t("filterFieldProject");
      case "tags":
        return t("filterFieldTags");
      case "hasReminder":
        return t("filterFieldHasReminder");
      case "hasFolder":
        return t("filterFieldHasFolder");
      case "dueDate":
        return t("filterFieldDueDate");
      case "parentId":
        return t("filterFieldParent");
      default:
        return field;
    }
  };

  const opLabel = (op: FilterConditionOperator) => {
    switch (op) {
      case "eq":
        return t("filterOpEq");
      case "neq":
        return t("filterOpNeq");
      case "contains":
        return t("filterOpContains");
      case "notContains":
        return t("filterOpNotContains");
      case "before":
        return t("filterOpBefore");
      case "after":
        return t("filterOpAfter");
      case "isEmpty":
        return t("filterOpIsEmpty");
      case "isNotEmpty":
        return t("filterOpIsNotEmpty");
      default:
        return op;
    }
  };

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("advancedFilters")}</span>
        <Button
          size="xs"
          type="button"
          variant="ghost"
          onClick={() =>
            updateConditions([
              ...conditions,
              { field: "priority", op: "eq", value: "high" },
            ])
          }
        >
          {t("addAdvancedCondition")}
        </Button>
      </div>
      {conditions.map((condition, index) => {
        const ops = operatorsForField(condition.field);
        const needsValue = condition.op !== "isEmpty" && condition.op !== "isNotEmpty";
        return (
          <div key={`${condition.field}-${index}`} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 max-md:grid-cols-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>{t("filterField")}</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                value={condition.field}
                onChange={(event) => {
                  const field = event.target.value as FilterConditionField;
                  const nextOps = operatorsForField(field);
                  const next = [...conditions];
                  next[index] = {
                    field,
                    op: nextOps[0] ?? "eq",
                    value: field === "hasReminder" || field === "hasFolder" ? "true" : "",
                  };
                  updateConditions(next);
                }}
              >
                {ADVANCED_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {fieldLabel(field)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>{t("filterOperator")}</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                value={condition.op}
                onChange={(event) => {
                  const next = [...conditions];
                  next[index] = { ...condition, op: event.target.value as FilterConditionOperator };
                  updateConditions(next);
                }}
              >
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {opLabel(op)}
                  </option>
                ))}
              </select>
            </label>
            {needsValue ? (
              condition.field === "hasReminder" || condition.field === "hasFolder" ? (
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>{t("filterValue")}</span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                    value={String(condition.value ?? "true")}
                    onChange={(event) => {
                      const next = [...conditions];
                      next[index] = { ...condition, value: event.target.value };
                      updateConditions(next);
                    }}
                  >
                    <option value="true">{t("yes")}</option>
                    <option value="false">{t("no")}</option>
                  </select>
                </label>
              ) : (
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>{t("filterValue")}</span>
                  <input
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none"
                    value={String(condition.value ?? "")}
                    onChange={(event) => {
                      const next = [...conditions];
                      next[index] = { ...condition, value: event.target.value };
                      updateConditions(next);
                    }}
                  />
                </label>
              )
            ) : (
              <div />
            )}
            <Button
              aria-label={t("removeCondition")}
              size="icon-sm"
              type="button"
              variant="ghost"
              title={t("removeCondition")}
              onClick={() => updateConditions(conditions.filter((_, i) => i !== index))}
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
