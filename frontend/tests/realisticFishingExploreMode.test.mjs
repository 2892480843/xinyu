import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readExploreModeSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("ExploreMode imports realistic fishing domain modules", async () => {
  const source = await readExploreModeSource();

  assert.match(source, /from "\.\.\/lib\/fishingSystem"/);
  assert.match(source, /from "\.\.\/lib\/fishingGear"/);
  assert.match(source, /from "\.\.\/lib\/fishingSpecies"/);
  assert.match(source, /from "\.\.\/lib\/fishingSimulation"/);
  assert.match(source, /from "\.\.\/lib\/fishingStorage"/);
});

test("ExploreMode keeps realistic fishing state separate from legacy rhythm state", async () => {
  const source = await readExploreModeSource();
  const stateBlock = sourceBlock(source, "const [atWater, setAtWater]", "const [songProgress, setSongProgress]");

  assert.match(stateBlock, /useState<FishingSession>\(INITIAL_FISHING_SESSION\)/);
  assert.match(stateBlock, /useState<FishingSaveV1>/);
  assert.match(stateBlock, /const activeFishingAction =/);
  assert.doesNotMatch(stateBlock, /useState<FishingState>\("idle"\)/);
});

test("ExploreMode renders hero-tied fishing scene feedback and HUD", async () => {
  const source = await readExploreModeSource();
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function ExploreMode");
  const renderBlock = sourceBlock(source, "{/* 海湾岸边:垂钓按钮", "{/* 🐚 听海海螺");

  assert.match(source, /function FishingRigFx/);
  assert.match(source, /function FishingSystemHud/);
  assert.match(sceneBlock, /<FishingRigFx/);
  assert.match(sceneBlock, /fishingSession=\{fishingSession\}/);
  assert.match(sceneBlock, /fishingAction=\{fishingAction\}/);
  assert.match(renderBlock, /<FishingSystemHud/);
  assert.match(renderBlock, /钓具/);
  assert.match(renderBlock, /提竿/);
  assert.match(renderBlock, /张力/);
  assert.match(renderBlock, /放生/);
});

test("ExploreMode no longer uses the abstract rhythm ring as the primary fishing interaction", async () => {
  const source = await readExploreModeSource();

  assert.doesNotMatch(source, /function FishingRhythmHud/);
  assert.doesNotMatch(source, /盯住光圈/);
  assert.match(source, /浮漂/);
  assert.match(source, /鱼线/);
});
