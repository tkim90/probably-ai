import { compileRules, matchesAnyRule, normalizeText } from "../shared/rules";
import type { ExtensionSettings } from "../shared/types";

const STYLE_ELEMENT_ID = "probably-ai-extension-style";
const BADGE_ATTRIBUTE = "data-probably-ai-badge";
const COLLAPSE_ATTRIBUTE = "data-probably-ai-collapse";
const TOGGLE_ATTRIBUTE = "data-probably-ai-toggle";
const PREVIEW_ATTRIBUTE = "data-probably-ai-preview";
const META_ROW_ATTRIBUTE = "data-probably-ai-meta-row";
const PROCESSED_ATTRIBUTE = "data-probably-ai-processed";
const HIDDEN_ATTRIBUTE = "data-probably-ai-hidden";
const ORIGINAL_DISPLAY_ATTRIBUTE = "data-probably-ai-original-display";
const DIMMED_ATTRIBUTE = "data-probably-ai-dimmed";
const ORIGINAL_OPACITY_ATTRIBUTE = "data-probably-ai-original-opacity";
const THREAD_FILTER_ATTRIBUTE = "data-probably-ai-thread-filter";
const THREAD_FILTER_TOGGLE_ATTRIBUTE = "data-probably-ai-thread-filter-toggle";
const THREAD_FILTER_ICON_ATTRIBUTE = "data-probably-ai-thread-filter-icon";
const THREAD_FILTER_LABEL_ATTRIBUTE = "data-probably-ai-thread-filter-label";
const SHOW_FILTERED_COMMENTS_ICON = "baseline-remove-red-eye.svg";
const HIDE_FILTERED_COMMENTS_ICON = "baseline-disabled-visible.svg";
const SHOW_FILTERED_COMMENTS_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#000000" style="opacity:1;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5s5 2.24 5 5s-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3s3-1.34 3-3s-1.34-3-3-3"/></svg>';
const HIDE_FILTERED_COMMENTS_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#000000" style="opacity:1;"><path d="M21.99 12.34c.01-.11.01-.23.01-.34c0-5.52-4.48-10-10-10S2 6.48 2 12c0 5.17 3.93 9.43 8.96 9.95a9.3 9.3 0 0 1-2.32-2.68A8.01 8.01 0 0 1 4 12c0-1.85.63-3.55 1.69-4.9l5.66 5.66c.56-.4 1.17-.73 1.82-1L7.1 5.69A7.9 7.9 0 0 1 12 4c4.24 0 7.7 3.29 7.98 7.45c.71.22 1.39.52 2.01.89M17 13c-3.18 0-5.9 1.87-7 4.5c1.1 2.63 3.82 4.5 7 4.5s5.9-1.87 7-4.5c-1.1-2.63-3.82-4.5-7-4.5m0 7a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 1 0 5m1.5-2.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5s1.5.67 1.5 1.5"/></svg>';

type Placement = "after" | "prepend" | "append";
type CandidateKind = "post" | "comment";
type PlatformKind = "current" | "old";

interface ScanCandidate {
  key: string;
  kind: CandidateKind;
  platform: PlatformKind;
  container: HTMLElement;
  indicatorTarget: HTMLElement;
  badgeTarget: HTMLElement;
  placement: Placement;
  contentTargets: HTMLElement[];
  dimTargets: HTMLElement[];
  text: string;
  previewText: string;
  isMainSubmission: boolean;
  threadKey?: string;
  threadHost?: HTMLElement;
}

interface CandidateState {
  candidate: ScanCandidate;
  matched: boolean;
}

interface ThreadGroup {
  key: string;
  platform: PlatformKind;
  host: HTMLElement;
  anchor: HTMLElement;
  comments: CandidateState[];
}

let nextCandidateId = 1;
let nextThreadId = 1;
const candidateKeys = new WeakMap<HTMLElement, string>();
const threadKeys = new WeakMap<HTMLElement, string>();
const expandedCandidateKeys = new Set<string>();
const revealedThreadKeys = new Set<string>();
let activeCandidates = new Map<string, ScanCandidate>();
let activeThreadGroups = new Map<string, ThreadGroup>();
const FALLBACK_ICON_URLS: Record<string, string> = {
  [SHOW_FILTERED_COMMENTS_ICON]: createSvgDataUrl(SHOW_FILTERED_COMMENTS_ICON_SVG),
  [HIDE_FILTERED_COMMENTS_ICON]: createSvgDataUrl(HIDE_FILTERED_COMMENTS_ICON_SVG),
};

export const BADGE_SELECTOR = `[${BADGE_ATTRIBUTE}="true"]`;
export const COLLAPSE_SELECTOR = `[${COLLAPSE_ATTRIBUTE}="true"]`;
export const TOGGLE_SELECTOR = `[${TOGGLE_ATTRIBUTE}="true"]`;
export const THREAD_FILTER_SELECTOR = `[${THREAD_FILTER_ATTRIBUTE}="true"]`;
export const THREAD_FILTER_TOGGLE_SELECTOR = `[${THREAD_FILTER_TOGGLE_ATTRIBUTE}="true"]`;
export const PROCESSED_SELECTOR = `[${PROCESSED_ATTRIBUTE}="true"]`;
export const INTERNAL_STYLE_ID = STYLE_ELEMENT_ID;

export function clearInjectedUi(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(BADGE_SELECTOR).forEach((badge) => badge.remove());
  root.querySelectorAll<HTMLElement>(COLLAPSE_SELECTOR).forEach((control) => control.remove());
  root.querySelectorAll<HTMLElement>(THREAD_FILTER_SELECTOR).forEach((control) => control.remove());
  root.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTRIBUTE}="true"]`).forEach((element) => {
    revealElement(element);
  });
  root.querySelectorAll<HTMLElement>(`[${DIMMED_ATTRIBUTE}="true"]`).forEach((element) => {
    undimElement(element);
  });
}

export function scanRedditDocument(
  root: Document | Element,
  settings: ExtensionSettings,
  hostname: string,
  pathname = "/",
): number {
  const documentRef = root instanceof Document ? root : root.ownerDocument;
  if (!documentRef) {
    return 0;
  }

  ensureInjectedStyles(documentRef);
  const compiledRules = compileRules(settings.rules);
  const candidates = collectCandidates(root, hostname, pathname);
  const candidateStates = candidates.map((candidate) => ({
    candidate,
    matched:
      settings.enabled &&
      candidate.text.length > 0 &&
      matchesAnyRule(candidate.text, compiledRules),
  }));
  const nextActiveCandidates = new Map<string, ScanCandidate>();
  const nextThreadGroups = new Map<string, ThreadGroup>();
  const threadAnchors = new Map<string, HTMLElement>();
  let matchCount = 0;

  for (const state of candidateStates) {
    const { candidate, matched } = state;
    const threadManaged = isThreadManagedComment(candidate, settings.autoHideDetected);
    nextActiveCandidates.set(candidate.key, candidate);
    candidate.container.setAttribute(PROCESSED_ATTRIBUTE, "true");

    if (matched) {
      matchCount += 1;
    }

    if (candidate.threadKey && !threadAnchors.has(candidate.threadKey)) {
      threadAnchors.set(candidate.threadKey, candidate.container);
    }

    if (threadManaged && candidate.platform === "current") {
      syncBadge(candidate, matched);
      syncCollapse(candidate, false, false);

      if (!matched) {
        revealElement(candidate.container);
        undimCandidate(candidate);
      } else if (candidate.threadKey && candidate.threadHost) {
        const existingGroup = nextThreadGroups.get(candidate.threadKey);
        if (existingGroup) {
          existingGroup.comments.push(state);
        } else {
          nextThreadGroups.set(candidate.threadKey, {
            key: candidate.threadKey,
            platform: candidate.platform,
            host: candidate.threadHost,
            anchor: threadAnchors.get(candidate.threadKey) ?? candidate.container,
            comments: [state],
          });
        }
      }

      continue;
    }

    syncBadge(candidate, matched);
    syncCollapse(candidate, matched, shouldIndividuallyHide(candidate, settings.autoHideDetected));

    if (matched && candidate.kind === "post" && !candidate.isMainSubmission && settings.autoHideDetected) {
      dimCandidate(candidate);
    } else {
      undimCandidate(candidate);
    }

    if (threadManaged) {
      if (!matched) {
        revealElement(candidate.container);
        undimCandidate(candidate);
      } else if (candidate.threadKey && candidate.threadHost) {
        const existingGroup = nextThreadGroups.get(candidate.threadKey);
        if (existingGroup) {
          existingGroup.comments.push(state);
        } else {
          nextThreadGroups.set(candidate.threadKey, {
            key: candidate.threadKey,
            platform: candidate.platform,
            host: candidate.threadHost,
            anchor: threadAnchors.get(candidate.threadKey) ?? candidate.container,
            comments: [state],
          });
        }
      }
    }
  }

  syncThreadGroups(nextThreadGroups, settings.autoHideDetected);
  activeCandidates = nextActiveCandidates;
  activeThreadGroups = nextThreadGroups;
  pruneState();
  return matchCount;
}

export function toggleCandidateExpanded(key: string): void {
  const candidate = activeCandidates.get(key);
  if (!candidate) {
    return;
  }

  if (expandedCandidateKeys.has(key)) {
    expandedCandidateKeys.delete(key);
  } else {
    expandedCandidateKeys.add(key);
  }

  applyCollapsedState(candidate);
  syncCollapseControl(candidate);
}

function toggleThreadFilteredComments(key: string): void {
  const group = activeThreadGroups.get(key);
  if (!group) {
    return;
  }

  if (revealedThreadKeys.has(key)) {
    revealedThreadKeys.delete(key);
  } else {
    revealedThreadKeys.add(key);
  }

  applyThreadGroupState(group);
  syncThreadGroupControl(group);
}

function syncThreadGroups(
  nextThreadGroups: Map<string, ThreadGroup>,
  autoHideDetected: boolean,
): void {
  for (const [key, group] of activeThreadGroups) {
    if (!nextThreadGroups.has(key) || !autoHideDetected) {
      group.host.querySelector<HTMLElement>(THREAD_FILTER_SELECTOR)?.remove();
      for (const state of group.comments) {
        revealElement(state.candidate.container);
        undimCandidate(state.candidate);
      }
    }
  }

  if (!autoHideDetected) {
    return;
  }

  for (const group of nextThreadGroups.values()) {
    if (group.comments.length === 0) {
      group.host.querySelector<HTMLElement>(THREAD_FILTER_SELECTOR)?.remove();
      continue;
    }

    syncThreadGroupControl(group);
    applyThreadGroupState(group);
  }
}

function pruneState(): void {
  for (const key of [...expandedCandidateKeys]) {
    if (!activeCandidates.has(key)) {
      expandedCandidateKeys.delete(key);
    }
  }

  for (const key of [...revealedThreadKeys]) {
    if (!activeThreadGroups.has(key)) {
      revealedThreadKeys.delete(key);
    }
  }
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
      flex: 0 0 auto;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      padding: 0.14rem 0.45rem;
      border-radius: 999px;
      background: #363636;
      color: #f5f1e8;
      font-size: 0.72rem;
      font-weight: 700;
      line-height: 1;
      vertical-align: middle;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    [${META_ROW_ATTRIBUTE}="true"] .probably-ai-badge {
      margin: 0 0 0 0.45rem;
    }

    .probably-ai-post-collapse {
      display: grid;
      gap: 0.28rem;
      margin: 0.35rem 0 0.55rem;
      min-width: 0;
      pointer-events: auto;
      position: relative;
      z-index: 2;
    }

    .probably-ai-post-collapse-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
      min-width: 0;
    }

    .probably-ai-post-collapse-top-left {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
    }

    .probably-ai-collapse-control {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      max-width: min(50vw, 560px);
      min-width: 0;
      vertical-align: middle;
      white-space: nowrap;
    }

    .probably-ai-collapse-preview {
      display: block;
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      color: inherit;
      font-size: 0.74rem;
      line-height: 1.2;
      opacity: 0.72;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .probably-ai-collapse-button {
      flex: 0 0 auto;
      min-width: max-content;
      border: 0;
      border-radius: 999px;
      background: rgba(198, 40, 40, 0.16);
      color: #c62828;
      cursor: pointer;
      font: inherit;
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1;
      padding: 0.2rem 0.58rem;
      white-space: nowrap;
    }

    .probably-ai-collapse-button:hover {
      background: rgba(198, 40, 40, 0.24);
    }

    .probably-ai-thread-filter {
      margin: 0.85rem 0;
    }

    .probably-ai-thread-filter-button {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.9);
      color: #111111;
      cursor: pointer;
      font: inherit;
      font-size: 0.95rem;
      line-height: 1;
      opacity: 0.88;
      padding: 1rem 1.2rem;
      text-align: center;
    }

    .probably-ai-thread-filter-button:hover {
      opacity: 1;
      color: #111111;
    }

    .probably-ai-thread-filter--old {
      margin: 0 0 0.75rem;
    }

    .probably-ai-thread-filter-button--old {
      width: auto;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 0.35rem;
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      box-shadow: none;
      border: 0;
      border-radius: 0;
      color: #24a0ed;
      cursor: pointer;
      font: inherit;
      font-size: 1em;
      line-height: 1;
      opacity: 1;
      padding: 0;
      text-align: left;
      text-decoration: none;
    }

    .probably-ai-thread-filter-button--old:hover {
      text-decoration: underline;
    }

    .probably-ai-thread-filter-icon {
      width: 1em !important;
      height: 1em !important;
      max-width: 1em !important;
      max-height: 1em !important;
      display: inline-block !important;
      flex: 0 0 auto;
      align-self: center;
      vertical-align: middle !important;
      object-fit: contain;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }

    .probably-ai-thread-filter-label {
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }
  `;

  documentRef.head?.append(style);
}

function isThreadManagedComment(candidate: ScanCandidate, autoHideDetected: boolean): boolean {
  return autoHideDetected && candidate.kind === "comment";
}

function shouldIndividuallyHide(
  candidate: ScanCandidate,
  autoHideDetected: boolean,
): boolean {
  return autoHideDetected && candidate.kind === "comment" && candidate.platform === "current";
}

function syncBadge(candidate: ScanCandidate, matched: boolean): void {
  const existingBadge = candidate.container.querySelector<HTMLElement>(BADGE_SELECTOR);
  if (!matched) {
    existingBadge?.remove();
    return;
  }

  if (existingBadge) {
    if (existingBadge.parentElement !== candidate.badgeTarget) {
      moveIndicator(existingBadge, candidate.badgeTarget, candidate.placement);
    }

    return;
  }

  const badge = candidate.badgeTarget.ownerDocument.createElement("span");
  badge.className = "probably-ai-badge";
  badge.setAttribute(BADGE_ATTRIBUTE, "true");
  badge.textContent = "🔴 Probably AI";
  moveIndicator(badge, candidate.badgeTarget, candidate.placement);
}

function syncCollapse(
  candidate: ScanCandidate,
  matched: boolean,
  autoHideDetected: boolean,
): void {
  if (!matched || !autoHideDetected || candidate.contentTargets.length === 0) {
    candidate.container.querySelector<HTMLElement>(COLLAPSE_SELECTOR)?.remove();
    revealCandidate(candidate);
    return;
  }

  syncCollapseControl(candidate);
  applyCollapsedState(candidate);
}

function syncCollapseControl(candidate: ScanCandidate): void {
  if (candidate.platform === "old") {
    candidate.container.querySelector<HTMLElement>(COLLAPSE_SELECTOR)?.remove();
    return;
  }

  if (candidate.kind === "post") {
    syncPostCollapseControl(candidate);
    return;
  }

  let control = candidate.container.querySelector<HTMLElement>(COLLAPSE_SELECTOR);
  if (!control) {
    control = createInlineCollapseControl(candidate);
  }

  if (control.parentElement !== candidate.indicatorTarget) {
    moveIndicator(control, candidate.indicatorTarget, candidate.placement);
  }

  const preview = control.querySelector<HTMLElement>(`[${PREVIEW_ATTRIBUTE}="true"]`);
  const button = control.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR);
  const collapsed = !expandedCandidateKeys.has(candidate.key);

  if (preview) {
    preview.textContent = collapsed ? candidate.previewText : "";
    preview.hidden = !collapsed;
  }

  if (button) {
    button.dataset.candidateKey = candidate.key;
    button.textContent = collapsed ? "Show" : "Hide";
    button.setAttribute("aria-expanded", String(!collapsed));
  }
}

function syncPostCollapseControl(candidate: ScanCandidate): void {
  let control = candidate.container.querySelector<HTMLElement>(COLLAPSE_SELECTOR);
  if (!control) {
    control = createPostCollapseControl(candidate);
  }

  positionPostCollapseControl(control, candidate);

  const preview = control.querySelector<HTMLElement>(`[${PREVIEW_ATTRIBUTE}="true"]`);
  const button = control.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR);
  const topLeft = control.querySelector<HTMLElement>(".probably-ai-post-collapse-top-left");
  const badge = candidate.container.querySelector<HTMLElement>(BADGE_SELECTOR);
  const collapsed = !expandedCandidateKeys.has(candidate.key);

  if (badge && topLeft && badge.parentElement !== topLeft) {
    topLeft.prepend(badge);
  }

  if (preview) {
    preview.textContent = collapsed ? candidate.previewText : "";
    preview.hidden = !collapsed;
  }

  if (button) {
    button.dataset.candidateKey = candidate.key;
    button.textContent = collapsed ? "Show" : "Hide";
    button.setAttribute("aria-expanded", String(!collapsed));
  }
}

function createPostCollapseControl(candidate: ScanCandidate): HTMLElement {
  const control = candidate.indicatorTarget.ownerDocument.createElement("div");
  control.className = "probably-ai-post-collapse";
  control.setAttribute(COLLAPSE_ATTRIBUTE, "true");

  const top = candidate.indicatorTarget.ownerDocument.createElement("div");
  top.className = "probably-ai-post-collapse-top";

  const topLeft = candidate.indicatorTarget.ownerDocument.createElement("div");
  topLeft.className = "probably-ai-post-collapse-top-left";

  const button = candidate.indicatorTarget.ownerDocument.createElement("button");
  button.className = "probably-ai-collapse-button";
  button.setAttribute(TOGGLE_ATTRIBUTE, "true");
  button.type = "button";
  attachIsolatedButtonHandler(button, () => {
    const key = button.dataset.candidateKey;
    if (key) {
      toggleCandidateExpanded(key);
    }
  });

  top.append(topLeft, button);

  const preview = candidate.indicatorTarget.ownerDocument.createElement("div");
  preview.className = "probably-ai-collapse-preview";
  preview.setAttribute(PREVIEW_ATTRIBUTE, "true");

  control.append(top, preview);
  positionPostCollapseControl(control, candidate);
  return control;
}

function positionPostCollapseControl(control: HTMLElement, candidate: ScanCandidate): void {
  candidate.indicatorTarget.insertAdjacentElement("afterend", control);
}

function createInlineCollapseControl(candidate: ScanCandidate): HTMLElement {
  const control = candidate.indicatorTarget.ownerDocument.createElement("span");
  control.className = "probably-ai-collapse-control";
  control.setAttribute(COLLAPSE_ATTRIBUTE, "true");

  const preview = candidate.indicatorTarget.ownerDocument.createElement("span");
  preview.className = "probably-ai-collapse-preview";
  preview.setAttribute(PREVIEW_ATTRIBUTE, "true");

  const button = candidate.indicatorTarget.ownerDocument.createElement("button");
  button.className = "probably-ai-collapse-button";
  button.setAttribute(TOGGLE_ATTRIBUTE, "true");
  button.type = "button";
  attachIsolatedButtonHandler(button, () => {
    const key = button.dataset.candidateKey;
    if (key) {
      toggleCandidateExpanded(key);
    }
  });

  control.append(preview, button);
  moveIndicator(control, candidate.indicatorTarget, candidate.placement);
  return control;
}

function syncThreadGroupControl(group: ThreadGroup): void {
  let control = group.host.querySelector<HTMLElement>(THREAD_FILTER_SELECTOR);
  if (!control) {
    control = createThreadGroupControl(group);
  }

  const button = control.querySelector<HTMLButtonElement>(THREAD_FILTER_TOGGLE_SELECTOR);
  const revealed = revealedThreadKeys.has(group.key);
  const count = group.comments.length;

  if (button) {
    button.dataset.threadKey = group.key;
    button.setAttribute("aria-expanded", String(revealed));
    syncThreadGroupButtonContents(button, revealed, count);
  }

  placeThreadGroupControl(control, group);
}

function createThreadGroupControl(group: ThreadGroup): HTMLElement {
  const control = group.host.ownerDocument.createElement("div");
  control.className =
    group.platform === "old"
      ? "probably-ai-thread-filter probably-ai-thread-filter--old"
      : "probably-ai-thread-filter";
  control.setAttribute(THREAD_FILTER_ATTRIBUTE, "true");

  const button = group.host.ownerDocument.createElement("button");
  button.className =
    group.platform === "old"
      ? "probably-ai-thread-filter-button probably-ai-thread-filter-button--old"
      : "probably-ai-thread-filter-button";
  button.setAttribute(THREAD_FILTER_TOGGLE_ATTRIBUTE, "true");
  button.type = "button";
  attachIsolatedButtonHandler(button, () => {
    const key = button.dataset.threadKey;
    if (key) {
      toggleThreadFilteredComments(key);
    }
  });

  const icon = group.host.ownerDocument.createElement("img");
  icon.className = "probably-ai-thread-filter-icon";
  icon.setAttribute(THREAD_FILTER_ICON_ATTRIBUTE, "true");
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");

  const label = group.host.ownerDocument.createElement("span");
  label.className = "probably-ai-thread-filter-label";
  label.setAttribute(THREAD_FILTER_LABEL_ATTRIBUTE, "true");

  button.append(icon, label);
  control.append(button);
  placeThreadGroupControl(control, group);
  return control;
}

function syncThreadGroupButtonContents(
  button: HTMLButtonElement,
  revealed: boolean,
  count: number,
): void {
  const icon = button.querySelector<HTMLImageElement>(`[${THREAD_FILTER_ICON_ATTRIBUTE}="true"]`);
  const label = button.querySelector<HTMLElement>(`[${THREAD_FILTER_LABEL_ATTRIBUTE}="true"]`);
  const iconPath = revealed ? HIDE_FILTERED_COMMENTS_ICON : SHOW_FILTERED_COMMENTS_ICON;

  if (icon) {
    icon.src = getExtensionAssetUrl(iconPath);
  }

  if (label) {
    label.textContent = `${revealed ? "Hide" : "Show"} ${count} filtered comments`;
  }
}

function placeThreadGroupControl(control: HTMLElement, group: ThreadGroup): void {
  if (group.anchor.parentElement) {
    if (group.anchor.previousElementSibling !== control) {
      group.anchor.insertAdjacentElement("beforebegin", control);
    }
    return;
  }

  if (group.host.firstElementChild !== control) {
    group.host.prepend(control);
  }
}

function applyThreadGroupState(group: ThreadGroup): void {
  const revealed = revealedThreadKeys.has(group.key);

  for (const state of group.comments) {
    if (revealed) {
      revealElement(state.candidate.container);
      dimCandidate(state.candidate);
    } else {
      undimCandidate(state.candidate);
      hideElement(state.candidate.container);
    }
  }
}

function applyCollapsedState(candidate: ScanCandidate): void {
  const collapsed = !expandedCandidateKeys.has(candidate.key);

  for (const element of candidate.contentTargets) {
    if (collapsed) {
      hideElement(element);
    } else {
      revealElement(element);
    }
  }
}

function revealCandidate(candidate: ScanCandidate): void {
  for (const element of candidate.contentTargets) {
    revealElement(element);
  }
}

function hideElement(element: HTMLElement): void {
  if (element.getAttribute(HIDDEN_ATTRIBUTE) === "true") {
    return;
  }

  element.setAttribute(HIDDEN_ATTRIBUTE, "true");
  element.setAttribute(ORIGINAL_DISPLAY_ATTRIBUTE, element.style.display);
  element.style.display = "none";
}

function revealElement(element: HTMLElement): void {
  if (element.getAttribute(HIDDEN_ATTRIBUTE) !== "true") {
    return;
  }

  const originalDisplay = element.getAttribute(ORIGINAL_DISPLAY_ATTRIBUTE) ?? "";
  if (originalDisplay) {
    element.style.display = originalDisplay;
  } else {
    element.style.removeProperty("display");
  }

  element.removeAttribute(HIDDEN_ATTRIBUTE);
  element.removeAttribute(ORIGINAL_DISPLAY_ATTRIBUTE);
}

function dimElement(element: HTMLElement): void {
  if (element.getAttribute(DIMMED_ATTRIBUTE) === "true") {
    return;
  }

  element.setAttribute(DIMMED_ATTRIBUTE, "true");
  element.setAttribute(ORIGINAL_OPACITY_ATTRIBUTE, element.style.opacity);
  element.style.opacity = "0.56";
}

function undimElement(element: HTMLElement): void {
  if (element.getAttribute(DIMMED_ATTRIBUTE) !== "true") {
    return;
  }

  const originalOpacity = element.getAttribute(ORIGINAL_OPACITY_ATTRIBUTE) ?? "";
  if (originalOpacity) {
    element.style.opacity = originalOpacity;
  } else {
    element.style.removeProperty("opacity");
  }

  element.removeAttribute(DIMMED_ATTRIBUTE);
  element.removeAttribute(ORIGINAL_OPACITY_ATTRIBUTE);
}

function moveIndicator(element: HTMLElement, target: HTMLElement, placement: Placement): void {
  if (placement === "after") {
    target.insertAdjacentElement("afterend", element);
    return;
  }

  if (placement === "prepend") {
    target.prepend(element);
    return;
  }

  target.append(element);
}

function createSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

function getExtensionAssetUrl(path: string): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    try {
      return chrome.runtime.getURL(path);
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        throw error;
      }
    }
  }

  return FALLBACK_ICON_URLS[path] ?? path;
}

function attachIsolatedButtonHandler(
  button: HTMLButtonElement,
  onActivate: () => void,
): void {
  const suppress = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  button.addEventListener("mousedown", suppress);
  button.addEventListener("mouseup", suppress);
  button.addEventListener("pointerdown", suppress);
  button.addEventListener("pointerup", suppress);
  button.addEventListener("click", (event) => {
    suppress(event);
    onActivate();
  });
}

function dimCandidate(candidate: ScanCandidate): void {
  const targets = candidate.dimTargets.length > 0 ? candidate.dimTargets : [candidate.container];
  for (const element of targets) {
    dimElement(element);
  }
}

function undimCandidate(candidate: ScanCandidate): void {
  const targets = candidate.dimTargets.length > 0 ? candidate.dimTargets : [candidate.container];
  for (const element of targets) {
    undimElement(element);
  }
}

function collectCandidates(
  root: Document | Element,
  hostname: string,
  pathname: string,
): ScanCandidate[] {
  if (hostname.startsWith("old.")) {
    return [...collectOldRedditPosts(root, pathname), ...collectOldRedditComments(root)];
  }

  return [
    ...collectCurrentRedditPosts(root, pathname),
    ...collectCurrentRedditComments(root),
  ];
}

function collectCurrentRedditPosts(
  root: Document | Element,
  pathname: string,
): ScanCandidate[] {
  const containers = pickCurrentContainers(root, "shreddit-post", [
    "article[data-testid='post-container']",
    "div[data-testid='post-container']",
  ]);
  const isDetailPage = pathname.includes("/comments/");

  return containers
    .map((container, index) => {
      const controlTarget = findMetadataTarget(container, [
        "[slot='credit-bar']",
        "[data-testid='post-subheader']",
        "[slot='author-metadata']",
        "[data-testid='post_author_line']",
        "faceplate-tracker[noun='post_author']",
        ".tagline",
      ]);
      const contentTargets = collectUniqueElements(container, [
        "a[data-testid='post-title-text']",
        "[slot='title']",
        "h1",
        "h2",
        "h3",
        "[slot='text-body']",
        "div[data-click-id='text']",
        "div[data-adclicklocation='text-body']",
        ".entry .title",
        ".entry .usertext-body",
        ".entry .expando",
      ]);
      const fallbackTarget =
        selectFirst(container, [
          "a[data-testid='post-title-text']",
          "[slot='title']",
          "h1",
          "h2",
          "h3",
          ".entry .tagline",
          ".entry .title",
        ]) ?? container;
      const indicatorTarget = controlTarget ?? fallbackTarget;
      const badgeTarget = findCurrentPostBadgeTarget(container, indicatorTarget);
      const text = collectText(container, [
        "a[data-testid='post-title-text']",
        "[slot='title']",
        "h1",
        "h2",
        "h3",
        "[slot='text-body']",
        "div[data-click-id='text']",
        "div[data-adclicklocation='text-body']",
        ".entry .title",
        ".entry .usertext-body .md",
        ".entry .expando .md",
        "p",
      ]);

      return buildCandidate({
        kind: "post",
        platform: "current",
        container,
        indicatorTarget,
        badgeTarget,
        placement: controlTarget ? "append" : "prepend",
        contentTargets,
        dimTargets: collectCurrentPostDimTargets(container),
        text,
        isMainSubmission: isDetailPage && index === 0,
      });
    })
    .filter((candidate): candidate is ScanCandidate => candidate !== null);
}

function collectCurrentRedditComments(root: Document | Element): ScanCandidate[] {
  const containers = pickCurrentContainers(root, "shreddit-comment", [
    "article[data-testid='comment']",
    "div[data-testid='comment']",
  ]);
  const nestedSelectors = "shreddit-comment, article[data-testid='comment'], div[data-testid='comment']";

  return containers
    .map((container) => {
      const metadataTarget = findMetadataTarget(container, [
        "[slot='commentMeta']",
        "[slot='metadata']",
        "[data-testid='comment_author_line']",
        "faceplate-tracker[noun='comment_author']",
      ]);
      const fallbackTarget =
        selectFirst(container, [
          "[slot='comment']",
          "[data-testid='comment']",
          "p",
        ]) ?? container;
      const threadHost = findThreadGroupHost(container);
      const text = collectText(container, [
        "[slot='comment']",
        "[data-testid='comment']",
        "p",
      ], nestedSelectors);

      return buildCandidate({
        kind: "comment",
        platform: "current",
        container,
        indicatorTarget: metadataTarget ?? fallbackTarget,
        badgeTarget: metadataTarget ?? fallbackTarget,
        placement: metadataTarget ? "append" : "prepend",
        contentTargets: [container],
        dimTargets: collectCurrentCommentDimTargets(container),
        text,
        threadHost,
        threadKey: getThreadKey(threadHost),
      });
    })
    .filter((candidate): candidate is ScanCandidate => candidate !== null);
}

function collectOldRedditPosts(
  root: Document | Element,
  pathname: string,
): ScanCandidate[] {
  const isDetailPage = pathname.includes("/comments/");

  return Array.from(root.querySelectorAll<HTMLElement>(".thing.link"))
    .map((container, index) => {
      const metadataTarget = findMetadataTarget(container, [".entry .tagline"]);
      const indicatorTarget = metadataTarget ?? (selectFirst(container, [".entry"]) ?? container);
      const contentTargets = collectUniqueElements(container, [
        ".entry .usertext-body",
        ".entry .expando",
      ]);
      const text = collectText(container, [
        ".entry .title",
        ".entry .usertext-body .md",
        ".entry .expando .md",
      ]);

      return buildCandidate({
        kind: "post",
        platform: "old",
        container,
        indicatorTarget,
        badgeTarget: indicatorTarget,
        placement: "append",
        contentTargets,
        dimTargets: collectOldPostDimTargets(container),
        text,
        isMainSubmission: isDetailPage && index === 0,
      });
    })
    .filter((candidate): candidate is ScanCandidate => candidate !== null);
}

function collectOldRedditComments(root: Document | Element): ScanCandidate[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".thing.comment"))
    .map((container) => {
      const metadataTarget = findMetadataTarget(container, [".entry .tagline"]);
      const indicatorTarget = metadataTarget ?? (selectFirst(container, [".entry"]) ?? container);
      const contentTargets = collectUniqueElements(container, [".entry .usertext-body", ".entry .md"]);
      const text = collectText(container, [".entry .usertext-body .md", ".entry .md"], ".thing.comment");
      const threadHost = findOldThreadGroupHost(container);

      return buildCandidate({
        kind: "comment",
        platform: "old",
        container,
        indicatorTarget,
        badgeTarget: indicatorTarget,
        placement: "append",
        contentTargets,
        dimTargets: collectOldCommentDimTargets(container),
        text,
        threadHost,
        threadKey: getThreadKey(threadHost),
      });
    })
    .filter((candidate): candidate is ScanCandidate => candidate !== null);
}

function buildCandidate({
  kind,
  platform,
  container,
  indicatorTarget,
  badgeTarget = indicatorTarget,
  placement,
  contentTargets,
  dimTargets = [],
  text,
  isMainSubmission = false,
  threadKey,
  threadHost,
}: {
  kind: CandidateKind;
  platform: PlatformKind;
  container: HTMLElement;
  indicatorTarget: HTMLElement;
  badgeTarget?: HTMLElement;
  placement: Placement;
  contentTargets: HTMLElement[];
  dimTargets?: HTMLElement[];
  text: string;
  isMainSubmission?: boolean;
  threadKey?: string;
  threadHost?: HTMLElement;
}): ScanCandidate | null {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return null;
  }

  return {
    key: getCandidateKey(container),
    kind,
    platform,
    container,
    indicatorTarget,
    badgeTarget,
    placement,
    contentTargets: contentTargets.filter(
      (element) => element !== indicatorTarget && element !== badgeTarget,
    ),
    dimTargets,
    text: normalizedText,
    previewText: createPreviewText(normalizedText),
    isMainSubmission,
    threadKey,
    threadHost,
  };
}

function getCandidateKey(container: HTMLElement): string {
  const existing = candidateKeys.get(container);
  if (existing) {
    return existing;
  }

  const key = `candidate-${nextCandidateId++}`;
  candidateKeys.set(container, key);
  return key;
}

function getThreadKey(host: HTMLElement): string {
  const existing = threadKeys.get(host);
  if (existing) {
    return existing;
  }

  const key = `thread-${nextThreadId++}`;
  threadKeys.set(host, key);
  return key;
}

function createPreviewText(text: string): string {
  return text.length <= 110 ? text : `${text.slice(0, 107).trimEnd()}...`;
}

function findThreadGroupHost(container: HTMLElement): HTMLElement {
  return (
    container.closest<HTMLElement>(
      [
        "[data-testid='comment-thread']",
        "[data-testid='comment-tree']",
        "#comment-tree",
        "[id^='comment-tree-content-anchor-']",
        "shreddit-comment-tree",
        "[slot='comment-tree']",
        "main",
        "body",
      ].join(", "),
    ) ??
    container.parentElement ??
    container
  );
}

function findOldThreadGroupHost(container: HTMLElement): HTMLElement {
  const documentRef = container.ownerDocument;
  const topLevelSiteTable = documentRef.querySelector<HTMLElement>(".commentarea > .sitetable");
  if (topLevelSiteTable) {
    return topLevelSiteTable;
  }

  return (
    container.closest<HTMLElement>(".commentarea .sitetable, .commentarea") ??
    container.parentElement ??
    container
  );
}

function collectCurrentCommentDimTargets(container: HTMLElement): HTMLElement[] {
  const selectors = [
    "[slot='commentMeta']",
    "[slot='metadata']",
    "[data-testid='comment_author_line']",
    "[slot='comment']",
    "[data-testid='comment']",
    "img",
    "faceplate-avatar",
  ];
  const nestedSelectors = "shreddit-comment, article[data-testid='comment'], div[data-testid='comment']";
  const collected = collectUniqueElements(container, selectors).filter((element) => {
    const owner = element.closest<HTMLElement>(nestedSelectors);
    return owner === null || owner === container;
  });

  return collected.length > 0 ? collected : [container];
}

function collectCurrentPostDimTargets(container: HTMLElement): HTMLElement[] {
  const selectors = [
    "[slot='title']",
    "a[data-testid='post-title-text']",
    "[slot='text-body']",
    "div[data-click-id='text']",
    "div[data-adclicklocation='text-body']",
    "[slot='post-media-container']",
    "[data-testid='post-media-container']",
    "img",
    "video",
  ];
  return collectUniqueElements(container, selectors);
}

function collectOldPostDimTargets(container: HTMLElement): HTMLElement[] {
  const directChildren = Array.from(container.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const collected = directChildren.filter((child) =>
    child.matches(".midcol, .entry, .thumbnail"),
  );

  if (collected.length > 0) {
    return collected;
  }

  const entry = container.querySelector<HTMLElement>(":scope > .entry");
  return entry ? [entry] : [container];
}

function collectOldCommentDimTargets(container: HTMLElement): HTMLElement[] {
  const directChildren = Array.from(container.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  const collected = directChildren.filter((child) =>
    child.matches(".midcol, .entry, .thumbnail"),
  );

  if (collected.length > 0) {
    return collected;
  }

  const entry = container.querySelector<HTMLElement>(":scope > .entry");
  return entry ? [entry] : [container];
}

function findMetadataTarget(container: HTMLElement, selectors: string[]): HTMLElement | null {
  const metadataRow = findSelfOrDescendant(container, selectors);
  if (!metadataRow) {
    return null;
  }

  metadataRow.setAttribute(META_ROW_ATTRIBUTE, "true");
  return metadataRow;
}

function findCurrentPostBadgeTarget(
  container: HTMLElement,
  controlTarget: HTMLElement,
): HTMLElement {
  const narrowSelectors = [
    "[slot='author-metadata']",
    "[data-testid='post_author_line']",
    "faceplate-tracker[noun='post_author']",
    ".tagline",
  ];
  const narrowTarget =
    findSelfOrDescendant(controlTarget, narrowSelectors) ??
    findSelfOrDescendant(container, narrowSelectors);
  if (narrowTarget) {
    narrowTarget.setAttribute(META_ROW_ATTRIBUTE, "true");
    return narrowTarget;
  }

  const broadCurrentSelectors = ["[slot='credit-bar']", "[data-testid='post-subheader']"];
  if (
    broadCurrentSelectors.some((selector) => controlTarget.matches(selector)) &&
    controlTarget.childElementCount >= 1
  ) {
    const firstVisualChild = Array.from(controlTarget.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !child.matches("button, [role='button'], faceplate-dropdown-menu, [aria-haspopup='menu']"),
    );
    if (firstVisualChild) {
      firstVisualChild.setAttribute(META_ROW_ATTRIBUTE, "true");
      return firstVisualChild;
    }
  }

  controlTarget.setAttribute(META_ROW_ATTRIBUTE, "true");
  return controlTarget;
}

function findSelfOrDescendant(container: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    if (container.matches(selector)) {
      return container;
    }

    const match = container.querySelector<HTMLElement>(selector);
    if (match) {
      return match;
    }
  }

  return null;
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

function collectText(
  container: HTMLElement,
  selectors: string[],
  nestedSelectors?: string,
): string {
  let elements = selectors.flatMap((selector) =>
    Array.from(container.querySelectorAll<HTMLElement>(selector)),
  );

  if (nestedSelectors) {
    elements = elements.filter((element) => {
      const owner = element.closest<HTMLElement>(nestedSelectors);
      return owner === null || owner === container;
    });
  }

  const collected = elements
    .map((element) => normalizeText(element.textContent ?? ""))
    .filter(Boolean);

  if (collected.length > 0) {
    return normalizeText(collected.join(" "));
  }

  return normalizeText(container.textContent ?? "");
}

function collectUniqueElements(container: HTMLElement, selectors: string[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const elements: HTMLElement[] = [];

  for (const selector of selectors) {
    for (const element of container.querySelectorAll<HTMLElement>(selector)) {
      if (!seen.has(element)) {
        seen.add(element);
        elements.push(element);
      }
    }
  }

  return elements;
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
