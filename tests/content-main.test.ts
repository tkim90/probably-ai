import { createDefaultSettings } from "../src/shared/rules";
import type { ExtensionSettings } from "../src/shared/types";

const scanRedditDocumentMock = vi.fn();
const clearInjectedUiMock = vi.fn();
const getSettingsMock = vi.fn();

vi.mock("../src/content/detector", () => ({
  BADGE_SELECTOR: "[data-probably-ai-badge='true']",
  COLLAPSE_SELECTOR: "[data-probably-ai-collapse='true']",
  INTERNAL_STYLE_ID: "probably-ai-style",
  THREAD_FILTER_SELECTOR: "[data-probably-ai-thread-filter='true']",
  THREAD_FILTER_TOGGLE_SELECTOR: "[data-probably-ai-thread-filter-toggle='true']",
  TOGGLE_SELECTOR: "[data-probably-ai-toggle='true']",
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

class FakeMutationObserver {
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(_callback: MutationCallback) {}

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
});
