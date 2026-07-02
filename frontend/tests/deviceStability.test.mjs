import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("performance tier stays conservative across touch, low-memory, and software-rendered devices", () => {
  const perfTier = read("../src/lib/perfTier.ts");

  assert.match(perfTier, /function hasTouchDevice\(\): boolean/);
  assert.match(perfTier, /navigator\.maxTouchPoints/);
  assert.match(perfTier, /\(pointer: coarse\)/);
  assert.match(perfTier, /function hasSmallViewport\(\): boolean/);
  assert.match(perfTier, /\(max-width: 767px\)/);
  assert.match(perfTier, /if \(isMobile \|\| hasTouchDevice\(\) \|\| hasSmallViewport\(\)\) return "low"/);
  assert.match(perfTier, /if \(cores > 0 && cores <= 4\) return "low"/);
  assert.match(perfTier, /if \(memory > 0 && memory <= 4\) return "low"/);
  assert.match(perfTier, /swiftshader\|llvmpipe\|software\|microsoft basic\|basic render/);
  assert.ok(perfTier.indexOf("cores > 0 && cores <= 4") < perfTier.indexOf("strongGpu"), "hardware constraints should be checked before strong GPU unlocks high tier");
});

test("explore and drive WebGL canvases exit safely on context loss", () => {
  const explore = read("../src/components/ExploreMode.tsx");
  const drive = read("../src/components/DriveScene.tsx");

  assert.match(explore, /function WebGLContextLossExit\(\{ onExit \}/);
  assert.match(explore, /addEventListener\("webglcontextlost", handleContextLost\)/);
  assert.match(explore, /event\.preventDefault\(\)/);
  assert.match(explore, /<WebGLContextLossExit onExit=\{onExit\} \/>/);
  assert.match(drive, /function WebGLContextLossExit\(\{ onExit \}/);
  assert.match(drive, /addEventListener\("webglcontextlost", handleContextLost\)/);
  assert.match(drive, /<WebGLContextLossExit onExit=\{onExit\} \/>/);
});
