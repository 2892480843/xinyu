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

  assert.equal(selectCharacterAction({ moving: false, airborne: false, waveActive: false, fluteActive: false, sitAmount: 0 }), "Idle");
  assert.equal(selectCharacterAction({ moving: true, airborne: false, waveActive: false, fluteActive: false, sitAmount: 0 }), "WalkLoop");
  assert.equal(selectCharacterAction({ moving: false, airborne: false, waveActive: false, fluteActive: false, sitAmount: 0.7 }), "Sit");
  assert.equal(selectCharacterAction({ moving: false, airborne: false, waveActive: true, fluteActive: false, sitAmount: 0 }), "Wave");
  assert.equal(selectCharacterAction({ moving: false, airborne: false, waveActive: false, fluteActive: true, sitAmount: 0 }), "Flute");
  assert.equal(selectCharacterAction({ moving: false, airborne: true, waveActive: false, fluteActive: false, sitAmount: 0 }), "Jump");
});

test("selectCharacterAction keeps physics-critical jump above gesture clips", async () => {
  const { selectCharacterAction } = await importProtagonistAction();

  assert.equal(selectCharacterAction({ moving: true, airborne: true, waveActive: true, fluteActive: true, sitAmount: 1 }), "Jump");
  assert.equal(selectCharacterAction({ moving: true, airborne: false, waveActive: true, fluteActive: true, sitAmount: 1 }), "Flute");
  assert.equal(selectCharacterAction({ moving: true, airborne: false, waveActive: true, fluteActive: false, sitAmount: 1 }), "Wave");
});
