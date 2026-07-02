import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("island and road cars use calmer top speed caps", async () => {
  const explore = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const drive = await readFile(path.resolve("src/components/DriveScene.tsx"), "utf8");

  assert.match(explore, /const CAR_MAX_SPEED = 22\b/);
  assert.match(explore, /const CAR_BOOST_SPEED = 38\b/);
  assert.match(drive, /const MAX_FWD = 22\b/);
  assert.match(drive, /const BOOST_FWD = 38\b/);
});
