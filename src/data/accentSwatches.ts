/** Shared accent swatches for project / workspace / settings (OKLCH). */
export const accentSwatches = [
  { id: "blue", labelKey: "accentBlue", value: "oklch(0.61 0.125 210)" },
  { id: "emerald", labelKey: "accentEmerald", value: "oklch(0.56 0.13 155)" },
  { id: "amber", labelKey: "accentAmber", value: "oklch(0.66 0.13 84)" },
  { id: "rose", labelKey: "accentRose", value: "oklch(0.59 0.15 16)" },
  { id: "violet", labelKey: "accentViolet", value: "oklch(0.58 0.15 292)" },
] as const;

export const defaultAccentSwatch = accentSwatches[0].value;

/** Map older hex seeds to the shared OKLCH swatches so pickers stay selected. */
const legacyHexToOklch: Record<string, string> = {
  "#4fb8d8": accentSwatches[0].value,
  "#6cc083": accentSwatches[1].value,
  "#d7a742": accentSwatches[2].value,
  "#ec6f5d": accentSwatches[3].value,
  "#8b7cf6": accentSwatches[4].value,
};

export function normalizeAccentSwatch(value: string): string {
  return legacyHexToOklch[value.toLowerCase()] ?? value;
}
