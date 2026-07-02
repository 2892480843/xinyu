import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importImprint3d() {
  const sourcePath = path.resolve("src/lib/imprint3d.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.join(os.tmpdir(), "xinyu-imprint3d-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `imprint3d-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

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

const EXPECTED_IMPRINTS = {
  star: {
    url: "/models/xy_item_imprint_star.glb",
    nodes: ["ImprintStar", "StarCore"],
    materials: ["ImprintStarBody", "Emissive_ImprintStar"],
  },
  shell: {
    url: "/models/xy_item_imprint_shell.glb",
    nodes: ["ImprintShell", "ShellPearl"],
    materials: ["ImprintShellBody", "Emissive_ImprintShell"],
  },
  flower: {
    url: "/models/xy_item_imprint_flower.glb",
    nodes: ["ImprintFlower", "FlowerCore"],
    materials: ["ImprintFlowerPetal", "Emissive_ImprintFlower"],
  },
  spark: {
    url: "/models/xy_item_imprint_spark.glb",
    nodes: ["ImprintSpark", "SparkCore"],
    materials: ["ImprintSparkBody", "Emissive_ImprintSpark"],
  },
  drop: {
    url: "/models/xy_item_imprint_drop.glb",
    nodes: ["ImprintDrop", "DropCore"],
    materials: ["ImprintDropBody", "Emissive_ImprintDrop"],
  },
};

test("imprint 3D registry covers every memory imprint shape", async () => {
  const { IMPRINT_3D_REGISTRY, IMPRINT_3D_SHAPES } = await importImprint3d();

  assert.deepEqual(IMPRINT_3D_SHAPES, ["star", "shell", "flower", "spark", "drop"]);
  assert.deepEqual(Object.keys(IMPRINT_3D_REGISTRY).sort(), Object.keys(EXPECTED_IMPRINTS).sort());

  for (const [shape, expectation] of Object.entries(EXPECTED_IMPRINTS)) {
    const entry = IMPRINT_3D_REGISTRY[shape];
    assert.equal(entry.shape, shape);
    assert.equal(entry.url, expectation.url);
    assert.ok(entry.scale > 0, `${shape} should define a visible scale`);
    await access(path.resolve("public", expectation.url.slice(1)));
  }
});

test("emotion names map to the intended imprint shapes", async () => {
  const { imprintShapeForEmotion } = await importImprint3d();

  assert.equal(imprintShapeForEmotion("happy"), "star");
  assert.equal(imprintShapeForEmotion("calm"), "shell");
  assert.equal(imprintShapeForEmotion("lonely"), "flower");
  assert.equal(imprintShapeForEmotion("angry"), "spark");
  for (const emotion of ["sad", "anxious", "tired", "helpless", "unknown"]) {
    assert.equal(imprintShapeForEmotion(emotion), "drop");
  }
});

test("memory imprint GLBs expose stable node and material names", async () => {
  for (const [shape, expectation] of Object.entries(EXPECTED_IMPRINTS)) {
    const gltf = await readGlbJson(path.resolve("public", expectation.url.slice(1)));
    const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
    const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

    for (const node of expectation.nodes) {
      assert.ok(nodeNames.has(node), `${shape} GLB should include node ${node}`);
    }
    for (const material of expectation.materials) {
      assert.ok(materialNames.has(material), `${shape} GLB should include material ${material}`);
    }
  }
});

test("ExploreMode renders memory imprints through the imprint GLB registry", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
  const start = source.indexOf("function MemoryImprints");
  const end = source.indexOf("function MemoryTree", start);
  assert.notEqual(start, -1, "MemoryImprints should exist");
  assert.notEqual(end, -1, "MemoryTree should follow MemoryImprints");
  const block = source.slice(start, end);

  assert.match(source, /IMPRINT_3D_REGISTRY/);
  assert.match(source, /imprintShapeForEmotion/);
  assert.match(source, /function GltfMemoryImprint/);
  assert.match(block, /<GltfMemoryImprint imprint=\{imprints\[i\]\}/);
  assert.doesNotMatch(block, /new THREE\.OctahedronGeometry/);
  assert.doesNotMatch(block, /new THREE\.ConeGeometry/);
  assert.doesNotMatch(block, /new THREE\.IcosahedronGeometry/);
  assert.doesNotMatch(block, /new THREE\.TetrahedronGeometry/);
  assert.doesNotMatch(block, /new THREE\.SphereGeometry/);
});
