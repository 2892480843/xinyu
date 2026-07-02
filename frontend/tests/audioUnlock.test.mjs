import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(file) {
  return readFile(path.resolve(file), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("sfx waits for a user gesture before creating or resuming AudioContext", async () => {
  const source = await readSource("src/lib/sfx.ts");
  const ensureBlock = sourceBlock(source, "function ensure(", "// 暴露全局 AudioContext");

  assert.match(source, /let audioUnlocked = false/);
  assert.match(source, /function registerAudioUnlockListeners/);
  assert.match(source, /function canStartAudioContext/);
  assert.match(source, /function unlockAudioFromGesture/);
  assert.match(source, /"pointerdown"/);
  assert.match(source, /"keydown"/);
  assert.match(ensureBlock, /if \(!ctx && !force && !canStartAudioContext\(\)\)/);
  assert.match(ensureBlock, /registerAudioUnlockListeners\(\);/);
  assert.doesNotMatch(ensureBlock, /ctx\.resume\(\)\.catch/);
});

test("sample loading remains retryable while AudioContext is still locked", async () => {
  const source = await readSource("src/lib/samples.ts");
  const loadBlock = sourceBlock(source, "async function loadSample", "/**\n * 同步返回");
  const contextIndex = loadBlock.indexOf("const ctx = getAudioContext()");
  const loadingIndex = loadBlock.indexOf('cache.set(name, { status: "loading"');

  assert.ok(contextIndex > -1, "loadSample should request the shared AudioContext");
  assert.ok(loadingIndex > -1, "loadSample should mark real loading after AudioContext exists");
  assert.ok(contextIndex < loadingIndex, "pre-gesture null AudioContext must not poison the cache as failed");
  assert.match(loadBlock, /if \(!ctx\) return;/);
});
