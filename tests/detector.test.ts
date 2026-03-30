import { cloneDefaultRules } from "../src/shared/defaultRules";
import {
  BADGE_SELECTOR,
  COLLAPSE_SELECTOR,
  THREAD_FILTER_SELECTOR,
  THREAD_FILTER_TOGGLE_SELECTOR,
  TOGGLE_SELECTOR,
  scanRedditDocument,
  toggleCandidateExpanded,
} from "../src/content/detector";
import type { ExtensionSettings } from "../src/shared/types";

function createSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    enabled: true,
    autoHideDetected: false,
    rules: cloneDefaultRules(),
    ...overrides,
  };
}

describe("scanRedditDocument", () => {
  it("badges current Reddit posts in the metadata row", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <div slot="credit-bar">
          <span>u/example</span>
          <span>1 day ago</span>
        </div>
        <a slot="title">This changes everything for solo founders</a>
        <div slot="text-body">No body</div>
      </shreddit-post>
    `;

    const matches = scanRedditDocument(document, createSettings(), "www.reddit.com", "/r/test/");
    const metadataRow = document.querySelector<HTMLElement>("[slot='credit-bar']");

    expect(matches).toBe(1);
    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
    expect(metadataRow?.querySelector(BADGE_SELECTOR)).not.toBeNull();
  });

  it("auto-hides feed posts and keeps the show button visible", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <div slot="credit-bar">
          <span>u/example</span>
          <span>1 day ago</span>
        </div>
        <a slot="title">This changes everything for solo founders</a>
        <div slot="text-body">Founders should validate with real customers first.</div>
        <div data-testid="post-actions">actions</div>
      </shreddit-post>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/",
    );

    const title = document.querySelector<HTMLElement>("[slot='title']");
    const body = document.querySelector<HTMLElement>("[slot='text-body']");
    const actions = document.querySelector<HTMLElement>("[data-testid='post-actions']");
    const control = document.querySelector<HTMLElement>(COLLAPSE_SELECTOR);
    const button = document.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR);
    const preview = document.querySelector<HTMLElement>("[data-probably-ai-preview='true']");

    expect(control).not.toBeNull();
    expect(control?.className).toContain("probably-ai-post-collapse");
    expect(button?.textContent).toBe("Show");
    expect(button && !title?.contains(button)).toBe(true);
    expect(preview?.textContent).toContain("This changes everything for solo founders");
    expect(title?.style.display).toBe("none");
    expect(body?.style.display).toBe("none");
    expect(actions?.style.display ?? "").toBe("");
  });

  it("does not auto-hide the main submission on a post page", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <div slot="credit-bar">
          <span>u/example</span>
          <span>1 day ago</span>
        </div>
        <a slot="title">This changes everything for solo founders</a>
        <div slot="text-body">Founders should validate with real customers first.</div>
      </shreddit-post>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
    expect(document.querySelectorAll(COLLAPSE_SELECTOR)).toHaveLength(0);
    expect(document.querySelector<HTMLElement>("[slot='title']")?.style.display ?? "").toBe("");
  });

  it("uses a thread-level filtered-comment control for current Reddit comments at the top of the thread", () => {
    document.body.innerHTML = `
      <div data-testid="comment-thread">
        <shreddit-comment>
          <div slot="commentMeta">
            <span>u/example</span>
            <span>1 day ago</span>
          </div>
          <div slot="comment">It’s not search. It’s discovery.</div>
        </shreddit-comment>
        <shreddit-comment>
          <div slot="commentMeta">
            <span>u/other</span>
            <span>1 day ago</span>
          </div>
          <div slot="comment">This changes everything for productivity.</div>
        </shreddit-comment>
      </div>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );

    const button = document.querySelector<HTMLButtonElement>(THREAD_FILTER_TOGGLE_SELECTOR);
    const thread = document.querySelector<HTMLElement>("[data-testid='comment-thread']");
    const comments = document.querySelectorAll<HTMLElement>("shreddit-comment");
    const styles = document.head.textContent ?? "";

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(0);
    expect(document.querySelectorAll(COLLAPSE_SELECTOR)).toHaveLength(0);
    expect(document.querySelectorAll(THREAD_FILTER_SELECTOR)).toHaveLength(1);
    expect(thread?.firstElementChild?.matches(THREAD_FILTER_SELECTOR)).toBe(true);
    expect(button?.textContent).toBe("Show 2 filtered comments");
    expect(styles).toContain("justify-content: center");
    expect(styles).toContain("color: #111111");
    comments.forEach((comment) => expect(comment.style.display).toBe("none"));
  });

  it("reveals filtered comments dimmed and can hide them again", () => {
    document.body.innerHTML = `
      <div data-testid="comment-thread">
        <shreddit-comment>
          <div slot="commentMeta">
            <img alt="avatar" src="avatar.png" />
            <span>u/example</span>
            <span>1 day ago</span>
          </div>
          <div slot="comment">It’s not search. It’s discovery.</div>
        </shreddit-comment>
      </div>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );

    const button = document.querySelector<HTMLButtonElement>(THREAD_FILTER_TOGGLE_SELECTOR);
    const comment = document.querySelector<HTMLElement>("shreddit-comment");
    const meta = document.querySelector<HTMLElement>("[slot='commentMeta']");
    const text = document.querySelector<HTMLElement>("[slot='comment']");

    button?.click();
    expect(button?.textContent).toBe("Hide 1 filtered comments");
    expect(comment?.style.display ?? "").toBe("");
    expect(comment?.style.opacity ?? "").toBe("");
    expect(meta?.style.opacity).toBe("0.56");
    expect(text?.style.opacity).toBe("0.56");

    button?.click();
    expect(button?.textContent).toBe("Show 1 filtered comments");
    expect(comment?.style.display).toBe("none");
  });

  it("uses the same opacity for parent and child revealed filtered comments", () => {
    document.body.innerHTML = `
      <div data-testid="comment-thread">
        <shreddit-comment>
          <div slot="commentMeta">
            <span>u/parent</span>
          </div>
          <div slot="comment">This changes everything for the parent.</div>
          <shreddit-comment>
            <div slot="commentMeta">
              <span>u/child</span>
            </div>
            <div slot="comment">This changes everything for the child.</div>
          </shreddit-comment>
        </shreddit-comment>
      </div>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );

    document.querySelector<HTMLButtonElement>(THREAD_FILTER_TOGGLE_SELECTOR)?.click();

    const metas = document.querySelectorAll<HTMLElement>("[slot='commentMeta']");
    const comments = document.querySelectorAll<HTMLElement>("[slot='comment']");
    const containers = document.querySelectorAll<HTMLElement>("shreddit-comment");

    containers.forEach((container) => expect(container.style.opacity ?? "").toBe(""));
    metas.forEach((meta) => expect(meta.style.opacity).toBe("0.56"));
    comments.forEach((comment) => expect(comment.style.opacity).toBe("0.56"));
  });

  it("preserves thread reveal state across rescans", () => {
    document.body.innerHTML = `
      <div data-testid="comment-thread">
        <shreddit-comment>
          <div slot="commentMeta">
            <span>u/example</span>
            <span>1 day ago</span>
          </div>
          <div slot="comment">It’s not search. It’s discovery.</div>
        </shreddit-comment>
      </div>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );

    const button = document.querySelector<HTMLButtonElement>(THREAD_FILTER_TOGGLE_SELECTOR);
    button?.click();

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );

    expect(document.querySelector<HTMLElement>("shreddit-comment")?.style.display ?? "").toBe("");
    expect(document.querySelector<HTMLButtonElement>(THREAD_FILTER_TOGGLE_SELECTOR)?.textContent).toBe(
      "Hide 1 filtered comments",
    );
  });

  it("keeps old Reddit post titles clickable once and does not add a feed toggle", () => {
    document.body.innerHTML = `
      <div class="thing link">
        <div class="entry">
          <p class="tagline">submitted 38 minutes ago by u/test</p>
          <a class="title" href="/r/test/comments/abc123/post-title/">Feedback loop - what are you building today?</a>
          <div class="usertext-body">
            <div class="md"><p>This changes everything.</p></div>
          </div>
        </div>
      </div>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "old.reddit.com",
      "/r/test/",
    );

    const tagline = document.querySelector<HTMLElement>(".thing.link .tagline");
    const title = document.querySelector<HTMLAnchorElement>(".thing.link .title");

    expect(tagline?.querySelector(BADGE_SELECTOR)).not.toBeNull();
    expect(tagline?.querySelector("[data-probably-ai-toggle='true']")).toBeNull();
    expect(title?.style.display ?? "").toBe("");
    expect(title?.getAttribute("href")).toBe("/r/test/comments/abc123/post-title/");
    expect((document.querySelector(".thing.link")?.textContent?.match(/Feedback loop - what are you building today\?/g) ?? []).length).toBe(1);
  });

  it("adds one old Reddit thread filtered-comment toggle at the top and no per-comment toggles", () => {
    document.body.innerHTML = `
      <div class="commentarea">
        <div class="sitetable">
          <div class="thing comment">
            <div class="midcol">avatar parent</div>
            <div class="entry">
              <p class="tagline">posted by u/test</p>
              <div class="usertext-body">
                <div class="md"><p>This uses an em dash — right here.</p></div>
              </div>
            </div>
            <div class="child">
              <div class="sitetable">
                <div class="thing comment">
                  <div class="midcol">avatar child</div>
                  <div class="entry">
                    <p class="tagline">posted by u/test-child</p>
                    <div class="usertext-body">
                      <div class="md"><p>This changes everything for nested founders.</p></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="thing comment">
            <div class="midcol">avatar second</div>
            <div class="entry">
              <p class="tagline">posted by u/test2</p>
              <div class="usertext-body">
                <div class="md"><p>This changes everything for founders.</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "old.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );

    const threadButton = document.querySelector<HTMLButtonElement>(THREAD_FILTER_TOGGLE_SELECTOR);
    const siteTable = document.querySelector<HTMLElement>(".commentarea > .sitetable");
    const comments = document.querySelectorAll<HTMLElement>(".thing.comment");
    const entries = document.querySelectorAll<HTMLElement>(".thing.comment > .entry");
    const midcols = document.querySelectorAll<HTMLElement>(".thing.comment > .midcol");

    expect(document.querySelectorAll(COLLAPSE_SELECTOR)).toHaveLength(0);
    expect(document.querySelectorAll(THREAD_FILTER_SELECTOR)).toHaveLength(1);
    expect(document.querySelectorAll(".thing.comment .tagline [data-probably-ai-toggle='true']")).toHaveLength(0);
    expect(siteTable?.firstElementChild?.matches(THREAD_FILTER_SELECTOR)).toBe(true);
    expect(threadButton?.className).toContain("probably-ai-thread-filter-button--old");
    expect(threadButton?.textContent).toBe("Show 3 filtered comments");
    comments.forEach((comment) => expect(comment.style.display).toBe("none"));

    threadButton?.click();

    expect(threadButton?.textContent).toBe("Hide 3 filtered comments");
    comments.forEach((comment) => expect(comment.style.display ?? "").toBe(""));
    entries.forEach((entry) => expect(entry.style.opacity).toBe("0.56"));
    midcols.forEach((midcol) => expect(midcol.style.opacity).toBe("0.56"));
  });

  it("supports toggling expanded posts by candidate key", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <div slot="credit-bar">
          <span>u/example</span>
          <span>1 day ago</span>
        </div>
        <a slot="title">This changes everything for solo founders</a>
        <div slot="text-body">Founders should validate with real customers first.</div>
      </shreddit-post>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/",
    );

    const key = document.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR)?.dataset.candidateKey;
    expect(key).toBeTruthy();

    if (key) {
      toggleCandidateExpanded(key);
    }

    expect(document.querySelector<HTMLElement>("[slot='title']")?.style.display ?? "").toBe("");
  });

  it("turning off auto-hide restores content and removes injected controls", () => {
    document.body.innerHTML = `
      <div data-testid="comment-thread">
        <shreddit-comment>
          <div slot="commentMeta">
            <span>u/example</span>
            <span>1 day ago</span>
          </div>
          <div slot="comment">It’s not search. It’s discovery.</div>
        </shreddit-comment>
      </div>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/comments/abc123/post-title/",
    );
    scanRedditDocument(document, createSettings(), "www.reddit.com", "/r/test/comments/abc123/post-title/");

    expect(document.querySelectorAll(THREAD_FILTER_SELECTOR)).toHaveLength(0);
    expect(document.querySelector<HTMLElement>("shreddit-comment")?.style.display ?? "").toBe("");
    expect(document.querySelector<HTMLElement>("shreddit-comment")?.style.opacity ?? "").toBe("");
    expect(document.querySelector<HTMLElement>("[slot='commentMeta']")?.style.opacity ?? "").toBe("");
  });

  it("turning off detection removes badges and controls", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <div slot="credit-bar">
          <span>u/example</span>
          <span>1 day ago</span>
        </div>
        <a slot="title">This changes everything</a>
      </shreddit-post>
    `;

    scanRedditDocument(
      document,
      createSettings({
        autoHideDetected: true,
      }),
      "www.reddit.com",
      "/r/test/",
    );
    scanRedditDocument(
      document,
      {
        enabled: false,
        autoHideDetected: true,
        rules: cloneDefaultRules(),
      },
      "www.reddit.com",
      "/r/test/",
    );

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(0);
    expect(document.querySelectorAll(COLLAPSE_SELECTOR)).toHaveLength(0);
    expect(document.querySelectorAll(THREAD_FILTER_SELECTOR)).toHaveLength(0);
  });
});
