import "./popup.css";

import { buildResetSettings, getSettings, saveSettings } from "./shared/storage";
import { parseRulesText, rulesToText } from "./shared/rules";
import type { ExtensionSettings } from "./shared/types";

const enabledToggle = document.querySelector<HTMLInputElement>("#enabled-toggle");
const autohideToggle = document.querySelector<HTMLInputElement>("#autohide-toggle");
const phrasesTextarea = document.querySelector<HTMLTextAreaElement>("#phrases-textarea");
const regexTextarea = document.querySelector<HTMLTextAreaElement>("#regex-textarea");
const resetDefaultsButton = document.querySelector<HTMLButtonElement>("#reset-defaults");
const resetConfirmation = document.querySelector<HTMLDivElement>("#reset-confirmation");
const resetConfirmYesButton = document.querySelector<HTMLButtonElement>("#reset-confirm-yes");
const resetConfirmNoButton = document.querySelector<HTMLButtonElement>("#reset-confirm-no");

let settings: ExtensionSettings;
let isResetConfirmationVisible = false;
let saveTimerId: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(next: ExtensionSettings): void {
  settings = next;
  if (saveTimerId !== null) {
    clearTimeout(saveTimerId);
  }
  saveTimerId = setTimeout(() => {
    saveTimerId = null;
    void saveSettings(settings);
  }, 400);
}

async function init(): Promise<void> {
  if (
    !enabledToggle ||
    !autohideToggle ||
    !phrasesTextarea ||
    !regexTextarea ||
    !resetDefaultsButton ||
    !resetConfirmation ||
    !resetConfirmYesButton ||
    !resetConfirmNoButton
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

  phrasesTextarea.addEventListener("input", () => {
    debouncedSave({
      ...settings,
      rules: [
        ...parseRulesText(phrasesTextarea.value, "literal"),
        ...parseRulesText(regexTextarea.value, "regex"),
      ],
    });
  });

  regexTextarea.addEventListener("input", () => {
    debouncedSave({
      ...settings,
      rules: [
        ...parseRulesText(phrasesTextarea.value, "literal"),
        ...parseRulesText(regexTextarea.value, "regex"),
      ],
    });
  });

  resetDefaultsButton.addEventListener("click", () => {
    showResetConfirmation();
  });

  resetConfirmYesButton.addEventListener("click", async () => {
    settings = buildResetSettings(settings);
    await saveSettings(settings);
    hideResetConfirmation();
    renderTextareas(settings);
  });

  resetConfirmNoButton.addEventListener("click", () => {
    hideResetConfirmation();
  });
}

function renderTextareas(nextSettings: ExtensionSettings): void {
  if (!phrasesTextarea || !regexTextarea) return;
  phrasesTextarea.value = rulesToText(nextSettings.rules, "literal");
  regexTextarea.value = rulesToText(nextSettings.rules, "regex");
}

function render(nextSettings: ExtensionSettings): void {
  if (!enabledToggle || !autohideToggle) {
    return;
  }

  enabledToggle.checked = nextSettings.enabled;
  autohideToggle.checked = nextSettings.autoHideDetected;
  renderTextareas(nextSettings);
  renderResetConfirmation();
}

function showResetConfirmation(): void {
  isResetConfirmationVisible = true;
  renderResetConfirmation();
}

function hideResetConfirmation(): void {
  isResetConfirmationVisible = false;
  renderResetConfirmation();
}

function renderResetConfirmation(): void {
  if (!resetDefaultsButton || !resetConfirmation) {
    return;
  }

  resetDefaultsButton.hidden = isResetConfirmationVisible;
  resetConfirmation.hidden = !isResetConfirmationVisible;
}

void init();
