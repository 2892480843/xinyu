import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("drive scene lets desktop players press E to exit back to the island", async () => {
  const source = await readFile(path.resolve("src/components/DriveScene.tsx"), "utf8");

  assert.match(
    source,
    /if\s*\(\s*k\s*===\s*"e"\s*\)\s*\{[\s\S]*?onExit\(\);[\s\S]*?return;[\s\S]*?\}/,
    "keydown handler should call onExit and stop handling movement when E is pressed",
  );
  assert.match(
    source,
    /E\s+下车/,
    "desktop control hint should tell players E exits the car",
  );
});
