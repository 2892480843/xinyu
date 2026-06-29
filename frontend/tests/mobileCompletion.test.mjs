import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile shell uses shared safe-area layout helpers", () => {
  const css = read("../src/index.css");
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(css, /\.mobile-app-shell\s*\{/);
  assert.match(css, /padding-left:\s*max\(1rem,\s*env\(safe-area-inset-left\)\)/);
  assert.match(css, /\.mobile-bottom-buffer\s*\{/);
  assert.match(css, /padding-bottom:\s*calc\(7\.5rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(home, /className="mobile-app-shell mobile-bottom-buffer/);
  assert.match(home, /overflow-x-hidden/);
});

test("mobile sheet locks background touch and contains long content", () => {
  const css = read("../src/index.css");
  const sheet = read("../src/mobile/components/BottomSheet.tsx");

  assert.match(css, /\.mobile-sheet-content\s*\{/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(sheet, /prevTouchAction/);
  assert.match(sheet, /document\.body\.style\.touchAction = "none"/);
  assert.match(sheet, /overscroll-contain/);
  assert.match(sheet, /mobile-sheet-content/);
});

test("mobile navigation keeps CSS marker language and no emoji CTA decoration", () => {
  const css = read("../src/index.css");
  const tabBar = read("../src/mobile/components/MobileTabBar.tsx");
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(css, /\.mobile-tab-mark\s*\{/);
  assert.match(tabBar, /mobile-tab-mark/);
  assert.doesNotMatch(home, /\u{1f30a}|\u{1f3dd}/u);
});

test("mobile self tab has a stronger glass reading surface", () => {
  const css = read("../src/index.css");
  const selfTab = read("../src/mobile/components/SelfTab.tsx");
  const userBadge = read("../src/components/UserBadge.tsx");

  assert.match(css, /\.mobile-self-panel\s*\{/);
  assert.match(css, /background:\s*linear-gradient\(180deg,\s*rgba\(10,\s*14,\s*31,\s*0\.58\)/);
  assert.match(selfTab, /mobile-self-panel/);
  assert.doesNotMatch(userBadge, /\u{1f464}|\u{1f5d1}/u);
});

test("mobile PWA entry remains installable and offline-shell aware", () => {
  const mobileHtml = read("../mobile.html");
  const manifest = JSON.parse(read("../public/manifest.mobile.webmanifest"));
  const sw = read("../public/sw.js");

  assert.match(mobileHtml, /<link rel="manifest" href="\/manifest\.mobile\.webmanifest"/);
  assert.equal(manifest.start_url, "/mobile.html");
  assert.equal(manifest.display, "standalone");
  assert.match(sw, /"\/mobile\.html"/);
  assert.match(sw, /url\.pathname === "\/mobile\.html"/);
});
