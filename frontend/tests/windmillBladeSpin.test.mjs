import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/ExploreMode.tsx", import.meta.url), "utf8");

test("landmark windmill spins only the blade mesh around its local blade axis", () => {
  assert.match(source, /axis\?:\s*"x"\s*\|\s*"y"\s*\|\s*"z"/);
  assert.match(source, /if \(spin\.axis === "x"\) spinNode\.rotateX\(amount\)/);
  assert.match(source, /else if \(spin\.axis === "y"\) spinNode\.rotateY\(amount\)/);
  assert.match(source, /else spinNode\.rotateZ\(amount\)/);
  assert.match(
    source,
    /<GltfProp[\s\S]*url=\{MODELS\.windmill\}[\s\S]*spin=\{\{ node: "Blades", speed: -0\.9, axis: "y" \}\}/,
  );
});

test("farmstead foreground windmill passes blade spin through grounded props", () => {
  assert.match(source, /function GroundProp\([\s\S]*spin\?:\s*GltfSpin/);
  assert.match(source, /<GltfProp[\s\S]*grounded[\s\S]*spin=\{spin\}/);
  assert.match(
    source,
    /<GroundProp[\s\S]*url=\{MODELS\.windmill\}[\s\S]*spin=\{\{ node: "Blades", speed: -0\.9, axis: "y" \}\}/,
  );
});
