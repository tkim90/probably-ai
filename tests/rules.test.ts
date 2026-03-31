import { DEFAULT_RULES } from "../src/shared/defaultRules";
import {
  compileRules,
  createDefaultSettings,
  isRegexPattern,
  matchesAnyRule,
  normalizeSettings,
  parseRulesText,
  rulesToText,
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

  it("matches em dashes by default", () => {
    const compiled = compileRules(DEFAULT_RULES);
    expect(matchesAnyRule("This sentence uses an em dash — like this.", compiled)).toBe(true);
  });

  it("does not match double dashes by default", () => {
    const compiled = compileRules(DEFAULT_RULES);
    expect(matchesAnyRule("This sentence uses a double dash -- like this.", compiled)).toBe(false);
  });
});

describe("isRegexPattern", () => {
  it("detects backslash-letter sequences as regex", () => {
    expect(isRegexPattern("\\bword\\b")).toBe(true);
    expect(isRegexPattern("\\s+hello")).toBe(true);
    expect(isRegexPattern("\\d{3}-\\d{4}")).toBe(true);
  });

  it("detects group constructs as regex", () => {
    expect(isRegexPattern("(?i)test")).toBe(true);
    expect(isRegexPattern("(?:foo|bar)")).toBe(true);
    expect(isRegexPattern("(?=lookahead)")).toBe(true);
  });

  it("treats plain phrases as literal", () => {
    expect(isRegexPattern("changes everything")).toBe(false);
    expect(isRegexPattern("game changer")).toBe(false);
    expect(isRegexPattern("—")).toBe(false);
    expect(isRegexPattern("hello world!")).toBe(false);
  });
});

describe("parseRulesText", () => {
  it("parses multiline input into rules", () => {
    const text = "changes everything\ngame changer\n(?i)\\btest\\b";
    const rules = parseRulesText(text);

    expect(rules).toHaveLength(3);
    expect(rules[0].pattern).toBe("changes everything");
    expect(rules[0].matchType).toBe("literal");
    expect(rules[1].pattern).toBe("game changer");
    expect(rules[1].matchType).toBe("literal");
    expect(rules[2].pattern).toBe("(?i)\\btest\\b");
    expect(rules[2].matchType).toBe("regex");
  });

  it("filters blank lines", () => {
    const rules = parseRulesText("hello\n\n\nworld\n");
    expect(rules).toHaveLength(2);
  });

  it("trims whitespace from lines", () => {
    const rules = parseRulesText("  hello  \n  world  ");
    expect(rules[0].pattern).toBe("hello");
    expect(rules[1].pattern).toBe("world");
  });

  it("returns empty array for empty input", () => {
    expect(parseRulesText("")).toHaveLength(0);
    expect(parseRulesText("   \n  \n  ")).toHaveLength(0);
  });

  it("sets all rules as user source and enabled", () => {
    const rules = parseRulesText("test rule");
    expect(rules[0].source).toBe("user");
    expect(rules[0].enabled).toBe(true);
  });
});

describe("rulesToText", () => {
  it("joins rule patterns with newlines", () => {
    expect(
      rulesToText([
        { id: "1", pattern: "hello", enabled: true, source: "user", matchType: "literal" },
        { id: "2", pattern: "\\bworld\\b", enabled: true, source: "user", matchType: "regex" },
      ]),
    ).toBe("hello\n\\bworld\\b");
  });

  it("returns empty string for empty rules", () => {
    expect(rulesToText([])).toBe("");
  });
});

describe("settings normalization", () => {
  it("falls back to defaults when storage is empty", () => {
    expect(normalizeSettings(undefined)).toEqual(createDefaultSettings());
  });

  it("adds autoHideDetected=true for older stored settings", () => {
    expect(
      normalizeSettings({
        enabled: true,
        rules: DEFAULT_RULES,
      }),
    ).toEqual({
      enabled: true,
      autoHideDetected: true,
      rules: DEFAULT_RULES,
    });
  });
});
