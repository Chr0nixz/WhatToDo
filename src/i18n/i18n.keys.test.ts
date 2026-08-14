import { describe, expect, it } from "vitest";

import { resources } from "@/i18n";

describe("i18n resources", () => {
  it("keeps zh and en translation keys aligned", () => {
    const zhKeys = Object.keys(resources.zh.translation).sort();
    const enKeys = Object.keys(resources.en.translation).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});
