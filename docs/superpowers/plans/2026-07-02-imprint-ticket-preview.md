# Imprint Ticket Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a premium collectible ticket-style PNG preview flow for the heart imprint save action.

**Architecture:** Keep the implementation scoped to `NarrativeCard.tsx`. Extract the canvas drawing into a focused `createImprintTicketBlob()` helper inside the component file, then change the save button from immediate download to preview generation. Add one source-level regression test that locks the preview flow, Blob reuse, Object URL cleanup, accessibility hooks, and the ticket visual ingredients.

**Tech Stack:** React 19, TypeScript, Framer Motion, browser Canvas API, Node test runner.

---

## Files

- Modify: `frontend/src/components/NarrativeCard.tsx`
- Create: `frontend/tests/imprintTicketPreview.test.mjs`

## Task 1: Lock The Preview Flow With A Failing Test

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/imprintTicketPreview.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd frontend && node --test tests/imprintTicketPreview.test.mjs
```

Expected: fail because `createImprintTicketBlob`, preview state, and modal code do not exist yet.

## Task 2: Implement Ticket PNG Generation And Preview State

- [ ] **Step 1: Update imports and helper signature**

Modify the first line of `frontend/src/components/NarrativeCard.tsx`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
```

Replace the old save-only canvas function with:

```ts
function createImprintTicketBlob({ imprint, emotionLabel }: { imprint: string; emotionLabel: string }): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const scale = window.devicePixelRatio || 1;
    const width = 960;
    const height = 540;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas unavailable"));
      return;
    }

    ctx.scale(scale, scale);
    ctx.fillStyle = "#101827";
    ctx.fillRect(0, 0, width, height);
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(696, 64);
    ctx.lineTo(696, 476);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText("XINYU", 740, 128);
    ctx.fillText("心屿", 96, 126);
    drawWrappedText(ctx, imprint, 96, 232, 540, 58);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG export failed"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
```

- [ ] **Step 2: Add preview state and cleanup**

Inside `NarrativeCard`, near `saveMessage`, add:

```ts
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
const [previewOpen, setPreviewOpen] = useState(false);
const [savingPreview, setSavingPreview] = useState(false);

const closeImprintPreview = useCallback(() => {
  setPreviewOpen(false);
  setPreviewBlob(null);
  setPreviewUrl((current) => {
    if (current) URL.revokeObjectURL(current);
    return null;
  });
}, []);
```

Add an unmount cleanup:

```ts
useEffect(() => closeImprintPreview, [closeImprintPreview]);
```

- [ ] **Step 3: Convert save to preview and add download**

Replace `saveImprintAsPng` with:

```ts
const saveImprintAsPng = async () => {
  if (!result.imprint || savingPreview) return;
  setSavingPreview(true);
  setSaveMessage(null);

  try {
    const blob = await createImprintTicketBlob({ imprint: result.imprint, emotionLabel: meta.label });
    const url = URL.createObjectURL(blob);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(blob);
    setPreviewUrl(url);
    setPreviewOpen(true);
  } catch {
    setSaveMessage("预览生成失败，请稍后再试");
  } finally {
    setSavingPreview(false);
  }
};

const downloadPreviewPng = () => {
  if (!previewUrl || !previewBlob) return;
  const link = document.createElement("a");
  link.href = previewUrl;
  link.download = "xinyu-imprint.png";
  link.click();
  setSaveMessage("已生成 PNG");
};
```

- [ ] **Step 4: Run the test and keep fixing until it passes**

Run:

```bash
cd frontend && node --test tests/imprintTicketPreview.test.mjs
```

Expected: pass.

## Task 3: Add The Premium Preview Modal UI

- [ ] **Step 1: Add keyboard close handling**

Add:

```ts
useEffect(() => {
  if (!previewOpen) return;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeImprintPreview();
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [previewOpen, closeImprintPreview]);
```

- [ ] **Step 2: Update button state**

Change the save button to:

```tsx
<motion.button
  type="button"
  onClick={saveImprintAsPng}
  disabled={savingPreview}
  whileHover={{ y: -1 }}
  whileTap={{ scale: 0.96 }}
  transition={SPRING_TAP}
  className="btn-ghost text-[12px] px-3.5 py-1.5 disabled:opacity-45 disabled:cursor-wait"
>
  {savingPreview ? "生成预览中" : "保存为 PNG"}
</motion.button>
```

- [ ] **Step 3: Render modal after the imprint card**

Add conditional JSX:

```tsx
<AnimatePresence>
  {previewOpen && previewUrl && (
    <motion.div className="fixed inset-0 z-[95] grid place-items-center px-4 py-6" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default bg-slate-950/72 backdrop-blur-md" aria-label="关闭预览" onClick={closeImprintPreview} />
      <motion.div role="dialog" aria-modal="true" aria-labelledby="imprint-preview-title" className="panel-glass-3 relative z-10 w-full max-w-[780px] overflow-hidden rounded-[28px] p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-caption text-mist-400 tracking-[0.22em]">PNG PREVIEW</p>
            <h2 id="imprint-preview-title" className="mt-2 font-serif text-2xl text-mist-100">保存前预览</h2>
            <p className="mt-1 text-sm text-mist-300">这张岛屿票根会保存为 PNG。</p>
          </div>
          <button type="button" className="btn-ghost min-h-11 px-4 text-sm" onClick={closeImprintPreview}>取消</button>
        </div>
        <div className="rounded-[22px] border border-white/16 bg-black/20 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_24px_70px_rgba(0,0,0,0.32)]">
          <img src={previewUrl} alt="心灵印记 PNG 预览" className="block w-full rounded-[16px]" />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={closeImprintPreview}>取消</button>
          <motion.button type="button" className="btn-primary" onClick={downloadPreviewPng} whileTap={{ scale: 0.97 }} transition={SPRING_TAP}>下载 PNG</motion.button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 4: Run the targeted test**

Run:

```bash
cd frontend && node --test tests/imprintTicketPreview.test.mjs
```

Expected: pass.

## Task 4: Verify Build And Visual Surface

- [ ] **Step 1: Run targeted and full tests**

Run:

```bash
cd frontend && node --test tests/imprintTicketPreview.test.mjs
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Manual visual check**

Run the app and inspect the preview at desktop and mobile widths. Confirm:

- Preview opens before download.
- Ticket card looks like a dark collectible island ticket, not a generic card.
- Text is readable.
- Buttons do not overlap at 375px width.
- `Escape`, backdrop click, and cancel close the modal.

## Self-Review

- Spec coverage: the plan covers preview-before-download, Blob reuse, Object URL cleanup, collectible ticket visuals, mobile responsiveness, errors, accessibility, and build/test verification.
- Placeholder scan: no `TBD`, no open-ended “add error handling” task, and all implementation steps include concrete paths and snippets.
- Type consistency: helper, state names, and test assertions all use the same identifiers.
