import "./popup.css";

import { buildResetSettings, getSettings, saveSettings } from "./shared/storage";
import { createUserRule, validateRulePattern } from "./shared/rules";
import type { ExtensionSettings, MatchType } from "./shared/types";

const enabledToggle = document.querySelector<HTMLInputElement>("#enabled-toggle");
const autohideToggle = document.querySelector<HTMLInputElement>("#autohide-toggle");
const addRuleForm = document.querySelector<HTMLFormElement>("#add-rule-form");
const patternInput = document.querySelector<HTMLTextAreaElement>("#pattern-input");
const matchTypeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>("input[name='match-type']"),
);
const formError = document.querySelector<HTMLParagraphElement>("#form-error");
const ruleList = document.querySelector<HTMLUListElement>("#rule-list");
const resetDefaultsButton = document.querySelector<HTMLButtonElement>("#reset-defaults");
const popupRoot = document.querySelector<HTMLElement>(".popup");

let settings: ExtensionSettings;

async function init(): Promise<void> {
  if (
    !enabledToggle ||
    !autohideToggle ||
    !addRuleForm ||
    !patternInput ||
    matchTypeInputs.length === 0 ||
    !formError ||
    !ruleList ||
    !resetDefaultsButton
  ) {
    throw new Error("Popup UI failed to initialize.");
  }

  settings = await getSettings();
  render(settings);

  enabledToggle.addEventListener("change", async () => {
    settings = {
      ...settings,
      enabled: enabledToggle.checked,
    };

    await saveSettings(settings);
  });

  autohideToggle.addEventListener("change", async () => {
    settings = {
      ...settings,
      autoHideDetected: autohideToggle.checked,
    };

    await saveSettings(settings);
  });

  addRuleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const pattern = patternInput.value.trim();
    const matchType = getSelectedMatchType();
    if (!pattern) {
      setError(matchType === "literal" ? "Enter a phrase before saving." : "Enter a regex before saving.");
      return;
    }

    const duplicate = settings.rules.some(
      (rule) => rule.pattern === pattern && rule.matchType === matchType,
    );
    if (duplicate) {
      setError("That rule already exists.");
      return;
    }

    const validationError = validateRulePattern(pattern, matchType);
    if (validationError) {
      setError(validationError);
      return;
    }

    settings = {
      ...settings,
      rules: [...settings.rules, createUserRule(pattern, matchType)],
    };

    await saveSettings(settings);
    patternInput.value = "";
    setSelectedMatchType("literal");
    renderRuleList(settings, true);
  });

  ruleList.addEventListener("change", async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.action !== "toggle-rule") {
      return;
    }

    const ruleId = input.dataset.ruleId;
    if (!ruleId) {
      return;
    }

    settings = {
      ...settings,
      rules: settings.rules.map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: input.checked } : rule,
      ),
    };

    await saveSettings(settings);
  });

  ruleList.addEventListener("click", async (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement) || button.dataset.action !== "delete-rule") {
      return;
    }

    const ruleId = button.dataset.ruleId;
    if (!ruleId) {
      return;
    }

    settings = {
      ...settings,
      rules: settings.rules.filter((rule) => rule.id !== ruleId),
    };

    await saveSettings(settings);
    renderRuleList(settings, true);
  });

  resetDefaultsButton.addEventListener("click", async () => {
    settings = buildResetSettings(settings);
    await saveSettings(settings);
    renderRuleList(settings, true);
  });
}

function render(nextSettings: ExtensionSettings): void {
  if (!enabledToggle || !autohideToggle) {
    return;
  }

  enabledToggle.checked = nextSettings.enabled;
  autohideToggle.checked = nextSettings.autoHideDetected;
  renderRuleList(nextSettings);
}

function renderRuleList(nextSettings: ExtensionSettings, preserveScroll = false): void {
  if (!ruleList) {
    return;
  }

  const renderCards = () => {
    ruleList.replaceChildren(
      ...nextSettings.rules.map((rule) => {
        const item = document.createElement("li");
        item.className = "rule-card";

        const pattern = document.createElement("p");
        pattern.className = "rule-card__pattern";
        pattern.textContent = rule.pattern;

        const controls = document.createElement("div");
        controls.className = "rule-card__controls";

        const toggleLabel = document.createElement("label");
        toggleLabel.className = "rule-card__toggle";

        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = rule.enabled;
        toggle.dataset.action = "toggle-rule";
        toggle.dataset.ruleId = rule.id;
        toggle.setAttribute("aria-label", `Toggle rule ${rule.pattern}`);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "rule-card__delete";
        deleteButton.dataset.action = "delete-rule";
        deleteButton.dataset.ruleId = rule.id;
        deleteButton.textContent = "Delete";

        toggleLabel.append(toggle);
        controls.append(toggleLabel, deleteButton);
        item.append(pattern, controls);
        return item;
      }),
    );
  };

  if (!preserveScroll) {
    renderCards();
    return;
  }

  const scrollTargets = collectScrollTargets();
  const scrollPositions = scrollTargets.map((target) => [target, target.scrollTop] as const);
  renderCards();

  for (const [target, scrollTop] of scrollPositions) {
    target.scrollTop = scrollTop;
  }
}

function collectScrollTargets(): HTMLElement[] {
  const candidates = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    popupRoot,
  ].filter((element): element is HTMLElement => element instanceof HTMLElement);

  return Array.from(new Set(candidates));
}

function getSelectedMatchType(): MatchType {
  const selected = matchTypeInputs.find((input) => input.checked);
  return selected?.value === "regex" ? "regex" : "literal";
}

function setSelectedMatchType(matchType: MatchType): void {
  for (const input of matchTypeInputs) {
    input.checked = input.value === matchType;
  }
}

function setError(message: string): void {
  if (!formError) {
    return;
  }

  formError.hidden = false;
  formError.textContent = message;
}

function clearError(): void {
  if (!formError) {
    return;
  }

  formError.hidden = true;
  formError.textContent = "";
}

void init();
