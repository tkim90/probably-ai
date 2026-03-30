import { cloneDefaultRules } from "./defaultRules";
import { normalizeSettings } from "./rules";
import type { ExtensionSettings } from "./types";

export const STORAGE_KEY = "settings";

async function readSettings(): Promise<Partial<ExtensionSettings> | undefined> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await readSettings();
  const normalized = normalizeSettings(stored);

  const needsSeed =
    !stored ||
    typeof stored.enabled !== "boolean" ||
    typeof stored.autoHideDetected !== "boolean" ||
    !Array.isArray(stored.rules) ||
    stored.rules.length === 0 ||
    JSON.stringify(stored) !== JSON.stringify(normalized);

  if (needsSeed) {
    await saveSettings(normalized);
  }

  return normalized;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set({
    [STORAGE_KEY]: {
      enabled: settings.enabled,
      autoHideDetected: settings.autoHideDetected,
      rules: settings.rules.map((rule) => ({ ...rule })),
    },
  });
}

export function buildResetSettings(settings: ExtensionSettings): ExtensionSettings {
  return {
    enabled: settings.enabled,
    autoHideDetected: settings.autoHideDetected,
    rules: cloneDefaultRules(),
  };
}
