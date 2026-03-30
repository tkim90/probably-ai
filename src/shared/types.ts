export type RuleSource = "default" | "user";
export type MatchType = "literal" | "regex";

export interface StoredRule {
  id: string;
  pattern: string;
  enabled: boolean;
  source: RuleSource;
  matchType: MatchType;
}

export interface ExtensionSettings {
  enabled: boolean;
  autoHideDetected: boolean;
  rules: StoredRule[];
}

export interface CompiledRule extends StoredRule {
  regex: RegExp;
}
