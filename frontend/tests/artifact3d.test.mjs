import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importArtifact3d() {
  const sourcePath = path.resolve("src/lib/artifact3d.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.join(os.tmpdir(), "xinyu-artifact3d-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `artifact3d-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

const BACKEND_ARTIFACT_KEYS = [
  "lantern",
  "paper_boat",
  "night_flower",
  "shell",
  "star_wish",
  "river_lamp",
  "stone_cairn",
  "kite",
  "feather",
  "candle",
  "sail",
  "leaf_note",
  "bonfire",
  "bloom",
  "silent_shell",
  "glyph_stone",
];

const DEDICATED_ARTIFACT_GLBS = {
  star_wish: {
    url: "/models/xy_item_star_wish.glb",
    nodes: ["StarWish", "StarWishTop"],
    materials: ["Emissive_StarCore"],
  },
  sail: {
    url: "/models/xy_item_sail.glb",
    nodes: ["SmallSail"],
    materials: ["SailCloth"],
  },
  silent_shell: {
    url: "/models/xy_item_silent_shell.glb",
    nodes: ["SilentShell"],
    materials: ["SilentShellInner"],
  },
  glyph_stone: {
    url: "/models/xy_item_glyph_stone.glb",
    nodes: ["GlyphStone", "GlyphBack"],
    materials: ["Emissive_Glyph"],
  },
  bloom: {
    url: "/models/xy_item_bloom.glb",
    nodes: ["Bloom"],
    materials: ["BloomPetal"],
  },
};

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

test("artifact 3D registry covers every collectible artifact key", async () => {
  const { ARTIFACT_3D_REGISTRY } = await importArtifact3d();

  assert.deepEqual(Object.keys(ARTIFACT_3D_REGISTRY).sort(), BACKEND_ARTIFACT_KEYS.slice().sort());
});

test("artifact 3D registry points GLB entries at files that exist", async () => {
  const { ARTIFACT_3D_REGISTRY } = await importArtifact3d();

  for (const [key, entry] of Object.entries(ARTIFACT_3D_REGISTRY)) {
    assert.ok(entry.kind, `${key} should declare a render kind`);
    assert.equal(typeof entry.label, "string", `${key} should have a label`);

    if (entry.kind !== "glb") continue;
    assert.ok(entry.url.startsWith("/models/"), `${key} should use a public model URL`);
    await access(path.resolve("public", entry.url.slice(1)));
  }
});

test("artifact 3D registry exposes the existing GLBs that were not wired before", async () => {
  const { ARTIFACT_3D_REGISTRY } = await importArtifact3d();

  assert.equal(ARTIFACT_3D_REGISTRY.paper_boat.url, "/models/xy_item_paperboat.glb");
  assert.equal(ARTIFACT_3D_REGISTRY.candle.url, "/models/xy_item_candle.glb");
  assert.equal(ARTIFACT_3D_REGISTRY.feather.url, "/models/xy_item_feather.glb");
  assert.equal(ARTIFACT_3D_REGISTRY.leaf_note.url, "/models/xy_item_leafnote.glb");
});

test("artifact 3D registry uses dedicated GLBs for ritual artifacts that were previously fallbacks", async () => {
  const { ARTIFACT_3D_REGISTRY } = await importArtifact3d();

  for (const [key, expectation] of Object.entries(DEDICATED_ARTIFACT_GLBS)) {
    const entry = ARTIFACT_3D_REGISTRY[key];
    assert.equal(entry.kind, "glb", `${key} should render from GLB`);
    assert.equal(entry.url, expectation.url, `${key} should use its dedicated model`);
    assert.ok(!entry.tags.includes("fallback-glb"), `${key} should no longer be tagged as a fallback model`);
  }
});

test("dedicated ritual artifact GLBs expose recognizable node and material names", async () => {
  for (const [key, expectation] of Object.entries(DEDICATED_ARTIFACT_GLBS)) {
    const gltf = await readGlbJson(path.resolve("public", expectation.url.slice(1)));
    const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean));
    const materialNames = new Set((gltf.materials ?? []).map((material) => material.name).filter(Boolean));

    for (const node of expectation.nodes) {
      assert.ok(nodeNames.has(node), `${key} GLB should include node ${node}`);
    }
    for (const material of expectation.materials) {
      assert.ok(materialNames.has(material), `${key} GLB should include material ${material}`);
    }
  }
});

test("ExploreMode renders registry-backed ritual artifacts in the island", async () => {
  const source = await readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");

  assert.match(source, /ARTIFACT_3D_REGISTRY/);
  assert.match(source, /function RitualArtifactProp/);
  assert.match(source, /paperboat: ARTIFACT_3D_REGISTRY\.paper_boat\.url!/);
  assert.match(source, /candle: ARTIFACT_3D_REGISTRY\.candle\.url!/);
  assert.match(source, /feather: ARTIFACT_3D_REGISTRY\.feather\.url!/);
  assert.match(source, /leafnote: ARTIFACT_3D_REGISTRY\.leaf_note\.url!/);
  assert.match(source, /starwish: ARTIFACT_3D_REGISTRY\.star_wish\.url!/);
  assert.match(source, /sail: ARTIFACT_3D_REGISTRY\.sail\.url!/);
  assert.match(source, /silentshell: ARTIFACT_3D_REGISTRY\.silent_shell\.url!/);
  assert.match(source, /glyphstone: ARTIFACT_3D_REGISTRY\.glyph_stone\.url!/);
  assert.match(source, /bloom: ARTIFACT_3D_REGISTRY\.bloom\.url!/);

  for (const key of ["paper_boat", "candle", "feather", "leaf_note", "star_wish", "sail", "silent_shell", "glyph_stone"]) {
    assert.match(source, new RegExp(`key: "${key}"`), `${key} should be placed in the exploration scene`);
  }
});
