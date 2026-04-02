import type { StoredRule } from "./types";

export const DEFAULT_RULES: StoredRule[] = [
  // ── Literal phrases ──────────────────────────────────────────
  {
    id: "default-changes-everything",
    pattern: "changes everything",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-delve-into",
    pattern: "delve into",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-streamline",
    pattern: "streamline",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-tapestry",
    pattern: "tapestry",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-revolutionize",
    pattern: "revolutionize",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-harness",
    pattern: "harness",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-underscore",
    pattern: "underscore",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-realm-of",
    pattern: "realm of",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-generally-speaking",
    pattern: "generally speaking",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-cutting-edge",
    pattern: "cutting-edge",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-to-some-extent",
    pattern: "to some extent",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-facilitate",
    pattern: "facilitate",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-transformative",
    pattern: "transformative",
    enabled: true,
    source: "default",
    matchType: "literal",
  },
  {
    id: "default-important-to-note",
    pattern: "it's important to note",
    enabled: true,
    source: "default",
    matchType: "literal",
  },

  // ── Regex patterns ───────────────────────────────────────────
  {
    id: "default-multi-em-dash",
    pattern: "\u2014[^\u2014]*\u2014",
    enabled: true,
    source: "default",
    matchType: "regex",
  },
  {
    id: "default-not-only-but-also",
    pattern: "not only\\b.{1,200}\\bbut also\\b",
    enabled: true,
    source: "default",
    matchType: "regex",
  },
  {
    id: "default-its-not-just-its",
    pattern: "it'?s?\\s+not\\s+([^.!?\\n]{1,60})\\s*[,.!?:;-]?\\s+[Ii]t'?s?\\s+([^.!?\\n]{1,60})",
    enabled: true,
    source: "default",
    matchType: "regex",
  },
];

export function cloneDefaultRules(): StoredRule[] {
  return DEFAULT_RULES.map((rule) => ({ ...rule }));
}
