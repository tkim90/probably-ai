import { cloneDefaultRules } from "./defaultRules";
import type {
  CompiledRule,
  ExtensionSettings,
  MatchType,
  RuleMatch,
  StoredRule,
} from "./types";

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
            ? new RegExp(escapeRegex(normalizeForLiteralMatching(rule.pattern)), RULE_FLAGS)
            : new RegExp(rule.pattern, RULE_FLAGS),
      },
    ];
  });
}

export function findMatchingRules(text: string, rules: CompiledRule[]): CompiledRule[] {
  const seen = new Set<string>();
  const matches: CompiledRule[] = [];

  for (const match of findRuleMatches(text, rules)) {
    if (seen.has(match.rule.id)) {
      continue;
    }

    seen.add(match.rule.id);
    matches.push(match.rule);
  }

  return matches;
}

export function findRuleMatches(text: string, rules: CompiledRule[]): RuleMatch[] {
  const literalTarget = normalizeWhitespaceWithMap(normalizeForRegexMatching(text));
  const regexTarget = normalizeForRegexMatching(text);
  const regexMap = createIdentityMap(regexTarget.length);
  const matches: RuleMatch[] = [];

  for (const rule of rules) {
    const target = rule.matchType === "literal" ? literalTarget.text : regexTarget;
    const spans = rule.matchType === "literal" ? literalTarget.map : regexMap;
    const regex = createGlobalRegex(rule.regex);

    for (const match of target.matchAll(regex)) {
      const matchedText = match[0] ?? "";
      if (matchedText.length === 0) {
        continue;
      }

      const startIndex = match.index ?? 0;
      const endIndex = startIndex + matchedText.length;
      const start = spans[startIndex]?.start;
      const end = spans[endIndex - 1]?.end;

      if (start === undefined || end === undefined || end <= start) {
        continue;
      }

      matches.push({
        rule,
        start,
        end,
        text: text.slice(start, end),
      });
    }
  }

  return matches;
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

function normalizeForLiteralMatching(value: string): string {
  return normalizeWhitespace(normalizeForRegexMatching(value));
}

function normalizeForRegexMatching(value: string): string {
  return value.replace(/[‘’]/g, "’");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function createGlobalRegex(regex: RegExp): RegExp {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function createIdentityMap(length: number): Array<{ start: number; end: number }> {
  return Array.from({ length }, (_, index) => ({
    start: index,
    end: index + 1,
  }));
}

function normalizeWhitespaceWithMap(
  value: string,
): {
  text: string;
  map: Array<{ start: number; end: number }>;
} {
  const output: string[] = [];
  const map: Array<{ start: number; end: number }> = [];
  let index = 0;

  while (index < value.length) {
    if (/\s/u.test(value[index])) {
      const start = index;
      while (index < value.length && /\s/u.test(value[index])) {
        index += 1;
      }

      if (output.length > 0 && index < value.length) {
        output.push(" ");
        map.push({ start, end: index });
      }

      continue;
    }

    output.push(value[index]);
    map.push({ start: index, end: index + 1 });
    index += 1;
  }

  return {
    text: output.join(""),
    map,
  };
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
