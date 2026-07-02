import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const shotDir = resolve(root, "docs/screenshots/mobile-app-completion");
const baseUrl = process.env.MOBILE_VISUAL_BASE_URL ?? "http://127.0.0.1:5173";
mkdirSync(shotDir, { recursive: true });

async function assertVisible(page, text) {
  const locator = page.getByText(text).first();
  await locator.waitFor({ state: "visible", timeout: 10_000 });
}

async function assertPlaceholderVisible(page, text) {
  const locator = page.getByPlaceholder(text).first();
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

await page.goto(`${baseUrl}/mobile.html`, { waitUntil: "networkidle" });
await assertVisible(page, "心 屿");
await assertPlaceholderVisible(page, "岛屿正在聆听……把此刻的心情说给它听");
await assertVisible(page, "上岛走走");
await page.screenshot({ path: resolve(shotDir, "390-web-home.png") });
await assertNoHorizontalOverflow(page);

await page.getByPlaceholder("岛屿正在聆听……把此刻的心情说给它听").fill("今天只是想来岛上坐一会儿。");
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(shotDir, "390-direct-input.png") });
await assertNoHorizontalOverflow(page);

await page.getByText("《心屿》提供情感陪伴").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(shotDir, "390-web-home-bottom.png") });
await assertNoHorizontalOverflow(page);

await page.getByRole("button", { name: "心象地图" }).click();
await assertVisible(page, "还是一片刚刚浮出海面的岛屿");
await page.waitForTimeout(700);
await page.screenshot({ path: resolve(shotDir, "390-mind-map.png") });
await assertNoHorizontalOverflow(page);
await page.getByRole("button", { name: "‹ 返回" }).click();

for (const [width, height, name] of [
  [360, 740, "360-web-home"],
  [390, 640, "390-short-web-home"],
  [430, 932, "430-web-home"],
]) {
  await page.setViewportSize({ width, height });
  await assertVisible(page, "心 屿");
  await assertVisible(page, "上岛走走");
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(shotDir, `${name}.png`) });
  await assertNoHorizontalOverflow(page);
}

await browser.close();
console.log(`mobile screenshots written to ${shotDir}`);
