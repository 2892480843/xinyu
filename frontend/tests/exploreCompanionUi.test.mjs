import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readExploreSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

test("explore mode renders a single companion entry button", async () => {
  const source = await readExploreSource();
  const matches = source.match(/aria-label=\{companionOpen \? "收起专属精灵" : "打开专属精灵"\}/g) ?? [];

  assert.equal(matches.length, 1);
});

test("explore mode routes companion panel actions to affectionate clips", async () => {
  const source = await readExploreSource();

  assert.match(source, /triggerCompanionAction\("Nuzzle"\)/);
  assert.match(source, /triggerCompanionAction\("CuriousPeek"\)/);
  assert.match(source, /normalizeCompanionAnimation\(ai\.animation\)/);
});

test("explore mode maps chatter events to exploration and night clips", async () => {
  const source = await readExploreSource();

  assert.match(source, /function companionChatterAction\(event: CompanionChatterEvent\): CompanionAnimation/);
  assert.match(source, /case "lantern":[\s\S]*return "LanternGaze"/);
  assert.match(source, /case "discover":[\s\S]*case "fish_catch":[\s\S]*case "collect":[\s\S]*return "DiscoveryHop"/);
  assert.match(source, /case "night":[\s\S]*return "NightGuard"/);
  assert.match(source, /triggerCompanionAction\(companionChatterAction\(event\)\)/);
});
