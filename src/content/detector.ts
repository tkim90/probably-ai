import { compileRules, findRuleMatches, normalizeText } from "../shared/rules";
import type { CompiledRule, ExtensionSettings, RuleMatch } from "../shared/types";
import { isExtensionContextInvalidated } from "../shared/utils";

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
const TOOLTIP_ATTRIBUTE = "data-probably-ai-tooltip";
const HIGHLIGHT_ATTRIBUTE = "data-probably-ai-highlight";
const BADGE_CANDIDATE_KEY_ATTRIBUTE = "data-probably-ai-candidate-key";
const THREAD_FILTER_TOGGLE_ATTRIBUTE = "data-probably-ai-thread-filter-toggle";
const THREAD_FILTER_ICON_ATTRIBUTE = "data-probably-ai-thread-filter-icon";
const THREAD_FILTER_LABEL_ATTRIBUTE = "data-probably-ai-thread-filter-label";
const SHOW_FILTERED_COMMENTS_ICON = "baseline-remove-red-eye.svg";
const HIDE_FILTERED_COMMENTS_ICON = "baseline-disabled-visible.svg";
const BADGE_WARNING_ICON = "baseline-warning.svg";
const SHOW_FILTERED_COMMENTS_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#000000" style="opacity:1;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5s5 2.24 5 5s-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3s3-1.34 3-3s-1.34-3-3-3"/></svg>';
const HIDE_FILTERED_COMMENTS_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#000000" style="opacity:1;"><path d="M21.99 12.34c.01-.11.01-.23.01-.34c0-5.52-4.48-10-10-10S2 6.48 2 12c0 5.17 3.93 9.43 8.96 9.95a9.3 9.3 0 0 1-2.32-2.68A8.01 8.01 0 0 1 4 12c0-1.85.63-3.55 1.69-4.9l5.66 5.66c.56-.4 1.17-.73 1.82-1L7.1 5.69A7.9 7.9 0 0 1 12 4c4.24 0 7.7 3.29 7.98 7.45c.71.22 1.39.52 2.01.89M17 13c-3.18 0-5.9 1.87-7 4.5c1.1 2.63 3.82 4.5 7 4.5s5.9-1.87 7-4.5c-1.1-2.63-3.82-4.5-7-4.5m0 7a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 1 0 5m1.5-2.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5s1.5.67 1.5 1.5"/></svg>';
const BADGE_WARNING_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#D4A017" style="opacity:1;"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>';

type Placement = "after" | "prepend" | "append";
type CandidateKind = "post" | "comment";
type PlatformKind = "current" | "old";

interface CollectedTextPart {
  element: HTMLElement;
  text: string;
}

interface HighlightPart extends CollectedTextPart {
  start: number;
  end: number;
}

interface ScanCandidate {
  key: string;
  kind: CandidateKind;
  platform: PlatformKind;
  container: HTMLElement;
  contentRoot: HTMLElement;
  indicatorTarget: HTMLElement;
  badgeTarget: HTMLElement;
  placement: Placement;
  contentTargets: HTMLElement[];
  dimTargets: HTMLElement[];
  highlightParts: HighlightPart[];
  matchText: string;
  text: string;
  previewText: string;
  isMainSubmission: boolean;
  threadKey?: string;
  threadHost?: HTMLElement;
}

interface CandidateState {
  candidate: ScanCandidate;
  matched: boolean;
  matchedRules: CompiledRule[];
  ruleMatches: RuleMatch[];
}

interface ThreadGroup {
  key: string;
  platform: PlatformKind;
  host: HTMLElement;
  anchor: HTMLElement;
  comments: CandidateState[];
}

function makeKeyGenerator(prefix: string): (element: HTMLElement) => string {
  let nextId = 1;
  const keys = new WeakMap<HTMLElement, string>();

  return (element: HTMLElement): string => {
    const existing = keys.get(element);
    if (existing) {
      return existing;
    }

    const key = `${prefix}-${nextId++}`;
    keys.set(element, key);
    return key;
  };
}

const getCandidateKey = makeKeyGenerator("candidate");
const getThreadKey = makeKeyGenerator("thread");
const expandedCandidateKeys = new Set<string>();
const revealedThreadKeys = new Set<string>();
let activeCandidates = new Map<string, ScanCandidate>();
let activeCandidateStates = new Map<string, CandidateState>();
let activeThreadGroups = new Map<string, ThreadGroup>();
let activeHighlightedCandidateKey: string | null = null;
let activeHoveredCandidateKey: string | null = null;
let activeTooltipCandidateKey: string | null = null;
let hoverHideTimeoutId: number | null = null;
let lastPointerPosition: { x: number; y: number } | null = null;
const FALLBACK_ICON_URLS: Record<string, string> = {
  [SHOW_FILTERED_COMMENTS_ICON]: createSvgDataUrl(SHOW_FILTERED_COMMENTS_ICON_SVG),
  [HIDE_FILTERED_COMMENTS_ICON]: createSvgDataUrl(HIDE_FILTERED_COMMENTS_ICON_SVG),
  [BADGE_WARNING_ICON]: createSvgDataUrl(BADGE_WARNING_ICON_SVG),
};
const HOVER_HIDE_DELAY_MS = 90;

export const BADGE_SELECTOR = `[${BADGE_ATTRIBUTE}="true"]`;
export const COLLAPSE_SELECTOR = `[${COLLAPSE_ATTRIBUTE}="true"]`;
export const TOGGLE_SELECTOR = `[${TOGGLE_ATTRIBUTE}="true"]`;
export const THREAD_FILTER_SELECTOR = `[${THREAD_FILTER_ATTRIBUTE}="true"]`;
export const THREAD_FILTER_TOGGLE_SELECTOR = `[${THREAD_FILTER_TOGGLE_ATTRIBUTE}="true"]`;
export const TOOLTIP_SELECTOR = `[${TOOLTIP_ATTRIBUTE}="true"]`;
export const HIGHLIGHT_SELECTOR = `[${HIGHLIGHT_ATTRIBUTE}="true"]`;
export const PROCESSED_SELECTOR = `[${PROCESSED_ATTRIBUTE}="true"]`;
export const INTERNAL_STYLE_ID = STYLE_ELEMENT_ID;

export function clearInjectedUi(root: ParentNode = document): void {
  removeTooltip({ clearHoverState: true });
  removeHoverHighlights(root);
  root.querySelectorAll<HTMLElement>(TOOLTIP_SELECTOR).forEach((el) => el.remove());
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
  ensureTooltipListeners(documentRef);
  const compiledRules = compileRules(settings.rules);
  const candidates = collectCandidates(root, hostname, pathname);
  const candidateStates = candidates.map((candidate) => {
    const ruleMatches =
      settings.enabled && candidate.matchText.length > 0
        ? findRuleMatches(candidate.matchText, compiledRules)
        : [];
    const matchedRules = Array.from(
      new Map(ruleMatches.map((match) => [match.rule.id, match.rule])).values(),
    );
    return {
      candidate,
      matched: matchedRules.length > 0,
      matchedRules,
      ruleMatches,
    };
  });
  const nextActiveCandidates = new Map<string, ScanCandidate>();
  const nextActiveCandidateStates = new Map<string, CandidateState>();
  const nextThreadGroups = new Map<string, ThreadGroup>();
  const threadAnchors = new Map<string, HTMLElement>();
  let matchCount = 0;

  for (const state of candidateStates) {
    const { candidate, matched } = state;
    const threadManaged = isThreadManagedComment(candidate, settings.autoHideDetected);
    nextActiveCandidates.set(candidate.key, candidate);
    nextActiveCandidateStates.set(candidate.key, state);
    candidate.container.setAttribute(PROCESSED_ATTRIBUTE, "true");

    if (matched) {
      matchCount += 1;
    }

    if (candidate.threadKey && !threadAnchors.has(candidate.threadKey)) {
      threadAnchors.set(candidate.threadKey, candidate.container);
    }

    if (threadManaged && candidate.platform === "current") {
      syncBadge(candidate, matched, state.matchedRules);
      syncCollapse(candidate, false, false);

      if (!matched) {
        revealElement(candidate.container);
        applyCandidateDim(candidate, undimElement);
      } else {
        addToThreadGroup(nextThreadGroups, threadAnchors, candidate, state);
      }

      continue;
    }

    syncBadge(candidate, matched, state.matchedRules);
    syncCollapse(candidate, matched, shouldIndividuallyHide(candidate, settings.autoHideDetected));

    if (matched && candidate.kind === "post" && !candidate.isMainSubmission && settings.autoHideDetected) {
      applyCandidateDim(candidate, dimElement);
    } else {
      applyCandidateDim(candidate, undimElement);
    }

    if (threadManaged) {
      if (!matched) {
        revealElement(candidate.container);
        applyCandidateDim(candidate, undimElement);
      } else {
        addToThreadGroup(nextThreadGroups, threadAnchors, candidate, state);
      }
    }
  }

  syncThreadGroups(nextThreadGroups, settings.autoHideDetected);
  activeCandidates = nextActiveCandidates;
  activeCandidateStates = nextActiveCandidateStates;
  activeThreadGroups = nextThreadGroups;
  pruneState();
  syncHoveredTooltip(documentRef);
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
        applyCandidateDim(state.candidate, undimElement);
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

  if (activeHighlightedCandidateKey && !activeCandidateStates.has(activeHighlightedCandidateKey)) {
    activeHighlightedCandidateKey = null;
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
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      padding: 0.14rem 0.45rem;
      border-radius: 999px;
      background: #363636;
      color: #f5f1e8;
      font-size: 0.72rem;
      font-weight: 400;
      line-height: 1;
      vertical-align: middle;
      white-space: nowrap;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .probably-ai-badge > span {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    [${META_ROW_ATTRIBUTE}="true"] .probably-ai-badge {
      margin: 0 0 0 0.45rem;
    }

    .probably-ai-tooltip {
      position: absolute;
      z-index: 2147483647;
      max-width: 360px;
      min-width: 180px;
      padding: 0.6rem 0.75rem;
      border-radius: 8px;
      background: #2a2a2a;
      color: #f5f1e8;
      font-size: 0.78rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      pointer-events: none;
    }

    .probably-ai-tooltip-header {
      font-weight: 600;
      margin-bottom: 0.35rem;
      color: #D4A017;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .probably-ai-tooltip-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .probably-ai-tooltip-item {
      padding: 0.18rem 0;
      word-break: break-word;
      color: #f5f1e8;
    }

    .probably-ai-tooltip-item::before {
      content: "\\2022";
      margin-right: 0.4rem;
      color: #D4A017;
    }

    .probably-ai-highlight {
      background: rgba(255, 235, 59, 0.5);
      border-radius: 0.18em;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
      color: #111111;
      padding: 0;
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

function addToThreadGroup(
  nextThreadGroups: Map<string, ThreadGroup>,
  threadAnchors: Map<string, HTMLElement>,
  candidate: ScanCandidate,
  state: CandidateState,
): void {
  if (!candidate.threadKey || !candidate.threadHost) {
    return;
  }

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

function isThreadManagedComment(candidate: ScanCandidate, autoHideDetected: boolean): boolean {
  return autoHideDetected && candidate.kind === "comment";
}

function shouldIndividuallyHide(
  candidate: ScanCandidate,
  autoHideDetected: boolean,
): boolean {
  return autoHideDetected && candidate.kind === "comment" && candidate.platform === "current";
}

function syncBadge(candidate: ScanCandidate, matched: boolean, matchedRules: CompiledRule[]): void {
  const existingBadge = candidate.container.querySelector<HTMLElement>(BADGE_SELECTOR);
  if (!matched) {
    existingBadge?.remove();
    return;
  }

  const rulePatterns = JSON.stringify(matchedRules.map((r) => r.pattern));

  if (existingBadge) {
    existingBadge.dataset.matchedRules = rulePatterns;
    existingBadge.setAttribute(BADGE_CANDIDATE_KEY_ATTRIBUTE, candidate.key);
    if (existingBadge.parentElement !== candidate.badgeTarget) {
      moveIndicator(existingBadge, candidate.badgeTarget, candidate.placement);
    }

    return;
  }

  const doc = candidate.badgeTarget.ownerDocument;
  const badge = doc.createElement("span");
  badge.className = "probably-ai-badge";
  badge.setAttribute(BADGE_ATTRIBUTE, "true");
  badge.setAttribute(BADGE_CANDIDATE_KEY_ATTRIBUTE, candidate.key);
  badge.dataset.matchedRules = rulePatterns;

  const iconWrapper = doc.createElement("span");
  iconWrapper.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="#D4A017"><path d="M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>';
  iconWrapper.style.display = "flex";
  badge.appendChild(iconWrapper);
  badge.appendChild(doc.createTextNode("Probably AI"));

  moveIndicator(badge, candidate.badgeTarget, candidate.placement);
}

let activeTooltip: HTMLElement | null = null;
let tooltipListenersAttached = false;

function ensureTooltipListeners(documentRef: Document): void {
  if (tooltipListenersAttached) {
    return;
  }
  tooltipListenersAttached = true;

  documentRef.body.addEventListener("mousemove", (event) => {
    updatePointerPosition(event);
  });

  documentRef.body.addEventListener("mouseover", (event) => {
    updatePointerPosition(event);
    const badge = (event.target as HTMLElement).closest?.<HTMLElement>(BADGE_SELECTOR);
    const relatedTarget = event.relatedTarget;
    if (badge && !(relatedTarget instanceof Node && badge.contains(relatedTarget))) {
      clearScheduledTooltipHide();
      activeHoveredCandidateKey = getBadgeCandidateKey(badge);
      showTooltip(badge);
    }
  });

  documentRef.body.addEventListener("mouseout", (event) => {
    updatePointerPosition(event);
    const badge = (event.target as HTMLElement).closest?.<HTMLElement>(BADGE_SELECTOR);
    const relatedTarget = event.relatedTarget;
    if (badge && !(relatedTarget instanceof Node && badge.contains(relatedTarget))) {
      scheduleTooltipHide(documentRef);
    }
  });
}

function showTooltip(badge: HTMLElement): void {
  const raw = badge.dataset.matchedRules;
  if (!raw) {
    return;
  }

  let patterns: string[];
  try {
    patterns = JSON.parse(raw);
  } catch {
    return;
  }
  if (patterns.length === 0) {
    return;
  }

  const doc = badge.ownerDocument;
  const candidateKey = badge.getAttribute(BADGE_CANDIDATE_KEY_ATTRIBUTE) ?? "";
  activeHoveredCandidateKey = candidateKey || activeHoveredCandidateKey;

  let tooltip = activeTooltip;
  if (!tooltip || activeTooltipCandidateKey !== candidateKey) {
    removeTooltip({ clearHoverState: false });
    tooltip = doc.createElement("div");
    tooltip.className = "probably-ai-tooltip";
    tooltip.setAttribute(TOOLTIP_ATTRIBUTE, "true");
    doc.body.appendChild(tooltip);
  }

  applyHoverHighlights(candidateKey);
  populateTooltip(tooltip, patterns);
  positionTooltip(tooltip, badge);
  activeTooltip = tooltip;
  activeTooltipCandidateKey = candidateKey;
}

function populateTooltip(tooltip: HTMLElement, patterns: string[]): void {
  tooltip.replaceChildren();

  const doc = tooltip.ownerDocument;
  const header = doc.createElement("div");
  header.className = "probably-ai-tooltip-header";
  header.textContent = "Matched rules";
  tooltip.appendChild(header);

  const list = doc.createElement("ul");
  list.className = "probably-ai-tooltip-list";
  for (const pattern of patterns) {
    const item = doc.createElement("li");
    item.className = "probably-ai-tooltip-item";
    item.textContent = pattern;
    list.appendChild(item);
  }
  tooltip.appendChild(list);
}

function removeTooltip(options: { clearHoverState?: boolean } = {}): void {
  clearScheduledTooltipHide();
  activeTooltip?.remove();
  activeTooltip = null;
  activeTooltipCandidateKey = null;
  removeHoverHighlights();

  if (options.clearHoverState ?? true) {
    activeHoveredCandidateKey = null;
  }
}

function syncHoveredTooltip(documentRef: Document): void {
  if (!activeHoveredCandidateKey) {
    return;
  }

  const state = activeCandidateStates.get(activeHoveredCandidateKey);
  if (!state?.matched) {
    removeTooltip({ clearHoverState: true });
    return;
  }

  const badge = findBadgeByCandidateKey(documentRef, activeHoveredCandidateKey);
  if (!badge) {
    removeTooltip({ clearHoverState: true });
    return;
  }

  showTooltip(badge);
}

function scheduleTooltipHide(documentRef: Document): void {
  clearScheduledTooltipHide();
  hoverHideTimeoutId = window.setTimeout(() => {
    hoverHideTimeoutId = null;

    if (isPointerOverHoveredBadge(documentRef)) {
      const hoveredBadge = findBadgeByCandidateKey(documentRef, activeHoveredCandidateKey ?? "");
      if (hoveredBadge) {
        showTooltip(hoveredBadge);
        return;
      }
    }

    removeTooltip({ clearHoverState: true });
  }, HOVER_HIDE_DELAY_MS);
}

function clearScheduledTooltipHide(): void {
  if (hoverHideTimeoutId !== null) {
    window.clearTimeout(hoverHideTimeoutId);
    hoverHideTimeoutId = null;
  }
}

function updatePointerPosition(event: MouseEvent): void {
  lastPointerPosition = {
    x: event.clientX,
    y: event.clientY,
  };
}

function isPointerOverHoveredBadge(documentRef: Document): boolean {
  if (!activeHoveredCandidateKey || !lastPointerPosition || !documentRef.elementFromPoint) {
    return false;
  }

  const element = documentRef.elementFromPoint(lastPointerPosition.x, lastPointerPosition.y);
  const badge = element?.closest?.<HTMLElement>(BADGE_SELECTOR);
  return getBadgeCandidateKey(badge) === activeHoveredCandidateKey;
}

function getBadgeCandidateKey(badge: HTMLElement | null): string {
  return badge?.getAttribute(BADGE_CANDIDATE_KEY_ATTRIBUTE) ?? "";
}

function findBadgeByCandidateKey(root: ParentNode, candidateKey: string): HTMLElement | null {
  if (!candidateKey) {
    return null;
  }

  return (
    Array.from(root.querySelectorAll<HTMLElement>(BADGE_SELECTOR)).find(
      (badge) => getBadgeCandidateKey(badge) === candidateKey,
    ) ?? null
  );
}

function applyHoverHighlights(candidateKey: string): void {
  removeHoverHighlights();

  if (!candidateKey) {
    return;
  }

  const state = activeCandidateStates.get(candidateKey);
  if (!state || state.ruleMatches.length === 0) {
    return;
  }

  const highlightRanges = mapRuleMatchesToParts(state.candidate, state.ruleMatches);
  for (const [part, ranges] of highlightRanges) {
    applyHighlightRanges(part.element, ranges);
  }

  activeHighlightedCandidateKey = candidateKey;
}

function removeHoverHighlights(root: ParentNode = document): void {
  const wrappers = root.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR);
  wrappers.forEach((wrapper) => unwrapElement(wrapper));
  activeHighlightedCandidateKey = null;
}

function mapRuleMatchesToParts(
  candidate: ScanCandidate,
  ruleMatches: RuleMatch[],
): Map<HighlightPart, Array<{ start: number; end: number }>> {
  const highlightRanges = new Map<HighlightPart, Array<{ start: number; end: number }>>();

  for (const match of ruleMatches) {
    for (const part of candidate.highlightParts) {
      if (match.end <= part.start || match.start >= part.end) {
        continue;
      }

      const localStart = Math.max(match.start, part.start) - part.start;
      const localEnd = Math.min(match.end, part.end) - part.start;
      if (localEnd <= localStart) {
        continue;
      }

      const existing = highlightRanges.get(part) ?? [];
      existing.push({ start: localStart, end: localEnd });
      highlightRanges.set(part, existing);
    }
  }

  return new Map(
    Array.from(highlightRanges.entries()).map(([part, ranges]) => [part, mergeRanges(ranges)]),
  );
}

function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (ranges.length <= 1) {
    return ranges;
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const previous = merged[merged.length - 1];
    if (range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function applyHighlightRanges(
  element: HTMLElement,
  ranges: Array<{ start: number; end: number }>,
): void {
  if (ranges.length === 0) {
    return;
  }

  const rawText = element.textContent ?? "";
  const normalized = normalizeTextWithMap(rawText);

  for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
    const mapped = mapNormalizedRangeToRawRange(normalized, range);
    if (!mapped || mapped.end <= mapped.start) {
      continue;
    }

    wrapTextRange(element, mapped.start, mapped.end);
  }
}

function mapNormalizedRangeToRawRange(
  normalized: ReturnType<typeof normalizeTextWithMap>,
  range: { start: number; end: number },
): { start: number; end: number } | null {
  const startSpan = normalized.map[range.start];
  const endSpan = normalized.map[range.end - 1];

  if (!startSpan || !endSpan) {
    return null;
  }

  return {
    start: startSpan.start,
    end: endSpan.end,
  };
}

function wrapTextRange(element: HTMLElement, start: number, end: number): void {
  const doc = element.ownerDocument;
  const boundary = resolveTextBoundary(element, start, false);
  const endBoundary = resolveTextBoundary(element, end, true);

  if (!doc || !boundary || !endBoundary) {
    return;
  }

  const range = doc.createRange();
  range.setStart(boundary.node, boundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);

  if (range.collapsed) {
    return;
  }

  const wrapper = doc.createElement("mark");
  wrapper.className = "probably-ai-highlight";
  wrapper.setAttribute(HIGHLIGHT_ATTRIBUTE, "true");

  const fragment = range.extractContents();
  if (!fragment.textContent?.length) {
    return;
  }

  wrapper.appendChild(fragment);
  range.insertNode(wrapper);
}

function resolveTextBoundary(
  element: HTMLElement,
  offset: number,
  isEnd: boolean,
): { node: Text; offset: number } | null {
  const textNodes = collectTextNodes(element);
  let remaining = offset;

  for (const node of textNodes) {
    const length = node.textContent?.length ?? 0;
    if (remaining < length) {
      return {
        node,
        offset: remaining,
      };
    }

    if (remaining === length) {
      return {
        node,
        offset: isEnd ? length : remaining,
      };
    }

    remaining -= length;
  }

  const lastNode = textNodes[textNodes.length - 1];
  if (!lastNode) {
    return null;
  }

  return {
    node: lastNode,
    offset: lastNode.textContent?.length ?? 0,
  };
}

function collectTextNodes(element: HTMLElement): Text[] {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    if (current.textContent && current.textContent.length > 0) {
      nodes.push(current as Text);
    }

    current = walker.nextNode();
  }

  return nodes;
}

function unwrapElement(element: HTMLElement): void {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
  parent.normalize();
}

function positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  tooltip.style.visibility = "hidden";
  tooltip.style.position = "absolute";
  tooltip.style.top = "0";
  tooltip.style.left = "0";

  const tooltipRect = tooltip.getBoundingClientRect();

  let top = rect.bottom + scrollY + 6;
  let left = rect.left + scrollX;

  if (left + tooltipRect.width > scrollX + window.innerWidth - 8) {
    left = scrollX + window.innerWidth - tooltipRect.width - 8;
  }
  if (left < scrollX + 8) {
    left = scrollX + 8;
  }

  if (rect.bottom + tooltipRect.height + 6 > window.innerHeight) {
    top = rect.top + scrollY - tooltipRect.height - 6;
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.visibility = "visible";
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
      applyCandidateDim(state.candidate, dimElement);
    } else {
      applyCandidateDim(state.candidate, undimElement);
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

function setElementStyle(
  element: HTMLElement,
  flagAttr: string,
  originalAttr: string,
  cssProp: string,
  value: string,
): void {
  if (element.getAttribute(flagAttr) === "true") {
    return;
  }

  element.setAttribute(flagAttr, "true");
  element.setAttribute(originalAttr, element.style.getPropertyValue(cssProp));
  element.style.setProperty(cssProp, value);
}

function restoreElementStyle(
  element: HTMLElement,
  flagAttr: string,
  originalAttr: string,
  cssProp: string,
): void {
  if (element.getAttribute(flagAttr) !== "true") {
    return;
  }

  const original = element.getAttribute(originalAttr) ?? "";
  if (original) {
    element.style.setProperty(cssProp, original);
  } else {
    element.style.removeProperty(cssProp);
  }

  element.removeAttribute(flagAttr);
  element.removeAttribute(originalAttr);
}

function hideElement(element: HTMLElement): void {
  if (element.getAttribute(HIDDEN_ATTRIBUTE) === "true") return;
  element.setAttribute(HIDDEN_ATTRIBUTE, "true");
  element.setAttribute(ORIGINAL_DISPLAY_ATTRIBUTE, element.style.cssText);
  Object.assign(element.style, {
    visibility: "hidden",
    height: "0",
    overflow: "hidden",
    minHeight: "0",
    padding: "0",
    margin: "0",
  });
}

function revealElement(element: HTMLElement): void {
  if (element.getAttribute(HIDDEN_ATTRIBUTE) !== "true") return;
  element.style.cssText = element.getAttribute(ORIGINAL_DISPLAY_ATTRIBUTE) ?? "";
  element.removeAttribute(HIDDEN_ATTRIBUTE);
  element.removeAttribute(ORIGINAL_DISPLAY_ATTRIBUTE);
}

function dimElement(element: HTMLElement): void {
  setElementStyle(element, DIMMED_ATTRIBUTE, ORIGINAL_OPACITY_ATTRIBUTE, "opacity", "0.56");
}

function undimElement(element: HTMLElement): void {
  restoreElementStyle(element, DIMMED_ATTRIBUTE, ORIGINAL_OPACITY_ATTRIBUTE, "opacity");
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

function applyCandidateDim(
  candidate: ScanCandidate,
  apply: (element: HTMLElement) => void,
): void {
  const targets = candidate.dimTargets.length > 0 ? candidate.dimTargets : [candidate.container];
  for (const element of targets) {
    apply(element);
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
      const textParts = collectTextParts(container, [
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
      const text = joinTextParts(textParts);

      return buildCandidate({
        kind: "post",
        platform: "current",
        container,
        contentRoot: container,
        indicatorTarget,
        badgeTarget,
        placement: controlTarget ? "append" : "prepend",
        contentTargets,
        dimTargets: collectCurrentPostDimTargets(container),
        textParts,
        text,
        isMainSubmission: isDetailPage && index === 0,
      });
    })
    .filter((candidate): candidate is ScanCandidate => candidate !== null);
}

function collectCurrentRedditComments(root: Document | Element): ScanCandidate[] {
  const commentSources = collectCurrentCommentSources(root);
  const nestedSelectors = "shreddit-comment, article[data-testid='comment'], div[data-testid='comment']";

  return commentSources
    .map(({ container, contentRoot }) => {
      const metadataTarget = findMetadataTarget(contentRoot, [
        "[slot='commentMeta']",
        "[slot='metadata']",
        "[data-testid='comment_author_line']",
        "faceplate-tracker[noun='comment_author']",
      ]);
      const fallbackTarget =
        selectFirst(contentRoot, [
          "[slot='comment']",
          "[data-testid='comment']",
          "p",
        ]) ?? contentRoot;
      const threadHost = findThreadGroupHost(container);
      const textParts = collectTextParts(contentRoot, [
        "[slot='comment']",
        "[data-testid='comment']",
        "p",
      ], nestedSelectors);
      const text = joinTextParts(textParts);

      return buildCandidate({
        kind: "comment",
        platform: "current",
        container,
        contentRoot,
        indicatorTarget: metadataTarget ?? fallbackTarget,
        badgeTarget: metadataTarget ?? fallbackTarget,
        placement: metadataTarget ? "append" : "prepend",
        contentTargets: [container],
        dimTargets: collectCurrentCommentDimTargets(contentRoot),
        textParts,
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
      const textParts = collectTextParts(container, [
        ".entry .title",
        ".entry .usertext-body .md",
        ".entry .expando .md",
      ]);
      const text = joinTextParts(textParts);

      return buildCandidate({
        kind: "post",
        platform: "old",
        container,
        contentRoot: container,
        indicatorTarget,
        badgeTarget: indicatorTarget,
        placement: "append",
        contentTargets,
        dimTargets: collectOldDimTargets(container),
        textParts,
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
      const textParts = collectTextParts(
        container,
        [".entry .usertext-body .md", ".entry .md"],
        ".thing.comment",
      );
      const text = joinTextParts(textParts);
      const threadHost = findOldThreadGroupHost(container);

      return buildCandidate({
        kind: "comment",
        platform: "old",
        container,
        contentRoot: container,
        indicatorTarget,
        badgeTarget: indicatorTarget,
        placement: "append",
        contentTargets,
        dimTargets: collectOldDimTargets(container),
        textParts,
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
  contentRoot,
  indicatorTarget,
  badgeTarget = indicatorTarget,
  placement,
  contentTargets,
  dimTargets = [],
  textParts,
  text: matchText,
  isMainSubmission = false,
  threadKey,
  threadHost,
}: {
  kind: CandidateKind;
  platform: PlatformKind;
  container: HTMLElement;
  contentRoot: HTMLElement;
  indicatorTarget: HTMLElement;
  badgeTarget?: HTMLElement;
  placement: Placement;
  contentTargets: HTMLElement[];
  dimTargets?: HTMLElement[];
  textParts: CollectedTextPart[];
  text: string;
  isMainSubmission?: boolean;
  threadKey?: string;
  threadHost?: HTMLElement;
}): ScanCandidate | null {
  const normalizedMatchText = matchText.trim();
  const normalizedText = normalizeText(normalizedMatchText);
  if (!normalizedText) {
    return null;
  }

  return {
    key: getCandidateKey(container),
    kind,
    platform,
    container,
    contentRoot,
    indicatorTarget,
    badgeTarget,
    placement,
    contentTargets: contentTargets.filter(
      (element) => element !== indicatorTarget && element !== badgeTarget,
    ),
    dimTargets,
    highlightParts: buildHighlightParts(textParts),
    matchText: normalizedMatchText,
    text: normalizedText,
    previewText: createPreviewText(normalizedText),
    isMainSubmission,
    threadKey,
    threadHost,
  };
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

function collectOldDimTargets(container: HTMLElement): HTMLElement[] {
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

function collectCurrentCommentSources(
  root: Document | Element,
): Array<{ container: HTMLElement; contentRoot: HTMLElement }> {
  const preferred = Array.from(root.querySelectorAll<HTMLElement>("shreddit-comment"));
  if (preferred.length > 0) {
    return preferred.map((container) => ({
      container,
      contentRoot: container,
    }));
  }

  const fallbackRoots = [
    ...root.querySelectorAll<HTMLElement>("article[data-testid='comment'], div[data-testid='comment']"),
  ];
  const sources = new Map<HTMLElement, { container: HTMLElement; contentRoot: HTMLElement }>();

  for (const contentRoot of fallbackRoots) {
    const container = resolveCurrentCommentContainer(contentRoot);
    if (!sources.has(container)) {
      sources.set(container, {
        container,
        contentRoot,
      });
    }
  }

  return [...sources.values()];
}

function resolveCurrentCommentContainer(contentRoot: HTMLElement): HTMLElement {
  const commentHost = contentRoot.closest<HTMLElement>("shreddit-comment");
  if (commentHost) {
    return commentHost;
  }

  return contentRoot.parentElement ?? contentRoot;
}

function buildHighlightParts(parts: CollectedTextPart[]): HighlightPart[] {
  const highlightParts: HighlightPart[] = [];
  let offset = 0;

  for (const part of parts) {
    const start = offset;
    const end = start + part.text.length;
    highlightParts.push({
      ...part,
      start,
      end,
    });
    offset = end + 2;
  }

  return highlightParts;
}

function collectTextParts(
  container: HTMLElement,
  selectors: string[],
  nestedSelectors?: string,
): CollectedTextPart[] {
  let elements = selectors.flatMap((selector) =>
    Array.from(container.querySelectorAll<HTMLElement>(selector)),
  );

  if (nestedSelectors) {
    elements = elements.filter((element) => {
      const owner = element.closest<HTMLElement>(nestedSelectors);
      return owner === null || owner === container;
    });
  }

  const uniqueElements = Array.from(new Set(elements));
  const leafElements = uniqueElements.filter(
    (element) => !uniqueElements.some((other) => other !== element && element.contains(other)),
  );
  const collected = leafElements
    .map((element) => ({
      element,
      text: normalizeText(element.textContent ?? ""),
    }))
    .filter((part) => part.text.length > 0);

  if (collected.length > 0) {
    return collected;
  }

  const fallbackText = normalizeText(container.textContent ?? "");
  return fallbackText.length > 0
    ? [
        {
          element: container,
          text: fallbackText,
        },
      ]
    : [];
}

function joinTextParts(parts: CollectedTextPart[]): string {
  return parts.map((part) => part.text).join("\n\n");
}

function normalizeTextWithMap(
  value: string,
): {
  text: string;
  map: Array<{ start: number; end: number }>;
} {
  const output: string[] = [];
  const map: Array<{ start: number; end: number }> = [];
  let index = 0;

  while (index < value.length) {
    if (/\s/u.test(value[index])) {
      const start = index;
      while (index < value.length && /\s/u.test(value[index])) {
        index += 1;
      }

      if (output.length > 0 && index < value.length) {
        output.push(" ");
        map.push({ start, end: index });
      }

      continue;
    }

    output.push(value[index]);
    map.push({ start: index, end: index + 1 });
    index += 1;
  }

  return {
    text: output.join(""),
    map,
  };
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
