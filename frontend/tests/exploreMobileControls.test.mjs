import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readExploreModeSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

async function readCssSource() {
  return readFile(path.resolve("src/index.css"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("mobile explore pulls jump out of the secondary action stack", async () => {
  const source = await readExploreModeSource();
  const css = await readCssSource();
  const actionPadBlock = sourceBlock(source, "xy-explore-action-pad", "{carPrompt !== \"exit\" && !companionOpen && (");
  const jumpClassIndex = source.indexOf("xy-explore-jump-button");
  const jumpCssBlock = sourceBlock(css, ".xy-explore-mode .xy-explore-jump-button", ".xy-explore-mode .xy-explore-drive-pedal");
  assert.notEqual(jumpClassIndex, -1, "xy-explore-jump-button should exist");
  const jumpButtonStart = source.lastIndexOf("<button", jumpClassIndex);
  const jumpButtonEnd = source.indexOf("</button>", jumpClassIndex);
  assert.notEqual(jumpButtonStart, -1, "jump button start should exist");
  assert.notEqual(jumpButtonEnd, -1, "jump button end should exist");
  const jumpBlock = source.slice(jumpButtonStart, jumpButtonEnd);

  assert.doesNotMatch(actionPadBlock, /inputRef\.current\.jump = true/);
  assert.match(jumpBlock, /aria-label="跳跃"/);
  assert.match(jumpBlock, /inputRef\.current\.jump = true/);
  assert.match(jumpBlock, /className="xy-explore-jump-button/);
  assert.match(jumpBlock, /right:\s*"calc\(1\.6rem \+ env\(safe-area-inset-right\)\)"/);
  assert.match(jumpBlock, /bottom:\s*"calc\(6rem \+ env\(safe-area-inset-bottom\)\)"/);
  assert.match(jumpCssBlock, /position:\s*absolute !important/);
});

test("mobile explore keeps the joystick slightly farther from the left edge", async () => {
  const css = await readCssSource();
  const portraitBlock = sourceBlock(css, "@media (orientation: portrait) and (pointer: coarse)", ".chip {");

  assert.match(portraitBlock, /\.xy-explore-mode \.xy-explore-joystick/);
  assert.match(portraitBlock, /left:\s*calc\(1\.4rem \+ env\(safe-area-inset-left\)\) !important/);
});

test("mobile landscape explore reserves a minimap rail before HUD text", async () => {
  const css = await readCssSource();
  const landscapeBlock = sourceBlock(css, "@media (orientation: landscape) and (pointer: coarse)", "@media (orientation: portrait) and (pointer: coarse)");

  assert.match(landscapeBlock, /\.xy-explore-mode \.xy-explore-hud/);
  assert.match(landscapeBlock, /padding-left:\s*calc\(7\.75rem \+ env\(safe-area-inset-left\)\) !important/);
  assert.match(landscapeBlock, /\.xy-explore-mode \.xy-explore-hud > \.panel-glass-2,\s*\n\s*\.xy-explore-mode \.xy-explore-hud > \.panel-glass-1/);
  assert.match(landscapeBlock, /max-width:\s*min\(42vw,\s*24rem\)/);
});

test("mobile driving uses a larger hold pedal instead of a tiny boost dot", async () => {
  const source = await readExploreModeSource();
  const css = await readCssSource();
  const driveBlock = sourceBlock(source, "{/* 开车时(触屏)", "{/* 送完所有人");
  const portraitBlock = sourceBlock(css, "@media (orientation: portrait) and (pointer: coarse)", ".chip {");

  assert.match(driveBlock, /className="xy-explore-drive-pedal/);
  assert.match(driveBlock, /aria-label="按住加速"/);
  assert.match(driveBlock, /按住加速/);
  assert.doesNotMatch(driveBlock, /xy-explore-boost/);
  assert.match(portraitBlock, /\.xy-explore-mode \.xy-explore-drive-pedal/);
  assert.match(portraitBlock, /\.xy-explore-mode \.xy-explore-drive-pedal\s*\{[\s\S]*position:\s*absolute !important/);
  assert.match(portraitBlock, /width:\s*5\.25rem/);
});
