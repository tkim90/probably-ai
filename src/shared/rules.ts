import { cloneDefaultRules } from "./defaultRules";
import type { CompiledRule, ExtensionSettings, MatchType, StoredRule } from "./types";

const RULE_FLAGS = "iu";

export function createDefaultSettings(): ExtensionSettings {
  return {
    enabled: true,
    autoHideDetected: true,
    rules: cloneDefaultRules(),
  };
}

export function normalizeSettings(
  candidate?: Partial<ExtensionSettings>,
): ExtensionSettings {
  if (!candidate || !Array.isArray(candidate.rules) || candidate.rules.length === 0) {
    return createDefaultSettings();
  }

  const normalizedRules = candidate.rules
    .filter((rule): rule is StoredRule => {
      return (
        !!rule &&
        typeof rule.id === "string" &&
        typeof rule.pattern === "string" &&
        typeof rule.enabled === "boolean" &&
        (rule.source === "default" || rule.source === "user")
      );
    })
    .map((rule) => ({
      ...rule,
      matchType:
        rule.matchType === "literal" || rule.matchType === "regex"
          ? rule.matchType
          : rule.source === "default"
            ? "literal"
            : "regex",
    }));

  const hasLegacyDefaults = normalizedRules.some(
    (rule) =>
      rule.source === "default" &&
      !cloneDefaultRules().some((defaultRule) => defaultRule.id === rule.id),
  );

  return {
    enabled: candidate.enabled ?? true,
    autoHideDetected: candidate.autoHideDetected ?? true,
    rules:
      normalizedRules.length === 0
        ? cloneDefaultRules()
        : hasLegacyDefaults
          ? [
              ...cloneDefaultRules(),
              ...normalizedRules
                .filter((rule) => rule.source === "user")
                .map((rule) => ({ ...rule })),
            ]
          : normalizedRules,
  };
}

export function validateRulePattern(
  pattern: string,
  matchType: StoredRule["matchType"],
): string | null {
  if (matchType === "literal") {
    return pattern.trim().length > 0 ? null : "Phrase cannot be empty.";
  }

  try {
    // Compile using the same flags the extension uses at runtime.
    new RegExp(pattern, RULE_FLAGS);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid regular expression.";
  }
}

export function compileRules(rules: StoredRule[]): CompiledRule[] {
  return rules.flatMap((rule) => {
    if (!rule.enabled) {
      return [];
    }

    const error = validateRulePattern(rule.pattern, rule.matchType);
    if (error) {
      return [];
    }

    return [
      {
        ...rule,
        regex:
          rule.matchType === "literal"
            ? new RegExp(escapeRegex(normalizeForMatching(rule.pattern)), RULE_FLAGS)
            : new RegExp(rule.pattern, RULE_FLAGS),
      },
    ];
  });
}

export function findMatchingRules(text: string, rules: CompiledRule[]): CompiledRule[] {
  const normalizedText = normalizeForMatching(text);

  return rules.filter((rule) => {
    rule.regex.lastIndex = 0;
    return rule.regex.test(rule.matchType === "literal" ? normalizedText : text);
  });
}

export function matchesAnyRule(text: string, rules: CompiledRule[]): boolean {
  return findMatchingRules(text, rules).length > 0;
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function createUserRule(
  pattern: string,
  matchType: StoredRule["matchType"],
): StoredRule {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `user-${Date.now()}`,
    pattern,
    enabled: true,
    source: "user",
    matchType,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForMatching(value: string): string {
  return value.replace(/[‘’]/g, "’");
}

export function parseRulesText(text: string, matchType: MatchType): StoredRule[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => createUserRule(line, matchType));
}

export function rulesToText(rules: StoredRule[], matchType?: MatchType): string {
  const filtered = matchType ? rules.filter((rule) => rule.matchType === matchType) : rules;
  return filtered.map((rule) => rule.pattern).join("\n");
}
