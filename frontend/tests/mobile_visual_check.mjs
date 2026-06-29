import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const shotDir = resolve(root, "docs/screenshots/mobile-app-completion");
mkdirSync(shotDir, { recursive: true });

async function assertVisible(page, text) {
  const locator = page.getByText(text).first();
  await locator.waitFor({ state: "visible", timeout: 10_000 });
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }));
  assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, JSON.stringify(overflow));
  assert.ok(overflow.bodyScrollWidth <= overflow.bodyClientWidth + 1, JSON.stringify(overflow));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
});
await page.addInitScript(() => {
  localStorage.setItem(
    "xinyu.localIdentity",
    JSON.stringify({ user_id: "local-mobile-visual-check", nickname: "老陈" }),
  );
  sessionStorage.setItem("xinyu.arrived.local-mobile-visual-check", "1");
});

await page.goto("http://127.0.0.1:5173/mobile.html", { waitUntil: "networkidle" });
await assertVisible(page, "心 屿");
await page.screenshot({ path: resolve(shotDir, "390-island.png"), fullPage: true });
await assertNoHorizontalOverflow(page);

await page.getByLabel("倾诉").click();
await page.getByLabel("说给岛屿").waitFor({ state: "visible", timeout: 10_000 });
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(shotDir, "390-compose-sheet.png"), fullPage: true });
await assertNoHorizontalOverflow(page);
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "足迹" }).click();
await assertVisible(page, "足 迹");
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(shotDir, "390-memory.png"), fullPage: true });
await assertNoHorizontalOverflow(page);

await page.getByRole("button", { name: "我" }).click();
await assertVisible(page, "我");
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(shotDir, "390-self.png"), fullPage: true });
await assertNoHorizontalOverflow(page);

for (const [width, height, name] of [
  [360, 740, "360-island"],
  [430, 932, "430-island"],
]) {
  await page.setViewportSize({ width, height });
  await page.getByRole("button", { name: "岛屿", exact: true }).click();
  await assertVisible(page, "心 屿");
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(shotDir, `${name}.png`), fullPage: true });
  await assertNoHorizontalOverflow(page);
}

await browser.close();
console.log(`mobile screenshots written to ${shotDir}`);
