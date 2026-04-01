import { createDefaultSettings } from "../src/shared/rules";
import type { ExtensionSettings } from "../src/shared/types";

const scanRedditDocumentMock = vi.fn();
const clearInjectedUiMock = vi.fn();
const getSettingsMock = vi.fn();

vi.mock("../src/content/detector", () => ({
  BADGE_SELECTOR: "[data-probably-ai-badge='true']",
  COLLAPSE_SELECTOR: "[data-probably-ai-collapse='true']",
  HIGHLIGHT_SELECTOR: "[data-probably-ai-highlight='true']",
  INTERNAL_STYLE_ID: "probably-ai-style",
  THREAD_FILTER_SELECTOR: "[data-probably-ai-thread-filter='true']",
  THREAD_FILTER_TOGGLE_SELECTOR: "[data-probably-ai-thread-filter-toggle='true']",
  TOGGLE_SELECTOR: "[data-probably-ai-toggle='true']",
  TOOLTIP_SELECTOR: "[data-probably-ai-tooltip='true']",
  clearInjectedUi: clearInjectedUiMock,
  scanRedditDocument: scanRedditDocumentMock,
}));

vi.mock("../src/shared/storage", () => ({
  STORAGE_KEY: "settings",
  getSettings: getSettingsMock,
}));

function createSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    ...createDefaultSettings(),
    ...overrides,
  };
}

function flushUi(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

let onChangedListener:
  | ((changes: Record<string, unknown>, areaName: string) => void)
  | undefined;
let addListenerMock: ReturnType<typeof vi.fn>;
let originalChrome: typeof chrome | undefined;
let originalMutationObserver: typeof MutationObserver | undefined;
let mutationCallback: MutationCallback | null = null;

class FakeMutationObserver {
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: MutationCallback) {
    mutationCallback = callback;
  }

  takeRecords(): MutationRecord[] {
    return [];
  }
}

async function loadContentScript(): Promise<void> {
  await import("../src/content/main");
  await flushUi();
}

describe("content runtime", () => {
  beforeAll(() => {
    originalChrome = globalThis.chrome;
    originalMutationObserver = globalThis.MutationObserver;
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    onChangedListener = undefined;
    mutationCallback = null;
    addListenerMock = vi.fn((listener) => {
      onChangedListener = listener;
    });

    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        storage: {
          onChanged: {
            addListener: addListenerMock,
          },
          sync: {
            get: vi.fn(),
            set: vi.fn(),
          },
        },
      },
    });

    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      value: FakeMutationObserver,
    });

    document.body.innerHTML = "<main><div data-testid='comment-thread'></div></main>";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: originalChrome,
    });

    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      value: originalMutationObserver,
    });
  });

  it("skips the startup scan when storage read is invalidated before settings are available", async () => {
    getSettingsMock.mockRejectedValueOnce(new Error("Extension context invalidated"));

    await loadContentScript();

    expect(clearInjectedUiMock).not.toHaveBeenCalled();
    expect(scanRedditDocumentMock).not.toHaveBeenCalled();
  });

  it("still performs the initial scan when storage listener registration is invalidated", async () => {
    const initialSettings = createSettings({
      autoHideDetected: true,
    });
    getSettingsMock.mockResolvedValueOnce(initialSettings);
    addListenerMock.mockImplementation(() => {
      throw new Error("Extension context invalidated");
    });

    await loadContentScript();

    expect(scanRedditDocumentMock).toHaveBeenCalledTimes(1);
    expect(scanRedditDocumentMock.mock.calls[0]?.[1]).toEqual(initialSettings);
  });

  it("reuses cached settings when a later refresh hits extension invalidation", async () => {
    const initialSettings = createSettings({
      enabled: false,
      autoHideDetected: true,
    });
    getSettingsMock
      .mockResolvedValueOnce(initialSettings)
      .mockRejectedValueOnce(new Error("Extension context invalidated"));

    await loadContentScript();

    onChangedListener?.({ settings: { newValue: {} } }, "sync");
    await flushUi();

    expect(scanRedditDocumentMock).toHaveBeenCalledTimes(2);
    expect(scanRedditDocumentMock.mock.calls[1]?.[1]).toEqual(initialSettings);
  });

  it("rethrows non-invalidation errors", async () => {
    getSettingsMock.mockResolvedValueOnce(createDefaultSettings());
    addListenerMock.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(loadContentScript()).rejects.toThrow("boom");
  });

  it("ignores internal hover highlight mutations when extracted text nodes lose their parent", async () => {
    getSettingsMock.mockResolvedValueOnce(createDefaultSettings());
    vi.useFakeTimers();

    try {
      await loadContentScript();
      scanRedditDocumentMock.mockClear();

      const title = document.createElement("div");
      document.body.append(title);

      const removedText = document.createTextNode("changes everything");
      title.append(removedText);

      const highlight = document.createElement("mark");
      highlight.setAttribute("data-probably-ai-highlight", "true");
      highlight.textContent = removedText.textContent;
      title.append(highlight);
      title.removeChild(removedText);

      mutationCallback?.([
        {
          addedNodes: [highlight],
          removedNodes: [removedText],
          target: title,
          type: "childList",
        } as MutationRecord,
      ], {} as MutationObserver);

      vi.runAllTimers();
      await flushUi();

      expect(removedText.parentElement).toBeNull();
      expect(highlight.parentElement).toBe(title);
      expect(scanRedditDocumentMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores internal character data mutations from injected hover UI", async () => {
    getSettingsMock.mockResolvedValueOnce(createDefaultSettings());
    vi.useFakeTimers();

    try {
      await loadContentScript();
      scanRedditDocumentMock.mockClear();

      const tooltip = document.createElement("div");
      tooltip.setAttribute("data-probably-ai-tooltip", "true");
      const label = document.createTextNode("Matched rules");
      tooltip.append(label);
      document.body.append(tooltip);

      mutationCallback?.([
        {
          addedNodes: [],
          removedNodes: [],
          oldValue: "Matched",
          target: label,
          type: "characterData",
        } as MutationRecord,
      ], {} as MutationObserver);

      vi.runAllTimers();
      await flushUi();

      expect(scanRedditDocumentMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
