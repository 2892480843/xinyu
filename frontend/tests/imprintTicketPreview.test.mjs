import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(file) {
  return readFile(path.resolve(file), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("heart imprint save opens a preview modal before downloading", async () => {
  const source = await readSource("src/components/NarrativeCard.tsx");

  assert.match(source, /function createImprintTicketBlob\(/);
  assert.match(source, /const \[previewUrl,\s*setPreviewUrl\] = useState<string \| null>\(null\)/);
  assert.match(source, /const \[previewBlob,\s*setPreviewBlob\] = useState<Blob \| null>\(null\)/);
  assert.match(source, /const \[previewOpen,\s*setPreviewOpen\] = useState\(false\)/);
  assert.match(source, /const \[savingPreview,\s*setSavingPreview\] = useState\(false\)/);

  const saveBlock = sourceBlock(source, "const saveImprintAsPng = async () => {", "const downloadPreviewPng = () => {");
  assert.match(saveBlock, /const blob = await createImprintTicketBlob/);
  assert.match(saveBlock, /const url = URL\.createObjectURL\(blob\)/);
  assert.match(saveBlock, /setPreviewBlob\(blob\)/);
  assert.match(saveBlock, /setPreviewUrl\(url\)/);
  assert.match(saveBlock, /setPreviewOpen\(true\)/);
  assert.doesNotMatch(saveBlock, /link\.click\(\)/);

  const downloadBlock = sourceBlock(source, "const downloadPreviewPng = () => {", "return (");
  assert.match(downloadBlock, /if \(!previewUrl \|\| !previewBlob\) return/);
  assert.match(downloadBlock, /link\.href = previewUrl/);
  assert.match(downloadBlock, /link\.download = "xinyu-imprint\.png"/);
  assert.match(downloadBlock, /link\.click\(\)/);
});

test("preview modal is accessible and releases object URLs", async () => {
  const source = await readSource("src/components/NarrativeCard.tsx");

  assert.match(source, /const closeImprintPreview = useCallback\(\(\) => \{/);
  assert.match(source, /URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(source, /setPreviewUrl\(null\)/);
  assert.match(source, /setPreviewBlob\(null\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="imprint-preview-title"/);
  assert.match(source, />\s*取消\s*</);
  assert.match(source, />\s*下载 PNG\s*</);
  assert.match(source, /alt="心灵印记 PNG 预览"/);
});

test("heart imprint card presents a collectible ticket action instead of a generic PNG save button", async () => {
  const source = await readSource("src/components/NarrativeCard.tsx");
  const cardBlock = sourceBlock(source, "{result.imprint && done && (", "<AnimatePresence>");

  assert.match(cardBlock, /生成预览/);
  assert.match(cardBlock, /确认后保存 PNG/);
  assert.match(cardBlock, /aria-label="生成收藏票根预览"/);
  assert.match(cardBlock, /收藏票根/);
  assert.match(cardBlock, /ADMIT ONE MEMORY/);
  assert.match(cardBlock, /NO\. XINYU-PNG/);
  assert.match(cardBlock, /心屿留存/);
  assert.doesNotMatch(cardBlock, />\s*保存为 PNG\s*</);
  assert.doesNotMatch(cardBlock, />\s*生成收藏票根\s*</);
  assert.doesNotMatch(cardBlock, />\s*预览票根\s*</);
});

test("generated PNG uses collectible island ticket visual details", async () => {
  const source = await readSource("src/components/NarrativeCard.tsx");
  const drawBlock = sourceBlock(source, "function createImprintTicketBlob(", "const saveImprintAsPng = async () => {");

  assert.match(drawBlock, /const width = 960/);
  assert.match(drawBlock, /const height = 540/);
  assert.match(drawBlock, /setLineDash\(\[10, 12\]\)/);
  assert.match(drawBlock, /NO\. \$\{ticketNo\}/);
  assert.match(drawBlock, /ctx\.arc\(/);
  assert.match(drawBlock, /ctx\.rotate\(-0\.16\)/);
  assert.match(drawBlock, /XINYU/);
  assert.match(drawBlock, /心屿/);
  assert.match(drawBlock, /createRadialGradient/);
  assert.match(drawBlock, /drawWrappedText\(ctx, imprint,/);
});
