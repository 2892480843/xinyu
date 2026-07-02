import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const CROP_SPROUT_URL = "/models/xy_nat_crop_sprout.glb";

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

test("crop sprout GLB exists with stable nodes and materials", async () => {
  const filePath = path.resolve("public", CROP_SPROUT_URL.slice(1));
  await access(filePath);

  const gltf = await readGlbJson(filePath);
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
  const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

  for (const node of ["CropSproutRoot", "StemCluster", "LeafCluster", "SoilAnchor"]) {
    assert.ok(nodeNames.has(node), `crop sprout GLB should include node ${node}`);
  }

  for (const material of ["CropStem", "CropLeafLight", "CropLeafDark", "SoilAnchorMat"]) {
    assert.ok(materialNames.has(material), `crop sprout GLB should include material ${material}`);
  }
});

test("ExploreMode renders crop rows through the dedicated sprout GLB", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const block = sourceBlock(source, "const { scene: pineScene } = useGLTF(MODELS.natPine);", "// 浮标(实例化,水里漂)");
  const renderBlock = sourceBlock(source, "{/* 农田作物(glb) + 干草垛(glb) */}", "{/* 中央广场(铺石) */}");

  assert.match(source, /natCropSprout:\s*"\/models\/xy_nat_crop_sprout\.glb"/);
  assert.match(block, /useGLTF\(MODELS\.natCropSprout\)/);
  assert.match(block, /cropSproutG/);
  assert.match(renderBlock, /cropSproutG/);
  assert.doesNotMatch(renderBlock, /geo=\{gCrop\}/);
  assert.doesNotMatch(source, /const gCrop = useMemo\(\(\) => new THREE\.BoxGeometry\(0\.16,\s*0\.55,\s*0\.16\)/);
});

test("crop rows avoid the pond waterline after sprout readability upgrade", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const block = sourceBlock(source, "const cropItems = useMemo(() => {", "const hayItems = useMemo(() => {");

  assert.match(source, /const POND_CROP_CLEARANCE = 8\.5;/);
  assert.match(block, /Math\.hypot\(wx - POND\.x,\s*wz - POND\.z\) < POND_CROP_CLEARANCE/);
});
