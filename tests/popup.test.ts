import { cloneDefaultRules } from "../src/shared/defaultRules";
import type { ExtensionSettings, StoredRule } from "../src/shared/types";

const popupMarkup = `
  <main class="popup">
    <header class="popup__header">
      <h1>Probably AI</h1>
    </header>

    <section class="panel">
      <div class="toggle-stack">
        <label class="toggle-row" for="enabled-toggle">
          <span class="toggle-row__label">Detection enabled</span>
          <input id="enabled-toggle" type="checkbox" />
        </label>
        <label class="toggle-row" for="autohide-toggle">
          <span class="toggle-row__label">Auto-hide detected content</span>
          <input id="autohide-toggle" type="checkbox" />
        </label>
      </div>
    </section>

    <section class="panel">
      <div class="panel__header">
        <h2>Rules</h2>
        <div class="panel__actions">
          <button id="reset-defaults" type="button" class="ghost-button">Reset defaults</button>
          <div id="reset-confirmation" class="reset-confirmation" hidden>
            <span class="reset-confirmation__text">Reset all rules?</span>
            <button id="reset-confirm-yes" type="button" class="ghost-button reset-confirmation__button">Yes</button>
            <button id="reset-confirm-no" type="button" class="ghost-button reset-confirmation__button">No</button>
          </div>
        </div>
      </div>
      <textarea id="rules-textarea" rows="8"></textarea>
    </section>
  </main>
`;

function cloneSettings(settings: ExtensionSettings): ExtensionSettings {
  return {
    enabled: settings.enabled,
    autoHideDetected: settings.autoHideDetected,
    rules: settings.rules.map((rule) => ({ ...rule })),
  };
}

function createUserRule(id: string, pattern: string, matchType: StoredRule["matchType"]): StoredRule {
  return {
    id,
    pattern,
    enabled: true,
    source: "user",
    matchType,
  };
}

let currentSettings: ExtensionSettings;

const getSettingsMock = vi.fn(async () => cloneSettings(currentSettings));
const saveSettingsMock = vi.fn(async (settings: ExtensionSettings) => {
  currentSettings = cloneSettings(settings);
});
const buildResetSettingsMock = vi.fn((settings: ExtensionSettings) => ({
  enabled: settings.enabled,
  autoHideDetected: settings.autoHideDetected,
  rules: cloneDefaultRules(),
}));

vi.mock("../src/shared/storage", () => ({
  getSettings: getSettingsMock,
  saveSettings: saveSettingsMock,
  buildResetSettings: buildResetSettingsMock,
}));

async function mountPopup(): Promise<void> {
  vi.resetModules();
  document.body.innerHTML = popupMarkup;
  await import("../src/popup");
  await flushUi();
}

async function flushUi(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("popup UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSettings = {
      enabled: true,
      autoHideDetected: false,
      rules: [
        cloneDefaultRules()[0],
        createUserRule("user-regex-rule", "hello\\d+", "regex"),
      ],
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("populates textarea with stored rules on load", async () => {
    await mountPopup();

    const textarea = document.querySelector<HTMLTextAreaElement>("#rules-textarea");
    expect(textarea?.value).toBe("changes everything\nhello\\d+");
  });

  it("saves rules when textarea content changes", async () => {
    await mountPopup();

    const textarea = document.querySelector<HTMLTextAreaElement>("#rules-textarea");
    if (!textarea) throw new Error("Textarea not found.");

    textarea.value = "game changer\n\\btest\\b";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    expect(currentSettings.rules).toHaveLength(2);
    expect(currentSettings.rules[0]).toMatchObject({
      pattern: "game changer",
      matchType: "literal",
    });
    expect(currentSettings.rules[1]).toMatchObject({
      pattern: "\\btest\\b",
      matchType: "regex",
    });
  });

  it("auto-detects regex patterns with group constructs", async () => {
    await mountPopup();

    const textarea = document.querySelector<HTMLTextAreaElement>("#rules-textarea");
    if (!textarea) throw new Error("Textarea not found.");

    textarea.value = "(?i)hello world";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    expect(currentSettings.rules[0]).toMatchObject({
      pattern: "(?i)hello world",
      matchType: "regex",
    });
  });

  it("filters blank lines", async () => {
    await mountPopup();

    const textarea = document.querySelector<HTMLTextAreaElement>("#rules-textarea");
    if (!textarea) throw new Error("Textarea not found.");

    textarea.value = "hello\n\n\nworld\n";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    expect(currentSettings.rules).toHaveLength(2);
  });

  it("shows inline reset confirmation and cancels cleanly on no", async () => {
    currentSettings = {
      enabled: true,
      autoHideDetected: false,
      rules: [...cloneDefaultRules(), createUserRule("user-literal-rule", "ship fast", "literal")],
    };

    await mountPopup();

    document.querySelector<HTMLButtonElement>("#reset-defaults")?.click();
    await flushUi();

    expect(document.querySelector<HTMLElement>("#reset-confirmation")?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>("#reset-confirmation")?.textContent).toContain("Reset all rules?");
    expect(document.querySelector<HTMLButtonElement>("#reset-defaults")?.hidden).toBe(true);
    expect(buildResetSettingsMock).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>("#reset-confirm-no")?.click();
    await flushUi();

    expect(document.querySelector<HTMLElement>("#reset-confirmation")?.hidden).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("#reset-defaults")?.hidden).toBe(false);
    expect(buildResetSettingsMock).not.toHaveBeenCalled();
  });

  it("confirmed reset replaces textarea with shipped defaults only", async () => {
    currentSettings = {
      enabled: false,
      autoHideDetected: true,
      rules: [...cloneDefaultRules(), createUserRule("user-literal-rule", "ship fast", "literal")],
    };

    await mountPopup();

    const textarea = document.querySelector<HTMLTextAreaElement>("#rules-textarea");
    if (!textarea) throw new Error("Textarea not found.");

    expect(textarea.value).toContain("ship fast");

    document.querySelector<HTMLButtonElement>("#reset-defaults")?.click();
    await flushUi();
    document.querySelector<HTMLButtonElement>("#reset-confirm-yes")?.click();
    await flushUi();

    expect(currentSettings.enabled).toBe(false);
    expect(currentSettings.autoHideDetected).toBe(true);
    expect(currentSettings.rules).toHaveLength(cloneDefaultRules().length);
    expect(currentSettings.rules.every((rule) => rule.source === "default")).toBe(true);
    expect(textarea.value).not.toContain("ship fast");
    expect(textarea.value).toContain("changes everything");
    expect(document.querySelector<HTMLElement>("#reset-confirmation")?.hidden).toBe(true);
  });
});
