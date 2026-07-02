import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const SPEC_GLOSS_EXTENSION = "KHR_materials_pbrSpecularGlossiness";

async function listGlbFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return listGlbFiles(file);
    return entry.name.toLowerCase().endsWith(".glb") ? [file] : [];
  }));
  return files.flat();
}

function readGlbJson(buffer, file) {
  if (buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error(`${file} is not a binary glTF file`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  const chunkType = buffer.toString("utf8", 16, 20);
  assert.equal(chunkType.trim(), "JSON", `${file} first chunk should be JSON`);
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
}

function containsSpecGloss(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsSpecGloss);
  return Object.entries(value).some(([key, nested]) => key === SPEC_GLOSS_EXTENSION || containsSpecGloss(nested));
}

test("public GLB assets do not require the removed specular-glossiness material extension", async () => {
  const modelDir = path.resolve("public/models");
  const files = await listGlbFiles(modelDir);
  const offenders = [];

  for (const file of files) {
    const json = readGlbJson(await readFile(file), file);
    if (containsSpecGloss(json)) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(offenders, []);
});
