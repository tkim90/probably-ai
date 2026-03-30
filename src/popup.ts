import "./popup.css";

import { buildResetSettings, getSettings, saveSettings } from "./shared/storage";
import { createUserRule, validateRulePattern } from "./shared/rules";
import type { ExtensionSettings, MatchType } from "./shared/types";

const enabledToggle = document.querySelector<HTMLInputElement>("#enabled-toggle");
const addRuleForm = document.querySelector<HTMLFormElement>("#add-rule-form");
const patternInput = document.querySelector<HTMLTextAreaElement>("#pattern-input");
const matchTypeInput = document.querySelector<HTMLSelectElement>("#match-type-input");
const formError = document.querySelector<HTMLParagraphElement>("#form-error");
const ruleList = document.querySelector<HTMLUListElement>("#rule-list");
const resetDefaultsButton = document.querySelector<HTMLButtonElement>("#reset-defaults");

let settings: ExtensionSettings;

async function init(): Promise<void> {
  if (
    !enabledToggle ||
    !addRuleForm ||
    !patternInput ||
    !matchTypeInput ||
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
    render(settings);
  });

  addRuleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const pattern = patternInput.value.trim();
    const matchType = (matchTypeInput.value as MatchType) || "literal";
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
    matchTypeInput.value = "literal";
    render(settings);
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
    render(settings);
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
    render(settings);
  });

  resetDefaultsButton.addEventListener("click", async () => {
    settings = buildResetSettings(settings);
    await saveSettings(settings);
    render(settings);
  });
}

function render(nextSettings: ExtensionSettings): void {
  if (!enabledToggle || !ruleList) {
    return;
  }

  enabledToggle.checked = nextSettings.enabled;
  ruleList.replaceChildren(
    ...nextSettings.rules.map((rule) => {
      const item = document.createElement("li");
      item.className = "rule-card";

      const topLine = document.createElement("div");
      topLine.className = "rule-card__topline";

      const sourcePill = document.createElement("span");
      sourcePill.className = "pill";
      sourcePill.textContent = rule.source;

      const matchTypePill = document.createElement("span");
      matchTypePill.className = "pill";
      matchTypePill.textContent = rule.matchType;

      const badges = document.createElement("div");
      badges.className = "rule-card__badges";
      badges.append(sourcePill, matchTypePill);

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

      const toggleText = document.createElement("span");
      toggleText.textContent = rule.enabled ? "Enabled" : "Disabled";

      toggleLabel.append(toggle, toggleText);
      controls.append(toggleLabel);

      if (rule.source === "user") {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "rule-card__delete";
        deleteButton.dataset.action = "delete-rule";
        deleteButton.dataset.ruleId = rule.id;
        deleteButton.textContent = "Delete";
        controls.append(deleteButton);
      }

      topLine.append(badges);
      item.append(topLine, pattern, controls);
      return item;
    }),
  );
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
