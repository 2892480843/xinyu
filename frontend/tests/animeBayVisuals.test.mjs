import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importAnimeBayVisuals() {
  const sourcePath = path.resolve("src/lib/animeBayVisuals.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.resolve("node_modules/.tmp/xinyu-anime-bay-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `animeBayVisuals-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

test("shore breaks form ordered animated bands outside the bay waterline", async () => {
  const { makeAnimeShoreBreaks } = await importAnimeBayVisuals();

  const breaks = makeAnimeShoreBreaks({
    bayAngle: 0.55,
    waterlineRadius: 248,
    lowTier: false,
    night: true,
  });

  assert.equal(breaks.length, 5);
  assert.deepEqual(breaks.map((b) => b.key), ["shore-0", "shore-1", "shore-2", "shore-3", "shore-4"]);
  assert.ok(breaks.every((b) => b.radius > 248), "all visible breaks should sit seaward of the waterline");
  assert.ok(breaks.every((b) => b.length > b.width * 6), "breaks should read as long hand-painted wave bands");
  assert.ok(breaks.every((b) => b.width <= 2.6), "breaks should stay narrow instead of becoming filled oval pools");
  assert.ok(breaks.every((b, i) => i === 0 || b.radius > breaks[i - 1].radius), "breaks should progress away from shore");
  assert.ok(breaks.every((b) => b.color === "#d9f4ff"), "night foam should shift from pure white to moonlit blue");
});

test("low tier reduces shore break count but keeps the first near-shore band", async () => {
  const { makeAnimeShoreBreaks } = await importAnimeBayVisuals();

  const high = makeAnimeShoreBreaks({ bayAngle: 0.55, waterlineRadius: 248, lowTier: false, night: false });
  const low = makeAnimeShoreBreaks({ bayAngle: 0.55, waterlineRadius: 248, lowTier: true, night: false });

  assert.equal(low.length, 3);
  assert.equal(low[0].radius, high[0].radius);
  assert.ok(low.every((b) => b.color === "#f7fbff"));
});

test("anime sea palette darkens for night and softens for rain", async () => {
  const { resolveAnimeSeaPalette } = await importAnimeBayVisuals();

  const clearDay = resolveAnimeSeaPalette({
    sea: "#2fa6b8",
    seaHighlight: "#a8ecf2",
    timeOfDay: "noon",
    weather: "clear",
  });
  const night = resolveAnimeSeaPalette({
    sea: "#2fa6b8",
    seaHighlight: "#a8ecf2",
    timeOfDay: "night",
    weather: "clear",
  });
  const rain = resolveAnimeSeaPalette({
    sea: "#2fa6b8",
    seaHighlight: "#a8ecf2",
    timeOfDay: "sunset",
    weather: "rain",
  });

  assert.notEqual(clearDay.deep, night.deep);
  assert.equal(night.foam, "#d9f4ff");
  assert.ok(night.reflectionOpacity <= 0.18, "night reflection should be a subtle glint, not a filled oval patch");
  assert.equal(rain.reflectionOpacity < clearDay.reflectionOpacity, true);
  assert.equal(rain.waveOpacity < clearDay.waveOpacity, true);
});
