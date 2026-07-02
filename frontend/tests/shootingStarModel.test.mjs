import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const SHOOTING_STAR_URL = "/models/xy_fx_shooting_star.glb";

async function readGlbJson(filePath) {
  const bytes = await readFile(filePath);
  assert.equal(bytes.toString("utf8", 0, 4), "glTF", "expected a binary glTF file");

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString("utf8", offset + 4, offset + 8);
    offset += 8;

    if (type === "JSON") {
      return JSON.parse(bytes.toString("utf8", offset, offset + length).trim());
    }
    offset += length;
  }

  throw new Error("GLB JSON chunk not found");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("shooting star GLB exists with stable nodes and materials", async () => {
  const filePath = path.resolve("public", SHOOTING_STAR_URL.slice(1));
  await access(filePath);

  const gltf = await readGlbJson(filePath);
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

  for (const node of ["ShootingStarRoot", "Core", "Trail", "Glow"]) {
    assert.ok(nodeNames.has(node), `shooting star GLB should include node ${node}`);
  }

  for (const material of ["Emissive_StarCore", "Emissive_StarTrail", "Transparent_StarGlow"]) {
    assert.ok(materialNames.has(material), `shooting star GLB should include material ${material}`);
  }
});

test("StarWish renders the sky event through its dedicated GLB", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const block = sourceBlock(source, "function StarWish", "// —— 海与水秘密");

  assert.match(source, /shootingStar:\s*"\/models\/xy_fx_shooting_star\.glb"/);
  assert.match(source, /function GltfShootingStar/);
  assert.match(source, /useGLTF\(MODELS\.shootingStar\)/);
  assert.match(block, /<GltfShootingStar/);
  assert.doesNotMatch(block, /new THREE\.SphereGeometry\(0\.55,\s*8,\s*6\)/);
  assert.doesNotMatch(block, /<sphereGeometry/);
});
