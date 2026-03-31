import "./popup.css";

import { buildResetSettings, getSettings, saveSettings } from "./shared/storage";
import { parseRulesText, rulesToText } from "./shared/rules";
import type { ExtensionSettings } from "./shared/types";

const enabledToggle = document.querySelector<HTMLInputElement>("#enabled-toggle");
const autohideToggle = document.querySelector<HTMLInputElement>("#autohide-toggle");
const rulesTextarea = document.querySelector<HTMLTextAreaElement>("#rules-textarea");
const resetDefaultsButton = document.querySelector<HTMLButtonElement>("#reset-defaults");
const resetConfirmation = document.querySelector<HTMLDivElement>("#reset-confirmation");
const resetConfirmYesButton = document.querySelector<HTMLButtonElement>("#reset-confirm-yes");
const resetConfirmNoButton = document.querySelector<HTMLButtonElement>("#reset-confirm-no");

let settings: ExtensionSettings;
let isResetConfirmationVisible = false;

async function init(): Promise<void> {
  if (
    !enabledToggle ||
    !autohideToggle ||
    !rulesTextarea ||
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

  rulesTextarea.addEventListener("input", async () => {
    settings = {
      ...settings,
      rules: parseRulesText(rulesTextarea.value),
    };

    await saveSettings(settings);
  });

  resetDefaultsButton.addEventListener("click", () => {
    showResetConfirmation();
  });

  resetConfirmYesButton.addEventListener("click", async () => {
    settings = buildResetSettings(settings);
    await saveSettings(settings);
    hideResetConfirmation();

    if (rulesTextarea) {
      rulesTextarea.value = rulesToText(settings.rules);
    }
  });

  resetConfirmNoButton.addEventListener("click", () => {
    hideResetConfirmation();
  });
}

function render(nextSettings: ExtensionSettings): void {
  if (!enabledToggle || !autohideToggle || !rulesTextarea) {
    return;
  }

  enabledToggle.checked = nextSettings.enabled;
  autohideToggle.checked = nextSettings.autoHideDetected;
  rulesTextarea.value = rulesToText(nextSettings.rules);
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
