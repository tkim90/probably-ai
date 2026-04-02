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
      <h3 class="textarea-label">Phrases</h3>
      <textarea id="phrases-textarea" class="rules-textarea" rows="6"></textarea>
      <h3 class="textarea-label">Regex</h3>
      <textarea id="regex-textarea" class="rules-textarea" rows="4"></textarea>
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
  await vi.advanceTimersByTimeAsync(500);
  await Promise.resolve();
}

describe("popup UI", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("populates both textareas with stored rules on load", async () => {
    await mountPopup();

    const phrases = document.querySelector<HTMLTextAreaElement>("#phrases-textarea");
    const regex = document.querySelector<HTMLTextAreaElement>("#regex-textarea");
    expect(phrases?.value).toBe("changes everything");
    expect(regex?.value).toBe("hello\\d+");
  });

  it("saves literal rules from phrases textarea", async () => {
    await mountPopup();

    const phrases = document.querySelector<HTMLTextAreaElement>("#phrases-textarea");
    if (!phrases) throw new Error("Phrases textarea not found.");

    phrases.value = "game changer\nship fast";
    phrases.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    const literals = currentSettings.rules.filter((r) => r.matchType === "literal");
    const regexes = currentSettings.rules.filter((r) => r.matchType === "regex");
    expect(literals).toHaveLength(2);
    expect(literals[0]).toMatchObject({ pattern: "game changer", matchType: "literal" });
    expect(regexes).toHaveLength(1);
    expect(regexes[0]).toMatchObject({ pattern: "hello\\d+", matchType: "regex" });
  });

  it("saves regex rules from regex textarea", async () => {
    await mountPopup();

    const regex = document.querySelector<HTMLTextAreaElement>("#regex-textarea");
    if (!regex) throw new Error("Regex textarea not found.");

    regex.value = "(w|W)hy\n\\btest\\b";
    regex.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    const literals = currentSettings.rules.filter((r) => r.matchType === "literal");
    const regexes = currentSettings.rules.filter((r) => r.matchType === "regex");
    expect(literals).toHaveLength(1);
    expect(regexes).toHaveLength(2);
    expect(regexes[0]).toMatchObject({ pattern: "(w|W)hy", matchType: "regex" });
    expect(regexes[1]).toMatchObject({ pattern: "\\btest\\b", matchType: "regex" });
  });

  it("filters blank lines", async () => {
    await mountPopup();

    const phrases = document.querySelector<HTMLTextAreaElement>("#phrases-textarea");
    if (!phrases) throw new Error("Phrases textarea not found.");

    phrases.value = "hello\n\n\nworld\n";
    phrases.dispatchEvent(new Event("input", { bubbles: true }));
    await flushUi();

    const literals = currentSettings.rules.filter((r) => r.matchType === "literal");
    expect(literals).toHaveLength(2);
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

  it("confirmed reset replaces both textareas with shipped defaults only", async () => {
    currentSettings = {
      enabled: false,
      autoHideDetected: true,
      rules: [...cloneDefaultRules(), createUserRule("user-literal-rule", "ship fast", "literal")],
    };

    await mountPopup();

    const phrases = document.querySelector<HTMLTextAreaElement>("#phrases-textarea");
    if (!phrases) throw new Error("Phrases textarea not found.");

    expect(phrases.value).toContain("ship fast");

    document.querySelector<HTMLButtonElement>("#reset-defaults")?.click();
    await flushUi();
    document.querySelector<HTMLButtonElement>("#reset-confirm-yes")?.click();
    await flushUi();

    expect(currentSettings.enabled).toBe(false);
    expect(currentSettings.autoHideDetected).toBe(true);
    expect(currentSettings.rules).toHaveLength(cloneDefaultRules().length);
    expect(currentSettings.rules.every((rule) => rule.source === "default")).toBe(true);
    expect(phrases.value).not.toContain("ship fast");
    expect(phrases.value).toContain("changes everything");
    expect(document.querySelector<HTMLTextAreaElement>("#regex-textarea")?.value).not.toBe("");
    expect(document.querySelector<HTMLElement>("#reset-confirmation")?.hidden).toBe(true);
  });
});
