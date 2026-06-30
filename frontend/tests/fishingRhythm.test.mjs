import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importFishingModule() {
  const source = await readFile(path.resolve("src/lib/fishing.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText;
  const dir = await mkdtemp(path.join(os.tmpdir(), "xy-fishing-"));
  const modulePath = path.join(dir, "fishing.mjs");
  await writeFile(modulePath, output, "utf8");
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
}

test("fishing rhythm progress clamps from 0 to 1", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.FISHING_RHYTHM_DURATION_MS, 1800);
  assert.equal(fishing.fishingRhythmProgress(1000, 1000), 0);
  assert.equal(fishing.fishingRhythmProgress(1900, 1000), 0.5);
  assert.equal(fishing.fishingRhythmProgress(4000, 1000), 1);
  assert.equal(fishing.fishingRhythmProgress(900, 1000), 0);
  assert.equal(fishing.fishingRhythmProgress(1000, 1000, 0), 1);
});

test("fishing rhythm hit window accepts the middle and rejects early or late reels", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.FISHING_HIT_START, 0.38);
  assert.equal(fishing.FISHING_HIT_END, 0.62);
  assert.equal(fishing.isFishingRhythmHit(0.37), false);
  assert.equal(fishing.isFishingRhythmHit(0.38), true);
  assert.equal(fishing.isFishingRhythmHit(0.5), true);
  assert.equal(fishing.isFishingRhythmHit(0.62), true);
  assert.equal(fishing.isFishingRhythmHit(0.63), false);
  assert.equal(fishing.isFishingRhythmHit(Number.NaN), false);
});

test("fishing miss reason separates early and late reels", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.fishingMissReason(0.12), "early");
  assert.equal(fishing.fishingMissReason(0.7), "late");
});

test("fishing wait time stays inside the existing gentle wait range", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.pickFishingWaitMs(() => 0), 1600);
  assert.equal(fishing.pickFishingWaitMs(() => 1), 3800);
  assert.equal(fishing.pickFishingWaitMs(() => 0.5), 2700);
});

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

test("ExploreMode wires the fishing rhythm state machine and HUD", async () => {
  const source = await readExploreModeSource();
  const stateBlock = sourceBlock(source, "const [atWater, setAtWater]", "const [songProgress, setSongProgress]");
  const effectsBlock = sourceBlock(source, "useEffect(() => {\n    if (fishing === \"cast\")", "// 风铃心曲");
  const actionBlock = sourceBlock(source, "const onCast = useCallback(() => {", "const ringChime =");
  const hudBlock = sourceBlock(source, "function FishingRhythmHud", "function LocationAudio");
  const renderBlock = sourceBlock(source, "{/* 海湾岸边:垂钓按钮", "{/* 🐚 听海海螺");

  assert.match(source, /from "\.\.\/lib\/fishing"/);
  assert.match(stateBlock, /useState<FishingState>\("idle"\)/);
  assert.match(stateBlock, /const \[rhythmStartedAt, setRhythmStartedAt\]/);
  assert.match(stateBlock, /const \[fishingMiss, setFishingMiss\]/);
  assert.match(effectsBlock, /setFishing\("waiting"\)/);
  assert.match(effectsBlock, /setFishing\("bite"\)/);
  assert.match(effectsBlock, /FISHING_RHYTHM_DURATION_MS/);
  assert.match(actionBlock, /fishingRhythmProgress\(Date\.now\(\), rhythmStartedAt\)/);
  assert.match(actionBlock, /isFishingRhythmHit\(progress\)/);
  assert.match(actionBlock, /fishingMissReason\(progress\)/);
  assert.match(actionBlock, /FISHING_CATCHES/);
  assert.match(hudBlock, /aria-label="收线"/);
  assert.match(hudBlock, /fishingRhythmProgress\(now, startedAt\)/);
  assert.match(hudBlock, /isFishingRhythmHit\(progress\)/);
  assert.match(renderBlock, /<FishingRhythmHud/);
  assert.match(renderBlock, /等鱼靠近/);
  assert.match(renderBlock, /别急，它刚碰到浮标/);
  assert.match(renderBlock, /鱼从光里游走了/);
});

test("ExploreMode supports keyboard reeling during the bite window", async () => {
  const source = await readExploreModeSource();
  const keyboardBlock = sourceBlock(source, "window.addEventListener(\"keydown\"", "window.removeEventListener(\"keydown\"");

  assert.match(keyboardBlock, /event\.code !== "Space"/);
  assert.match(keyboardBlock, /event\.code !== "Enter"/);
  assert.match(keyboardBlock, /event\.preventDefault\(\)/);
  assert.match(keyboardBlock, /onCast\(\)/);
});
