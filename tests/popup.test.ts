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
      <form id="add-rule-form" class="rule-form">
        <fieldset class="match-type-group">
          <legend class="sr-only">Rule type</legend>
          <label class="match-type-option" for="match-type-literal">
            <input id="match-type-literal" name="match-type" type="radio" value="literal" checked />
            <span>Literal phrase</span>
          </label>
          <label class="match-type-option" for="match-type-regex">
            <input id="match-type-regex" name="match-type" type="radio" value="regex" />
            <span>Regex</span>
          </label>
        </fieldset>
        <textarea id="pattern-input" rows="3"></textarea>
        <p id="form-error" class="error" hidden></p>
        <button id="add-rule-button" type="submit">Add rule</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel__header">
        <h2>Rules</h2>
        <button id="reset-defaults" type="button" class="ghost-button">Reset defaults</button>
      </div>
      <ul id="rule-list" class="rule-list"></ul>
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
  rules: [
    ...cloneDefaultRules(),
    ...settings.rules
      .filter((rule) => rule.source === "user")
      .map((rule) => ({ ...rule })),
  ],
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

function findRuleCard(pattern: string): HTMLElement {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".rule-card"));
  const card = cards.find((candidate) =>
    candidate.querySelector<HTMLElement>(".rule-card__pattern")?.textContent === pattern,
  );

  if (!card) {
    throw new Error(`Could not find rule card for pattern: ${pattern}`);
  }

  return card;
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
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders simplified rule cards and shows delete for default and user rules", async () => {
    await mountPopup();

    const ruleList = document.querySelector<HTMLElement>("#rule-list");
    expect(ruleList?.querySelectorAll(".rule-card")).toHaveLength(2);
    expect(ruleList?.querySelectorAll(".rule-card__delete")).toHaveLength(2);
    expect(ruleList?.querySelectorAll(".pill")).toHaveLength(0);
    expect(ruleList?.textContent).not.toContain("Enabled");
    expect(ruleList?.textContent).not.toContain("Disabled");
  });

  it("adds rules using the inline radio group for regex and literal modes", async () => {
    await mountPopup();

    const regexRadio = document.querySelector<HTMLInputElement>("#match-type-regex");
    const literalRadio = document.querySelector<HTMLInputElement>("#match-type-literal");
    const patternInput = document.querySelector<HTMLTextAreaElement>("#pattern-input");
    const form = document.querySelector<HTMLFormElement>("#add-rule-form");

    if (!regexRadio || !literalRadio || !patternInput || !form) {
      throw new Error("Popup form failed to mount.");
    }

    regexRadio.checked = true;
    patternInput.value = "founder\\s+mode";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushUi();

    expect(currentSettings.rules.at(-1)).toMatchObject({
      pattern: "founder\\s+mode",
      matchType: "regex",
    });

    literalRadio.checked = true;
    patternInput.value = "ship fast";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushUi();

    expect(currentSettings.rules.at(-1)).toMatchObject({
      pattern: "ship fast",
      matchType: "literal",
    });
  });

  it("deletes default rules and reset restores defaults while preserving user rules", async () => {
    currentSettings = {
      enabled: true,
      autoHideDetected: false,
      rules: [...cloneDefaultRules(), createUserRule("user-literal-rule", "ship fast", "literal")],
    };

    await mountPopup();

    findRuleCard("changes everything")
      .querySelector<HTMLButtonElement>(".rule-card__delete")
      ?.click();
    await flushUi();

    expect(currentSettings.rules.some((rule) => rule.id === "default-changes-everything")).toBe(false);

    document.querySelector<HTMLButtonElement>("#reset-defaults")?.click();
    await flushUi();

    expect(currentSettings.rules.some((rule) => rule.id === "default-changes-everything")).toBe(true);
    expect(currentSettings.rules.some((rule) => rule.id === "user-literal-rule")).toBe(true);
  });

  it("does not rerender or reset scroll when a rule checkbox changes", async () => {
    await mountPopup();

    const ruleList = document.querySelector<HTMLUListElement>("#rule-list");
    const checkbox = document.querySelector<HTMLInputElement>("[data-action='toggle-rule']");
    if (!ruleList || !checkbox) {
      throw new Error("Rule list failed to render.");
    }

    const originalReplaceChildren = ruleList.replaceChildren.bind(ruleList);
    const replaceChildrenSpy = vi
      .spyOn(ruleList, "replaceChildren")
      .mockImplementation((...nodes: Array<Node | string>) => {
        document.documentElement.scrollTop = 0;
        originalReplaceChildren(...nodes);
      });

    document.documentElement.scrollTop = 180;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    await flushUi();

    expect(replaceChildrenSpy).not.toHaveBeenCalled();
    expect(document.documentElement.scrollTop).toBe(180);
    expect(currentSettings.rules[0]?.enabled).toBe(false);
  });

  it("preserves scroll position when rerendering after delete and reset", async () => {
    await mountPopup();

    const ruleList = document.querySelector<HTMLUListElement>("#rule-list");
    if (!ruleList) {
      throw new Error("Rule list failed to render.");
    }

    const originalReplaceChildren = ruleList.replaceChildren.bind(ruleList);
    const replaceChildrenSpy = vi
      .spyOn(ruleList, "replaceChildren")
      .mockImplementation((...nodes: Array<Node | string>) => {
        document.documentElement.scrollTop = 0;
        originalReplaceChildren(...nodes);
      });

    document.documentElement.scrollTop = 160;
    findRuleCard("changes everything")
      .querySelector<HTMLButtonElement>(".rule-card__delete")
      ?.click();
    await flushUi();

    expect(replaceChildrenSpy).toHaveBeenCalledTimes(1);
    expect(document.documentElement.scrollTop).toBe(160);

    document.documentElement.scrollTop = 140;
    document.querySelector<HTMLButtonElement>("#reset-defaults")?.click();
    await flushUi();

    expect(replaceChildrenSpy).toHaveBeenCalledTimes(2);
    expect(document.documentElement.scrollTop).toBe(140);
  });
});
