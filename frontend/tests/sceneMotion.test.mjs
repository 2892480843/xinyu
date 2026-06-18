import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importSceneMotion() {
  const sourcePath = path.resolve("src/lib/sceneMotion.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.join(os.tmpdir(), "xinyu-scene-motion-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `sceneMotion-${Date.now()}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

test("scene motion presets keep calm motion slower than restless emotion motion", async () => {
  const { getSceneMotion } = await importSceneMotion();

  const soothe = getSceneMotion("soothe");
  const restless = getSceneMotion("restless");

  assert.ok(soothe.imageDuration > restless.imageDuration);
  assert.ok(Math.abs(parseFloat(restless.imageX[1])) > Math.abs(parseFloat(soothe.imageX[1])));
});

test("scene motion presets make bright scenes lighter and heavy scenes quieter", async () => {
  const { getSceneMotion } = await importSceneMotion();

  const soothe = getSceneMotion("soothe");
  const bright = getSceneMotion("bright");
  const heavy = getSceneMotion("heavy");

  assert.ok(bright.auraOpacity[1] > soothe.auraOpacity[1]);
  assert.ok(heavy.auraOpacity[1] < soothe.auraOpacity[1]);
});

test("scene motion presets fall back to the soothing motion", async () => {
  const { getSceneMotion } = await importSceneMotion();

  assert.deepEqual(getSceneMotion("unknown"), getSceneMotion("soothe"));
});
