import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importProtagonistAction() {
  const sourcePath = path.resolve("src/lib/protagonistAction.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.join(os.tmpdir(), "xinyu-protagonist-action-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `protagonistAction-${Date.now()}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

test("selectCharacterAction maps movement states to shared character clips", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  const base = { moving: false, running: false, airborne: false, cheerActive: false, waveActive: false, fluteActive: false, sitAmount: 0 };
  assert.equal(selectCharacterAction(base), "Idle");
  assert.equal(selectCharacterAction({ ...base, moving: true }), "WalkLoop");
  assert.equal(selectCharacterAction({ ...base, moving: true, running: true }), "RunLoop");
  assert.equal(selectCharacterAction({ ...base, sitAmount: 0.7 }), "Sit");
  assert.equal(selectCharacterAction({ ...base, waveActive: true }), "Wave");
  assert.equal(selectCharacterAction({ ...base, fluteActive: true }), "Flute");
  assert.equal(selectCharacterAction({ ...base, cheerActive: true }), "Cheer");
  assert.equal(selectCharacterAction({ ...base, airborne: true }), "Jump");
});

test("selectCharacterAction keeps expressive and physics-critical priorities stable", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  const busy = { moving: true, running: true, airborne: true, cheerActive: true, waveActive: true, fluteActive: true, sitAmount: 1 };
  assert.equal(selectCharacterAction(busy), "Jump");
  assert.equal(selectCharacterAction({ ...busy, airborne: false }), "Cheer");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false }), "Flute");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false, fluteActive: false }), "Wave");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false, fluteActive: false, waveActive: false }), "Sit");
  assert.equal(selectCharacterAction({ ...busy, airborne: false, cheerActive: false, fluteActive: false, waveActive: false, sitAmount: 0 }), "RunLoop");
});

test("selectCharacterAction keeps jump pose during landing recovery", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  const base = { moving: false, running: false, airborne: false, landingActive: false, cheerActive: false, waveActive: false, fluteActive: false, sitAmount: 0 };
  assert.equal(selectCharacterAction({ ...base, landingActive: true }), "Jump");
  assert.equal(selectCharacterAction({ ...base, moving: true, running: true, landingActive: true }), "Jump");
  assert.equal(selectCharacterAction({ ...base, landingActive: true, waveActive: true }), "Jump");
});
