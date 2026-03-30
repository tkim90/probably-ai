import {
  BADGE_SELECTOR,
  INTERNAL_STYLE_ID,
  clearBadges,
  scanRedditDocument,
} from "./detector";
import { STORAGE_KEY, getSettings } from "../shared/storage";
import type { ExtensionSettings } from "../shared/types";

const OBSERVER_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
};

let observer: MutationObserver | null = null;
let scheduledScanId: number | null = null;
let currentSettings: ExtensionSettings | null = null;

function start(): void {
  if (!document.body) {
    window.addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }

  observer = new MutationObserver(handleMutations);
  observeDom();
  void refresh();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[STORAGE_KEY]) {
      return;
    }

    void refresh();
  });
}

async function refresh(): Promise<void> {
  currentSettings = await getSettings();
  withObserverPaused(() => {
    clearBadges(document);
    scanRedditDocument(document, currentSettings as ExtensionSettings, window.location.hostname);
  });
}

function handleMutations(mutations: MutationRecord[]): void {
  if (mutations.every(isInternalMutation)) {
    return;
  }

  if (scheduledScanId !== null) {
    window.clearTimeout(scheduledScanId);
  }

  scheduledScanId = window.setTimeout(() => {
    scheduledScanId = null;
    if (!currentSettings) {
      void refresh();
      return;
    }

    withObserverPaused(() => {
      scanRedditDocument(document, currentSettings as ExtensionSettings, window.location.hostname);
    });
  }, 175);
}

function isInternalMutation(mutation: MutationRecord): boolean {
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (nodes.length === 0) {
    return false;
  }

  return nodes.every((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return isInternalElement(node.parentElement);
    }

    return isInternalElement(node instanceof HTMLElement ? node : node.parentElement);
  });
}

function isInternalElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  return (
    element.id === INTERNAL_STYLE_ID ||
    element.matches(BADGE_SELECTOR) ||
    element.closest(BADGE_SELECTOR) !== null
  );
}

function withObserverPaused(callback: () => void): void {
  observer?.disconnect();
  callback();
  observeDom();
}

function observeDom(): void {
  if (!observer || !document.body) {
    return;
  }

  observer.observe(document.body, OBSERVER_OPTIONS);
}

start();
