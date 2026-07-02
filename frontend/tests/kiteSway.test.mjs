import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/ExploreMode.tsx", import.meta.url), "utf8");

test("floating kite keeps a corrected base yaw while swaying", async () => {
  assert.match(source, /baseRotation\?: \[number, number, number\]/);
  assert.match(source, /g\.rotation\.y = baseRotation\[1\] \+ Math\.sin\(t \* speed \* 0\.5\) \* 0\.18/);
  assert.match(source, /<FloatSway[\s\S]*url=\{MODELS\.kite\}[\s\S]*baseRotation=\{\[0, Math\.PI, 0\]\}/);
});
