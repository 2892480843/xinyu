import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importProtagonistAction() {
  const source = await readFile(path.resolve("src/lib/protagonistAction.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = path.join(os.tmpdir(), "xy-fishing-action-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `protagonistAction-${Date.now()}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

function baseState() {
  return {
    moving: true,
    running: true,
    airborne: false,
    landingActive: false,
    cheerActive: true,
    waveActive: true,
    fluteActive: true,
    sitAmount: 1,
  };
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("selectCharacterAction gives grounded fishing actions priority over ordinary expression clips", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingAim" }), "FishingAim");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingCast" }), "FishingCast");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingHook" }), "FishingHook");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingFight" }), "FishingFight");
  assert.equal(selectCharacterAction({ ...baseState(), fishingAction: "FishingResult" }), "FishingResult");
});

test("selectCharacterAction keeps airborne and landing safety above fishing actions", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  assert.equal(selectCharacterAction({ ...baseState(), airborne: true, fishingAction: "FishingFight" }), "Jump");
  assert.equal(selectCharacterAction({ ...baseState(), landingActive: true, fishingAction: "FishingFight" }), "Jump");
});

test("ExploreMode routes active fishing action into the playable hero", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const playerBlock = sourceBlock(source, "function Player", "// 心愿之光收集物");
  const sceneBlock = sourceBlock(source, "function ExploreScene", "function ExploreMode");

  assert.match(source, /type FishingActionClip/);
  assert.match(playerBlock, /fishingAction\?: FishingActionClip \| null/);
  assert.match(playerBlock, /fishingAction,/);
  assert.match(playerBlock, /selectCharacterAction\(\{[\s\S]*fishingAction/);
  assert.match(sceneBlock, /fishingAction=\{fishingAction\}/);
  assert.match(playerBlock, /<GltfHero[\s\S]*actionRef=\{characterActionRef\}/);
});
