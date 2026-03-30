import type { StoredRule } from "./types";

export const DEFAULT_RULES: StoredRule[] = [
  {
    id: "default-changes-everything",
    pattern: "changes everything",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-its-not-its",
    pattern: "it's not",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-double-dash",
    pattern: "--",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-em-dash",
    pattern: "—",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
];

export function cloneDefaultRules(): StoredRule[] {
  return DEFAULT_RULES.map((rule) => ({ ...rule }));
}
