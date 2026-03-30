import { compileRules, matchesAnyRule, normalizeText } from "../shared/rules";
import type { ExtensionSettings } from "../shared/types";

const STYLE_ELEMENT_ID = "probably-ai-extension-style";
const BADGE_ATTRIBUTE = "data-probably-ai-badge";
const PROCESSED_ATTRIBUTE = "data-probably-ai-processed";

type Placement = "after" | "prepend" | "append";

interface ScanCandidate {
  container: HTMLElement;
  target: HTMLElement;
  placement: Placement;
  text: string;
}

export const BADGE_SELECTOR = `[${BADGE_ATTRIBUTE}="true"]`;
export const PROCESSED_SELECTOR = `[${PROCESSED_ATTRIBUTE}="true"]`;
export const INTERNAL_STYLE_ID = STYLE_ELEMENT_ID;

export function clearBadges(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(BADGE_SELECTOR).forEach((badge) => badge.remove());
}

export function scanRedditDocument(
  root: Document | Element,
  settings: ExtensionSettings,
  hostname: string,
): number {
  const documentRef = root instanceof Document ? root : root.ownerDocument;
  if (!documentRef) {
    return 0;
  }

  ensureInjectedStyles(documentRef);
  const compiledRules = compileRules(settings.rules);
  const candidates = collectCandidates(root, hostname);
  let matchCount = 0;

  for (const candidate of candidates) {
    candidate.container.setAttribute(PROCESSED_ATTRIBUTE, "true");
    const matched =
      settings.enabled &&
      candidate.text.length > 0 &&
      matchesAnyRule(candidate.text, compiledRules);

    syncBadge(candidate, matched);
    if (matched) {
      matchCount += 1;
    }
  }

  return matchCount;
}

function ensureInjectedStyles(documentRef: Document): void {
  if (documentRef.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = documentRef.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
    .probably-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0.2rem 0;
      padding: 0.16rem 0.55rem;
      border-radius: 999px;
      background: #c62828;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1.2;
      vertical-align: middle;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    [data-probably-ai-meta-row="true"] .probably-ai-badge {
      margin: 0 0 0 0.45rem;
    }

    shreddit-comment .probably-ai-badge,
    .thing.comment .probably-ai-badge {
      margin-bottom: 0.4rem;
    }
  `;

  documentRef.head?.append(style);
}

function syncBadge(candidate: ScanCandidate, matched: boolean): void {
  const existingBadge = candidate.container.querySelector<HTMLElement>(BADGE_SELECTOR);
  if (!matched) {
    existingBadge?.remove();
    return;
  }

  if (existingBadge) {
    return;
  }

  const badge = candidate.target.ownerDocument.createElement("span");
  badge.className = "probably-ai-badge";
  badge.setAttribute(BADGE_ATTRIBUTE, "true");
  badge.textContent = "🟡 Probably AI";

  if (candidate.placement === "after") {
    candidate.target.insertAdjacentElement("afterend", badge);
    return;
  }

  if (candidate.placement === "append") {
    candidate.target.append(badge);
    return;
  }

  candidate.target.prepend(badge);
}

function collectCandidates(root: Document | Element, hostname: string): ScanCandidate[] {
  if (hostname.startsWith("old.")) {
    return [
      ...collectOldRedditPosts(root),
      ...collectOldRedditComments(root),
    ];
  }

  return [
    ...collectCurrentRedditPosts(root),
    ...collectCurrentRedditComments(root),
  ];
}

function collectCurrentRedditPosts(root: Document | Element): ScanCandidate[] {
  const containers = pickCurrentContainers(root, "shreddit-post", [
    "article[data-testid='post-container']",
    "div[data-testid='post-container']",
  ]);

  return containers
    .map((container) => {
      const metadataTarget = findCurrentMetadataTarget(container, [
        "[slot='credit-bar']",
        "[slot='author-metadata']",
        "[data-testid='post-subheader']",
        "[data-testid='post_author_line']",
        "faceplate-tracker[noun='post_author']",
      ]);
      const target =
        metadataTarget ??
        selectFirst(container, [
          "a[data-testid='post-title-text']",
          "[slot='title']",
          "h1",
          "h2",
          "h3",
        ]) ??
        container;

      const text = collectText(container, [
        "a[data-testid='post-title-text']",
        "[slot='title']",
        "h1",
        "h2",
        "h3",
        "[slot='text-body']",
        "div[data-click-id='text']",
        "div[data-adclicklocation='text-body']",
        "p",
      ]);

      return {
        container,
        target,
        placement: metadataTarget ? ("append" as const) : ("after" as const),
        text,
      };
    })
    .filter((candidate) => candidate.text.length > 0);
}

function collectCurrentRedditComments(root: Document | Element): ScanCandidate[] {
  const containers = pickCurrentContainers(root, "shreddit-comment", [
    "article[data-testid='comment']",
    "div[data-testid='comment']",
  ]);

  return containers
    .map((container) => {
      const metadataTarget = findCurrentMetadataTarget(container, [
        "[slot='commentMeta']",
        "[slot='metadata']",
        "[data-testid='comment_author_line']",
        "faceplate-tracker[noun='comment_author']",
      ]);
      const target =
        metadataTarget ??
        selectFirst(container, ["[slot='comment']", "[data-testid='comment']", "p"]) ??
        container;

      const text = collectText(container, ["[slot='comment']", "[data-testid='comment']", "p"]);

      return {
        container,
        target,
        placement: metadataTarget ? ("append" as const) : ("prepend" as const),
        text,
      };
    })
    .filter((candidate) => candidate.text.length > 0);
}

function collectOldRedditPosts(root: Document | Element): ScanCandidate[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".thing.link"))
    .map((container) => {
      const target = selectFirst(container, [".entry .title"]) ?? container;
      const text = collectText(container, [
        ".entry .title",
        ".entry .usertext-body .md",
        ".entry .expando .md",
      ]);

      return { container, target, placement: "after" as const, text };
    })
    .filter((candidate) => candidate.text.length > 0);
}

function collectOldRedditComments(root: Document | Element): ScanCandidate[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".thing.comment"))
    .map((container) => {
      const target =
        selectFirst(container, [".entry .tagline", ".entry .usertext-body .md"]) ?? container;
      const placement: Placement = target.matches(".entry .tagline") ? "after" : "prepend";
      const text = collectText(container, [".entry .usertext-body .md", ".entry .md"]);

      return { container, target, placement, text };
    })
    .filter((candidate) => candidate.text.length > 0);
}

function pickCurrentContainers(
  root: Document | Element,
  preferredSelector: string,
  fallbackSelectors: string[],
): HTMLElement[] {
  const preferred = Array.from(root.querySelectorAll<HTMLElement>(preferredSelector));
  if (preferred.length > 0) {
    return preferred;
  }

  return fallbackSelectors.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector)),
  );
}

function collectText(container: HTMLElement, selectors: string[]): string {
  const collected = selectors
    .flatMap((selector) => Array.from(container.querySelectorAll<HTMLElement>(selector)))
    .map((element) => normalizeText(element.textContent ?? ""))
    .filter(Boolean);

  if (collected.length > 0) {
    return normalizeText(collected.join(" "));
  }

  return normalizeText(container.textContent ?? "");
}

function selectFirst(container: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const match = container.querySelector<HTMLElement>(selector);
    if (match) {
      return match;
    }
  }

  return null;
}

function findCurrentMetadataTarget(
  container: HTMLElement,
  selectors: string[],
): HTMLElement | null {
  const metadataRow = selectFirst(container, selectors);
  if (!metadataRow) {
    return null;
  }

  metadataRow.setAttribute("data-probably-ai-meta-row", "true");
  return metadataRow;
}
