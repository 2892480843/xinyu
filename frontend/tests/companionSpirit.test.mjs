import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importCompanionSpirit() {
  const sourcePath = path.resolve("src/lib/companionSpirit.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.join(os.tmpdir(), "xinyu-companion-spirit-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `companionSpirit-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

test("creates a calm long-term companion profile", async () => {
  const { createCompanionState } = await importCompanionSpirit();

  const state = createCompanionState("local-test-user");

  assert.equal(state.userId, "local-test-user");
  assert.equal(state.name, "微光");
  assert.equal(state.affinity, 0);
  assert.equal(state.feedCount, 0);
  assert.deepEqual(state.unlockedSecrets, []);
});

test("feeding increases affinity and unlocks the tide shell secret", async () => {
  const { createCompanionState, feedCompanion } = await importCompanionSpirit();

  let state = createCompanionState("local-test-user");
  state = feedCompanion(state, "moonShell", 10_000).state;
  const result = feedCompanion(state, "moonShell", 20_000);

  assert.equal(result.state.affinity, 28);
  assert.equal(result.state.feedCount, 2);
  assert.equal(result.animation, "FeedTreat");
  assert.ok(result.reply.includes("贝壳"));
  assert.deepEqual(result.unlockedNow, ["tideShell"]);
});

test("dialogue responds gently to worried emotion and unlocks a listening secret", async () => {
  const { createCompanionState, talkToCompanion } = await importCompanionSpirit();

  const state = {
    ...createCompanionState("local-test-user"),
    affinity: 24,
  };
  const result = talkToCompanion(state, "worried", 30_000);

  assert.equal(result.animation, "ComfortPulse");
  assert.ok(result.reply.includes("慢慢"));
  assert.deepEqual(result.unlockedNow, ["firstWhisper"]);
  assert.ok(result.state.talkCount > state.talkCount);
});

test("accepts the expanded companion action library", async () => {
  const { COMPANION_ANIMATIONS, normalizeCompanionAnimation } = await importCompanionSpirit();

  for (const clip of ["Nuzzle", "CuriousPeek", "DiscoveryHop", "LanternGaze", "ComfortPulse", "NightGuard"]) {
    assert.ok(COMPANION_ANIMATIONS.includes(clip), `missing companion action ${clip}`);
    assert.equal(normalizeCompanionAnimation(clip), clip);
  }

  assert.equal(normalizeCompanionAnimation("DanceNow"), "BondGlow");
  assert.equal(normalizeCompanionAnimation(undefined), "BondGlow");
});

test("companion care interactions choose the new emotional action clips", async () => {
  const { createCompanionState, talkToCompanion, nightVisitCompanion } = await importCompanionSpirit();

  const worried = talkToCompanion({ ...createCompanionState("local-test-user"), affinity: 24 }, "worried", 30_000);
  assert.equal(worried.animation, "ComfortPulse");

  const calm = talkToCompanion(createCompanionState("local-test-user"), "calm", 40_000);
  assert.equal(calm.animation, "CuriousPeek");

  const night = nightVisitCompanion(createCompanionState("local-test-user"), new Date(2026, 5, 30, 22, 0, 0).getTime());
  assert.ok(night);
  assert.equal(night.animation, "NightGuard");
});
