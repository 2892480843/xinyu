import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import * as THREE from "three";

async function importToonGeo() {
  const sourcePath = path.resolve("src/lib/toonGeo.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.resolve("node_modules/.tmp/xinyu-toon-geo-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `toonGeo-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

test("merges toon geometries even when index attributes differ", async () => {
  const { mergeToonGeometries, tinted } = await importToonGeo();

  const merged = mergeToonGeometries([
    tinted(new THREE.CylinderGeometry(0.16, 0.22, 1.5, 6), "#765539"),
    tinted(new THREE.IcosahedronGeometry(1.15, 1), "#5f9e54"),
  ]);

  assert.ok(merged);
  assert.equal(merged.index, null);
  assert.ok(merged.getAttribute("position").count > 0);
  assert.equal(merged.getAttribute("color").count, merged.getAttribute("position").count);
});
