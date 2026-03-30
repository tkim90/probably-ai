import { cloneDefaultRules } from "../src/shared/defaultRules";
import { BADGE_SELECTOR, scanRedditDocument } from "../src/content/detector";
import type { ExtensionSettings } from "../src/shared/types";

function createSettings(): ExtensionSettings {
  return {
    enabled: true,
    rules: cloneDefaultRules(),
  };
}

describe("scanRedditDocument", () => {
  it("badges current Reddit posts", () => {
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

    const matches = scanRedditDocument(document, createSettings(), "www.reddit.com");
    const metadataRow = document.querySelector<HTMLElement>("[slot='credit-bar']");

    expect(matches).toBe(1);
    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
    expect(metadataRow?.querySelector(BADGE_SELECTOR)).not.toBeNull();
  });

  it("badges current Reddit comments", () => {
    document.body.innerHTML = `
      <shreddit-comment>
        <div slot="commentMeta">
          <span>u/example</span>
          <span>1 day ago</span>
        </div>
        <div slot="comment">It’s not search. It’s discovery.</div>
      </shreddit-comment>
    `;

    scanRedditDocument(document, createSettings(), "www.reddit.com");

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
    expect(document.querySelector("[slot='commentMeta']")?.querySelector(BADGE_SELECTOR)).not.toBeNull();
  });

  it("badges old Reddit posts", () => {
    document.body.innerHTML = `
      <div class="thing link">
        <div class="entry">
          <a class="title">This changes everything</a>
          <div class="usertext-body">
            <div class="md"><p>Nothing else here.</p></div>
          </div>
        </div>
      </div>
    `;

    scanRedditDocument(document, createSettings(), "old.reddit.com");

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
  });

  it("badges old Reddit comments", () => {
    document.body.innerHTML = `
      <div class="thing comment">
        <div class="entry">
          <p class="tagline">posted by u/test</p>
          <div class="usertext-body">
            <div class="md"><p>This uses an em dash — right here.</p></div>
          </div>
        </div>
      </div>
    `;

    scanRedditDocument(document, createSettings(), "old.reddit.com");

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
  });

  it("does not duplicate badges on rescans", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <a slot="title">This changes everything</a>
      </shreddit-post>
    `;

    scanRedditDocument(document, createSettings(), "www.reddit.com");
    scanRedditDocument(document, createSettings(), "www.reddit.com");

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
  });

  it("updates badges after text mutations", () => {
    document.body.innerHTML = `
      <shreddit-comment>
        <div slot="comment">Completely normal human sentence.</div>
      </shreddit-comment>
    `;

    const comment = document.querySelector("[slot='comment']");
    scanRedditDocument(document, createSettings(), "www.reddit.com");

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(0);

    if (comment) {
      comment.textContent = "This changes everything for productivity.";
    }

    scanRedditDocument(document, createSettings(), "www.reddit.com");

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
  });

  it("removes badges when detection is disabled", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <a slot="title">This changes everything</a>
      </shreddit-post>
    `;

    scanRedditDocument(document, createSettings(), "www.reddit.com");
    scanRedditDocument(
      document,
      {
        enabled: false,
        rules: cloneDefaultRules(),
      },
      "www.reddit.com",
    );

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(0);
  });

  it("matches literal double-dash phrases", () => {
    document.body.innerHTML = `
      <shreddit-post>
        <a slot="title">One weird trick -- every founder needs it</a>
      </shreddit-post>
    `;

    scanRedditDocument(document, createSettings(), "www.reddit.com");

    expect(document.querySelectorAll(BADGE_SELECTOR)).toHaveLength(1);
  });
});
