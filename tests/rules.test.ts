import { DEFAULT_RULES } from "../src/shared/defaultRules";
import {
  compileRules,
  createDefaultSettings,
  findRuleMatches,
  findMatchingRules,
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

  it("does not let regex rules cross preserved paragraph breaks", () => {
    const compiled = compileRules([
      {
        id: "regex-rule",
        pattern:
          "it'?s?\\s+not\\s+([^.!?\\n]{1,60})\\s*[,.!?:;-]?\\s+[Ii]t'?s?\\s+([^.!?\\n]{1,60})",
        enabled: true,
        source: "user",
        matchType: "regex",
      },
    ]);

    expect(
      matchesAnyRule(
        "what makes it not getting traction amongst ppls\n\ntry it out :- turbochat.live",
        compiled,
      ),
    ).toBe(false);
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

describe("findMatchingRules", () => {
  it("returns all rules that match", () => {
    const compiled = compileRules(DEFAULT_RULES);
    const result = findMatchingRules("This changes everything — seriously.", compiled);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.pattern)).toContain("changes everything");
    expect(result.map((r) => r.pattern)).toContain("\u2014");
  });

  it("returns empty array when nothing matches", () => {
    const compiled = compileRules(DEFAULT_RULES);
    const result = findMatchingRules("Hello world.", compiled);
    expect(result).toHaveLength(0);
  });

  it("returns only the rules that match", () => {
    const compiled = compileRules(DEFAULT_RULES);
    const result = findMatchingRules("This changes everything for founders.", compiled);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe("changes everything");
  });

  it("keeps literal rules whitespace-tolerant across line breaks", () => {
    const compiled = compileRules(DEFAULT_RULES);
    const result = findMatchingRules("This changes\n\neverything for founders.", compiled);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe("changes everything");
  });
});

describe("findRuleMatches", () => {
  it("returns exact literal match ranges", () => {
    const compiled = compileRules(DEFAULT_RULES);
    const result = findRuleMatches("This changes everything for founders.", compiled);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      start: 5,
      end: 23,
      text: "changes everything",
    });
    expect(result[0].rule.pattern).toBe("changes everything");
  });

  it("returns exact regex match ranges", () => {
    const compiled = compileRules([
      {
        id: "regex-rule",
        pattern: "coffee\\. It(?:'|’)s a lifestyle",
        enabled: true,
        source: "user",
        matchType: "regex",
      },
    ]);
    const text = "It's not coffee. It's a lifestyle.";
    const result = findRuleMatches(text, compiled);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      start: 9,
      end: 33,
      text: "coffee. It's a lifestyle",
    });
  });

  it("returns multiple matches from different rules", () => {
    const compiled = compileRules(DEFAULT_RULES);
    const result = findRuleMatches("This changes everything — seriously.", compiled);

    expect(result).toHaveLength(2);
    expect(result.map((match) => match.rule.pattern)).toEqual(
      expect.arrayContaining(["changes everything", "\u2014"]),
    );
  });

  it("maps literal whitespace-tolerant matches back to the original text", () => {
    const compiled = compileRules(DEFAULT_RULES);
    const text = "This changes\n\neverything for founders.";
    const result = findRuleMatches(text, compiled);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      start: 5,
      end: 24,
      text: "changes\n\neverything",
    });
  });

  it("does not return regex matches across preserved paragraph gaps", () => {
    const compiled = compileRules([
      {
        id: "regex-rule",
        pattern:
          "it'?s?\\s+not\\s+([^.!?\\n]{1,60})\\s*[,.!?:;-]?\\s+[Ii]t'?s?\\s+([^.!?\\n]{1,60})",
        enabled: true,
        source: "user",
        matchType: "regex",
      },
    ]);

    expect(
      findRuleMatches(
        "what makes it not getting traction amongst ppls\n\ntry it out :- turbochat.live",
        compiled,
      ),
    ).toHaveLength(0);
  });
});

describe("parseRulesText", () => {
  it("parses literal rules from phrases textarea", () => {
    const rules = parseRulesText("changes everything\ngame changer", "literal");

    expect(rules).toHaveLength(2);
    expect(rules[0].pattern).toBe("changes everything");
    expect(rules[0].matchType).toBe("literal");
    expect(rules[1].pattern).toBe("game changer");
    expect(rules[1].matchType).toBe("literal");
  });

  it("parses regex rules from regex textarea", () => {
    const rules = parseRulesText("(w|W)hy\n\\btest\\b", "regex");

    expect(rules).toHaveLength(2);
    expect(rules[0].pattern).toBe("(w|W)hy");
    expect(rules[0].matchType).toBe("regex");
    expect(rules[1].pattern).toBe("\\btest\\b");
    expect(rules[1].matchType).toBe("regex");
  });

  it("filters blank lines", () => {
    const rules = parseRulesText("hello\n\n\nworld\n", "literal");
    expect(rules).toHaveLength(2);
  });

  it("trims whitespace from lines", () => {
    const rules = parseRulesText("  hello  \n  world  ", "literal");
    expect(rules[0].pattern).toBe("hello");
    expect(rules[1].pattern).toBe("world");
  });

  it("returns empty array for empty input", () => {
    expect(parseRulesText("", "literal")).toHaveLength(0);
    expect(parseRulesText("   \n  \n  ", "regex")).toHaveLength(0);
  });

  it("sets all rules as user source and enabled", () => {
    const rules = parseRulesText("test rule", "literal");
    expect(rules[0].source).toBe("user");
    expect(rules[0].enabled).toBe(true);
  });
});

describe("rulesToText", () => {
  const mixed = [
    { id: "1", pattern: "hello", enabled: true, source: "user" as const, matchType: "literal" as const },
    { id: "2", pattern: "\\bworld\\b", enabled: true, source: "user" as const, matchType: "regex" as const },
  ];

  it("joins all rule patterns when no matchType filter given", () => {
    expect(rulesToText(mixed)).toBe("hello\n\\bworld\\b");
  });

  it("filters to literal rules only", () => {
    expect(rulesToText(mixed, "literal")).toBe("hello");
  });

  it("filters to regex rules only", () => {
    expect(rulesToText(mixed, "regex")).toBe("\\bworld\\b");
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
