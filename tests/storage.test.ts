import { cloneDefaultRules } from "../src/shared/defaultRules";
import { buildResetSettings } from "../src/shared/storage";

describe("buildResetSettings", () => {
  it("replaces all current rules with shipped defaults while preserving top-level toggles", () => {
    const reset = buildResetSettings({
      enabled: false,
      autoHideDetected: true,
      rules: [
        {
          id: "custom-rule",
          pattern: "ship fast",
          enabled: true,
          source: "user",
          matchType: "literal",
        },
      ],
    });

    expect(reset).toEqual({
      enabled: false,
      autoHideDetected: true,
      rules: cloneDefaultRules(),
    });
  });
});
