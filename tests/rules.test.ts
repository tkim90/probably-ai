import { DEFAULT_RULES } from "../src/shared/defaultRules";
import {
  compileRules,
  createDefaultSettings,
  matchesAnyRule,
  normalizeSettings,
  validateRulePattern,
} from "../src/shared/rules";

describe("rule compilation", () => {
  it("compiles the seeded default rules", () => {
    const compiled = compileRules(DEFAULT_RULES);
    expect(compiled).toHaveLength(DEFAULT_RULES.length);
  });

  it("rejects invalid regex patterns", () => {
    expect(validateRulePattern("[unterminated", "regex")).toMatch(/invalid|unterminated/i);
  });

  it("skips invalid stored rules while compiling", () => {
    const compiled = compileRules([
      ...DEFAULT_RULES,
      {
        id: "broken",
        pattern: "[unterminated",
        enabled: true,
        source: "user",
        matchType: "regex",
      },
    ]);

    expect(compiled).toHaveLength(DEFAULT_RULES.length);
  });
});

describe("rule matching", () => {
  it("matches case-insensitively", () => {
    const compiled = compileRules(DEFAULT_RULES);
    expect(matchesAnyRule("This CHANGES everything for founders.", compiled)).toBe(true);
  });

  it("matches the comparative default pattern", () => {
    const compiled = compileRules(DEFAULT_RULES);
    expect(matchesAnyRule("It's not coffee. It's a lifestyle.", compiled)).toBe(true);
  });

  it("supports raw regex rules when explicitly requested", () => {
    const compiled = compileRules([
      {
        id: "regex-rule",
        pattern: "it[’']s\\s+not\\s+[^.!?\\n]{1,120}[.!?]\\s*it[’']s\\s+[^.!?\\n]{1,120}",
        enabled: true,
        source: "user",
        matchType: "regex",
      },
    ]);

    expect(matchesAnyRule("It's not coffee. It's a lifestyle.", compiled)).toBe(true);
  });
});

describe("settings normalization", () => {
  it("falls back to defaults when storage is empty", () => {
    expect(normalizeSettings(undefined)).toEqual(createDefaultSettings());
  });

  it("adds autoHideDetected=false for older stored settings", () => {
    expect(
      normalizeSettings({
        enabled: true,
        rules: DEFAULT_RULES,
      }),
    ).toEqual({
      enabled: true,
      autoHideDetected: false,
      rules: DEFAULT_RULES,
    });
  });
});
