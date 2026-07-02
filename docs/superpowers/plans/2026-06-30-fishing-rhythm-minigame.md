# Fishing Rhythm Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing bay fishing interaction into a one-click rhythm minigame with a bite window, success catch card, gentle miss feedback, keyboard support, and preserved bobber rendering.

**Architecture:** Add a small `frontend/src/lib/fishing.ts` module for rhythm constants and pure timing helpers, then keep the React/Three.js wiring inside `ExploreMode.tsx`. Tests first cover the pure helpers through TypeScript transpilation, then source-check the `ExploreMode` HUD/state/keyboard integration in the same style as existing frontend tests.

**Tech Stack:** Vite, React 19, Three.js/R3F, TypeScript, Node `node:test`, TypeScript `transpileModule`.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/fishing.ts` | Create | Holds `FishingState`, rhythm duration/window constants, progress clamp logic, hit detection, miss reason, and wait-time generation. |
| `frontend/tests/fishingRhythm.test.mjs` | Create | Tests pure fishing rhythm behavior and verifies `ExploreMode.tsx` is wired to the rhythm HUD/state/keyboard path. |
| `frontend/src/components/ExploreMode.tsx` | Modify | Imports rhythm helpers, adds a module-level fishing catch table, expands the fishing state machine, renders `FishingRhythmHud`, handles success/miss, and listens for `Space`/`Enter` while fish are biting. |

The worktree already has unrelated modified and untracked files. Every commit step must stage only the paths listed in that task.

---

### Task 1: Add Failing Pure Rhythm Tests

**Files:**
- Create: `frontend/tests/fishingRhythm.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/fishingRhythm.test.mjs` with this exact content:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function importFishingModule() {
  const source = await readFile(path.resolve("src/lib/fishing.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  }).outputText;
  const dir = await mkdtemp(path.join(os.tmpdir(), "xy-fishing-"));
  const modulePath = path.join(dir, "fishing.mjs");
  await writeFile(modulePath, output, "utf8");
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
}

test("fishing rhythm progress clamps from 0 to 1", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.FISHING_RHYTHM_DURATION_MS, 1800);
  assert.equal(fishing.fishingRhythmProgress(1000, 1000), 0);
  assert.equal(fishing.fishingRhythmProgress(1900, 1000), 0.5);
  assert.equal(fishing.fishingRhythmProgress(4000, 1000), 1);
  assert.equal(fishing.fishingRhythmProgress(900, 1000), 0);
  assert.equal(fishing.fishingRhythmProgress(1000, 1000, 0), 1);
});

test("fishing rhythm hit window accepts the middle and rejects early or late reels", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.FISHING_HIT_START, 0.38);
  assert.equal(fishing.FISHING_HIT_END, 0.62);
  assert.equal(fishing.isFishingRhythmHit(0.37), false);
  assert.equal(fishing.isFishingRhythmHit(0.38), true);
  assert.equal(fishing.isFishingRhythmHit(0.5), true);
  assert.equal(fishing.isFishingRhythmHit(0.62), true);
  assert.equal(fishing.isFishingRhythmHit(0.63), false);
  assert.equal(fishing.isFishingRhythmHit(Number.NaN), false);
});

test("fishing miss reason separates early and late reels", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.fishingMissReason(0.12), "early");
  assert.equal(fishing.fishingMissReason(0.7), "late");
});

test("fishing wait time stays inside the existing gentle wait range", async () => {
  const fishing = await importFishingModule();

  assert.equal(fishing.pickFishingWaitMs(() => 0), 1600);
  assert.equal(fishing.pickFishingWaitMs(() => 1), 3800);
  assert.equal(fishing.pickFishingWaitMs(() => 0.5), 2700);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingRhythm.test.mjs
```

Expected: FAIL with an `ENOENT` error for `src/lib/fishing.ts`, because the production module has not been created yet.

- [ ] **Step 3: Commit only the failing test**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/tests/fishingRhythm.test.mjs
git commit -m "test: add fishing rhythm red tests"
```

Expected: commit succeeds and only `frontend/tests/fishingRhythm.test.mjs` is included.

---

### Task 2: Implement Fishing Rhythm Helpers

**Files:**
- Create: `frontend/src/lib/fishing.ts`
- Test: `frontend/tests/fishingRhythm.test.mjs`

- [ ] **Step 1: Write the minimal implementation**

Create `frontend/src/lib/fishing.ts` with this exact content:

```ts
export type FishingState = "idle" | "cast" | "waiting" | "bite" | "missed";
export type FishingMissReason = "early" | "late";

export const FISHING_RHYTHM_DURATION_MS = 1800;
export const FISHING_HIT_START = 0.38;
export const FISHING_HIT_END = 0.62;
export const FISHING_WAIT_MIN_MS = 1600;
export const FISHING_WAIT_MAX_MS = 3800;

export function fishingRhythmProgress(
  nowMs: number,
  startedAtMs: number,
  durationMs = FISHING_RHYTHM_DURATION_MS,
): number {
  if (durationMs <= 0) return 1;
  const progress = (nowMs - startedAtMs) / durationMs;
  return Math.min(1, Math.max(0, progress));
}

export function isFishingRhythmHit(
  progress: number,
  hitStart = FISHING_HIT_START,
  hitEnd = FISHING_HIT_END,
): boolean {
  return Number.isFinite(progress) && progress >= hitStart && progress <= hitEnd;
}

export function fishingMissReason(progress: number): FishingMissReason {
  return progress < FISHING_HIT_START ? "early" : "late";
}

export function pickFishingWaitMs(random = Math.random): number {
  return FISHING_WAIT_MIN_MS + random() * (FISHING_WAIT_MAX_MS - FISHING_WAIT_MIN_MS);
}
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingRhythm.test.mjs
```

Expected: PASS for all 4 tests in `tests/fishingRhythm.test.mjs`.

- [ ] **Step 3: Commit helper implementation**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/src/lib/fishing.ts frontend/tests/fishingRhythm.test.mjs
git commit -m "feat: add fishing rhythm helpers"
```

Expected: commit succeeds and includes only the helper module plus its test.

---

### Task 3: Add Failing ExploreMode Wiring Tests

**Files:**
- Modify: `frontend/tests/fishingRhythm.test.mjs`
- Test: `frontend/tests/fishingRhythm.test.mjs`

- [ ] **Step 1: Append source wiring tests**

Append this exact code to `frontend/tests/fishingRhythm.test.mjs`:

```js
async function readExploreModeSource() {
  return readFile(path.resolve("src/components/ExploreMode.tsx"), "utf8");
}

function sourceBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  assert.notEqual(end, -1, `${endNeedle} should follow ${startNeedle}`);
  return source.slice(start, end);
}

test("ExploreMode wires the fishing rhythm state machine and HUD", async () => {
  const source = await readExploreModeSource();
  const stateBlock = sourceBlock(source, "const [atWater, setAtWater]", "const [songProgress, setSongProgress]");
  const effectsBlock = sourceBlock(source, "useEffect(() => {\n    if (fishing === \"cast\")", "// 风铃心曲");
  const actionBlock = sourceBlock(source, "const onCast = useCallback(() => {", "const ringChime =");
  const hudBlock = sourceBlock(source, "function FishingRhythmHud", "function LocationAudio");
  const renderBlock = sourceBlock(source, "{/* 海湾岸边:垂钓按钮", "{/* 🐚 听海海螺");

  assert.match(source, /from "\.\.\/lib\/fishing"/);
  assert.match(stateBlock, /useState<FishingState>\("idle"\)/);
  assert.match(stateBlock, /const \[rhythmStartedAt, setRhythmStartedAt\]/);
  assert.match(stateBlock, /const \[fishingMiss, setFishingMiss\]/);
  assert.match(effectsBlock, /setFishing\("waiting"\)/);
  assert.match(effectsBlock, /setFishing\("bite"\)/);
  assert.match(effectsBlock, /FISHING_RHYTHM_DURATION_MS/);
  assert.match(actionBlock, /fishingRhythmProgress\(Date\.now\(\), rhythmStartedAt\)/);
  assert.match(actionBlock, /isFishingRhythmHit\(progress\)/);
  assert.match(actionBlock, /fishingMissReason\(progress\)/);
  assert.match(actionBlock, /FISHING_CATCHES/);
  assert.match(hudBlock, /aria-label="收线"/);
  assert.match(hudBlock, /fishingRhythmProgress\(now, startedAt\)/);
  assert.match(hudBlock, /isFishingRhythmHit\(progress\)/);
  assert.match(renderBlock, /<FishingRhythmHud/);
  assert.match(renderBlock, /等鱼靠近/);
  assert.match(renderBlock, /别急，它刚碰到浮标/);
  assert.match(renderBlock, /鱼从光里游走了/);
});

test("ExploreMode supports keyboard reeling during the bite window", async () => {
  const source = await readExploreModeSource();
  const keyboardBlock = sourceBlock(source, "window.addEventListener(\"keydown\"", "window.removeEventListener(\"keydown\"");

  assert.match(keyboardBlock, /event\.code !== "Space"/);
  assert.match(keyboardBlock, /event\.code !== "Enter"/);
  assert.match(keyboardBlock, /event\.preventDefault\(\)/);
  assert.match(keyboardBlock, /onCast\(\)/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingRhythm.test.mjs
```

Expected: FAIL because `ExploreMode.tsx` has not imported `../lib/fishing`, does not define `FishingRhythmHud`, and still has the old `idle | cast | bite` fishing state.

- [ ] **Step 3: Commit only the failing integration tests**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/tests/fishingRhythm.test.mjs
git commit -m "test: cover fishing rhythm integration"
```

Expected: commit succeeds and includes only `frontend/tests/fishingRhythm.test.mjs`.

---

### Task 4: Implement ExploreMode Rhythm Minigame

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`
- Test: `frontend/tests/fishingRhythm.test.mjs`

- [ ] **Step 1: Add the fishing helper import**

In `frontend/src/components/ExploreMode.tsx`, update the first React import so it includes `useCallback`:

```ts
import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
```

Then add this import after the existing `exploreEnvironment` import block:

```ts
import {
  FISHING_RHYTHM_DURATION_MS,
  fishingMissReason,
  fishingRhythmProgress,
  isFishingRhythmHit,
  pickFishingWaitMs,
  type FishingMissReason,
  type FishingState,
} from "../lib/fishing";
```

- [ ] **Step 2: Add the module-level catch table and rhythm HUD component**

Insert this code after the `FishingSpot` component and before `function LocationAudio`:

```tsx
const FISHING_CATCHES: { icon: string; title: string; lines: string[] }[] = [
  { icon: "🐚", title: "一枚贝壳", lines: ["贴近耳边,你听见很远很远的海。", "它把潮声收了起来,等你想听的时候。", "纹路温温的,像谁的指纹。"] },
  { icon: "🍾", title: "一只漂流瓶", lines: ["「今天也辛苦了,记得好好吃饭。」", "「看见这行字的此刻,你正被惦记着。」", "「慢慢来,海不会催你。」"] },
  { icon: "🐟", title: "一条小鱼", lines: ["你把它放回海里,水面漾开一圈星光。", "它绕你一圈,像在道谢,然后游远了。"] },
  { icon: "⭐", title: "一尾星海鱼", lines: ["稀客——鳞片随你此刻的心情变色。", "钓到它的人,心里大多都藏着光。"] },
];

function FishingRhythmHud({ startedAt, onReel }: { startedAt: number; onReel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const progress = fishingRhythmProgress(now, startedAt);
  const inWindow = isFishingRhythmHit(progress);
  const ringScale = Math.max(0.36, 1.24 - progress * 0.86);
  const ringOpacity = Math.max(0.42, 1 - progress * 0.36);

  return (
    <div className="panel-glass-2 rounded-card px-4 py-3 text-center text-white/90 shadow-2xl" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="relative h-[4.75rem] w-[4.75rem] shrink-0">
          <div className="absolute inset-3 rounded-full border border-cyan-100/55 bg-cyan-100/10" />
          <div
            className="absolute inset-0 rounded-full border-2 border-white/80"
            style={{
              opacity: ringOpacity,
              transform: `scale(${ringScale})`,
              boxShadow: inWindow ? "0 0 24px rgba(125, 231, 255, 0.75)" : "0 0 14px rgba(255,255,255,0.28)",
              transition: "box-shadow 120ms ease-out",
            }}
          />
          <div
            className="absolute inset-[1.58rem] rounded-full border-2"
            style={{
              borderColor: inWindow ? "rgba(134, 239, 172, 0.95)" : "rgba(255,255,255,0.34)",
              background: inWindow ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.07)",
            }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[20px] leading-none">🎣</span>
        </div>
        <div className="min-w-0 text-left">
          <p className="font-display text-[15px] tracking-wider">{inWindow ? "现在收线!" : "盯住光圈"}</p>
          <p className="mt-1 text-caption leading-relaxed text-white/58">光圈贴近内环时收线，鱼会跟着海光上来。</p>
          <button
            type="button"
            onClick={onReel}
            className="btn-primary mt-2 px-5 py-2 text-[13px]"
            aria-label="收线"
          >
            收线
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace fishing state declarations**

Replace the current block from `const [atWater, setAtWater] = useState(false);` through the `catchCount` state initializer that reads `localStorage.getItem("xy_catch")` with this exact block:

```tsx
  const [atWater, setAtWater] = useState(false);
  const [fishing, setFishing] = useState<FishingState>("idle");
  const [rhythmStartedAt, setRhythmStartedAt] = useState(0);
  const [fishingMiss, setFishingMiss] = useState<FishingMissReason | null>(null);
  const [shownCatch, setShownCatch] = useState<{ icon: string; title: string; line: string } | null>(null);
  const [catchCount, setCatchCount] = useState<number>(() => { try { return parseInt(localStorage.getItem("xy_catch") || "0", 10) || 0; } catch { return 0; } });
```

- [ ] **Step 4: Replace fishing state effects**

Replace the existing fishing effect block that starts with `// 垂钓:抛竿 → 鱼讯` and the following water-exit reset effect with this exact code:

```tsx
  // 垂钓:抛竿 → 等鱼 → 节奏收线;错过/离开水边都会温和复位
  useEffect(() => {
    if (fishing === "cast") {
      const t = window.setTimeout(() => setFishing("waiting"), 650);
      return () => window.clearTimeout(t);
    }
    if (fishing === "waiting") {
      const t = window.setTimeout(() => {
        setRhythmStartedAt(Date.now());
        setFishing("bite");
        playSfx("ripple");
      }, pickFishingWaitMs());
      return () => window.clearTimeout(t);
    }
    if (fishing === "bite") {
      const t = window.setTimeout(() => {
        setFishingMiss("late");
        setFishing("missed");
        playSfx("ripple");
      }, FISHING_RHYTHM_DURATION_MS);
      return () => window.clearTimeout(t);
    }
    if (fishing === "missed") {
      const t = window.setTimeout(() => {
        setFishingMiss(null);
        setFishing("idle");
      }, 1300);
      return () => window.clearTimeout(t);
    }
  }, [fishing]);
  useEffect(() => {
    if (!atWater && fishing !== "idle") {
      setFishingMiss(null);
      setFishing("idle");
    }
  }, [atWater, fishing]);
```

- [ ] **Step 5: Replace the fishing action handler**

Delete the existing in-component `const CATCHES: { icon: string; title: string; lines: string[] }[]` array, because Task 4 Step 2 moved it to `FISHING_CATCHES` at module scope. Then replace the current `onCast` function block with this exact code:

```tsx
  const onCast = useCallback(() => {
    if (fishing === "idle") {
      setFishingMiss(null);
      setFishing("cast");
      playSfx("tap");
      return;
    }
    if (fishing === "waiting") {
      setFishingMiss(null);
      setFishing("idle");
      playSfx("tap");
      return;
    }
    if (fishing !== "bite") return;

    const progress = fishingRhythmProgress(Date.now(), rhythmStartedAt);
    if (!isFishingRhythmHit(progress)) {
      setFishingMiss(fishingMissReason(progress));
      setFishing("missed");
      playSfx("ripple");
      return;
    }

    const c = FISHING_CATCHES[Math.floor(Math.random() * FISHING_CATCHES.length)];
    const line = c.lines[Math.floor(Math.random() * c.lines.length)];
    setShownCatch({ icon: c.icon, title: c.title, line });
    setCatchCount((n) => n + 1);
    setFishingMiss(null);
    setFishing("idle");
    playSfx(c.icon === "🐟" ? "ripple" : "shell");
    emitCompanionEvent("fish_catch");
  }, [fishing, rhythmStartedAt]);
  useEffect(() => {
    if (fishing !== "bite") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "Space" && event.code !== "Enter") return;
      event.preventDefault();
      onCast();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fishing, onCast]);
```

- [ ] **Step 6: Replace the fishing HUD JSX**

Replace the current block beginning with `{/* 海湾岸边:垂钓按钮` and ending before `{/* 🐚 听海海螺` with this exact JSX:

```tsx
      {/* 海湾岸边:垂钓按钮(底部居中,避开送心愿) */}
      {atWater && nearNpc < 0 && (
        <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: "calc(2.4rem + env(safe-area-inset-bottom))" }}>
          {fishing === "bite" ? (
            <FishingRhythmHud startedAt={rhythmStartedAt} onReel={onCast} />
          ) : fishing === "missed" ? (
            <div className="panel-glass-2 rounded-full px-5 py-2.5 text-center font-display text-[14px] tracking-wider text-white/86" role="status" aria-live="polite">
              {fishingMiss === "early" ? "别急，它刚碰到浮标。" : "鱼从光里游走了。"}
            </div>
          ) : (
            <button
              type="button"
              onClick={onCast}
              className="panel-glass-2 rounded-full px-6 py-2.5 font-display text-[15px] tracking-wider text-white/90 active:scale-95 transition-transform"
            >
              {fishing === "idle" ? "🎣 垂钓" : fishing === "cast" ? "抛竿中…" : "等鱼靠近…"}
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 7: Run the focused test to verify it passes**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && node --test tests/fishingRhythm.test.mjs
```

Expected: PASS for helper behavior tests and `ExploreMode` wiring tests.

- [ ] **Step 8: Commit ExploreMode implementation**

Run:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/src/components/ExploreMode.tsx frontend/src/lib/fishing.ts frontend/tests/fishingRhythm.test.mjs
git commit -m "feat: add fishing rhythm minigame"
```

Expected: commit succeeds and includes only the fishing helper, fishing tests, and `ExploreMode.tsx`.

---

### Task 5: Full Verification

**Files:**
- Verify: `frontend/src/lib/fishing.ts`
- Verify: `frontend/src/components/ExploreMode.tsx`
- Verify: `frontend/tests/fishingRhythm.test.mjs`

- [ ] **Step 1: Run the full frontend test suite**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && npm test
```

Expected: PASS for all `tests/*.test.mjs` files.

- [ ] **Step 2: Run lint**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && npm run lint
```

Expected: PASS without new lint errors from `src/lib/fishing.ts`, `src/components/ExploreMode.tsx`, or `tests/fishingRhythm.test.mjs`.

- [ ] **Step 3: Run production build**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && npm run build
```

Expected: TypeScript build and Vite production build complete successfully.

- [ ] **Step 4: Start a local dev server for manual visual verification**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend && npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, normally `http://127.0.0.1:5173/`. Keep this server running only while checking the UI.

- [ ] **Step 5: Manual visual check**

Open the Vite URL, enter「上岛走走」, move to the bay, click「🎣 垂钓」, and verify:

```text
1. The fishing bobber appears on the water after casting.
2. The HUD changes from 抛竿中… to 等鱼靠近… to the rhythm panel.
3. The rhythm panel shows the shrinking ring and a 收线 button.
4. Clicking 收线 in the highlighted window opens the existing catch card and increments 已拾得.
5. Clicking too early or waiting too long shows 别急，它刚碰到浮标。 or 鱼从光里游走了。
6. Space or Enter also reels during the bite window.
7. Leaving the bay cancels the fishing state and hides the bobber.
```

- [ ] **Step 6: Commit verification notes if docs were updated**

If a visual inspection note or screenshot is added, run:

```bash
cd /Users/a111/chen/code/心屿
git add docs/screenshots docs/fishing-bobber-visual-inspection.md
git commit -m "docs: verify fishing rhythm minigame"
```

Expected: commit only if a verification artifact was actually created. If no docs or screenshots changed, skip this commit.

---

## Self-Review

**Spec coverage**

| Spec requirement | Plan coverage |
|---|---|
| Rhythm minigame with shrinking ring | Task 4 adds `FishingRhythmHud` with ring scale and hit-window glow. |
| Preserve bobber GLB | Task 4 leaves `FishingSpot`/`GltfFishingBobber` intact; existing bobber tests continue to run in Task 5. |
| Preserve catch card and `xy_catch` | Task 4 keeps `shownCatch` and `catchCount` logic, only gates it behind rhythm hit detection. |
| Gentle miss feedback | Task 4 adds `missed` state and early/late text. |
| Desktop and mobile support | Task 4 keeps touch/click button and adds `Space`/`Enter`; Task 5 includes manual checks. |
| Pure helper testability | Tasks 1-2 create and test `src/lib/fishing.ts`. |
| No backend or large dependency | File structure only touches frontend source/tests. |

**Placeholder scan**

No placeholder-marker strings or open-ended test instructions are present. Every code-changing task includes exact code blocks and exact verification commands.

**Type consistency**

`FishingState`, `FishingMissReason`, `FISHING_RHYTHM_DURATION_MS`, `fishingRhythmProgress`, `isFishingRhythmHit`, `fishingMissReason`, and `pickFishingWaitMs` are defined in Task 2 and used with the same names in Tasks 3-4.
