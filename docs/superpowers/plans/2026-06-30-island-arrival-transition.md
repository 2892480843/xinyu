# Island Arrival Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight sea-mist transition after clicking `上岛走走` and before the 3D island is revealed.

**Architecture:** Keep the existing lazy `ExploreMode` mount path. Add a small home-page overlay state that appears immediately on entry, hides after a fixed minimum duration, and resets when exploration exits or errors. Implement the visual layer with existing Framer Motion plus CSS-only mist bands.

**Tech Stack:** React, TypeScript, Framer Motion, CSS, Node test runner.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/tests/homeIslandArrival.test.mjs` | Source-level regression tests for the arrival overlay, state flow, and reduced-motion CSS. |
| `frontend/src/pages/Home.tsx` | Entry state, timer cleanup, `IslandArrivalOverlay` component, and `上岛走走` click flow. |
| `frontend/src/index.css` | Sea-mist overlay styling and reduced-motion fallback. |

## Task 1: Red Test For Sea-Mist Arrival Entry

**Files:**
- Create: `frontend/tests/homeIslandArrival.test.mjs`

- [ ] **Step 1: Write the failing source-level test**

Create `frontend/tests/homeIslandArrival.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("home explore entry uses a timed sea-mist arrival overlay", () => {
  const home = read("../src/pages/Home.tsx");

  assert.match(home, /const EXPLORE_ARRIVAL_MIN_MS = 1150/);
  assert.match(home, /function IslandArrivalOverlay\(\{ visual \}: \{ visual: SceneVisual \}\)/);
  assert.match(home, /const \[exploreArrivalVisible,\s*setExploreArrivalVisible\] = useState\(false\)/);
  assert.match(home, /const openExploreMode = useCallback/);
  assert.match(home, /setExploreArrivalVisible\(true\);[\s\S]*setExploreOpen\(true\);/);
  assert.match(home, /window\.setTimeout\(\(\) => \{[\s\S]*setExploreArrivalVisible\(false\);[\s\S]*\}, EXPLORE_ARRIVAL_MIN_MS\)/);
  assert.match(home, /onClick=\{openExploreMode\}/);
  assert.match(home, /<IslandArrivalOverlay key="explore-arrival" visual=\{visual\} \/>/);
  assert.match(home, /role="status"/);
  assert.match(home, /aria-live="polite"/);
});

test("sea-mist arrival overlay has CSS motion and reduced-motion fallback", () => {
  const css = read("../src/index.css");

  assert.match(css, /\.island-arrival-overlay\s*\{/);
  assert.match(css, /\.island-arrival-mist\s*\{/);
  assert.match(css, /\.island-arrival-mist--near\s*\{/);
  assert.match(css, /@keyframes island-arrival-drift/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.island-arrival-overlay\s+\*[\s\S]*animation:\s*none/);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm test -- tests/homeIslandArrival.test.mjs
```

Expected: FAIL because `IslandArrivalOverlay`, `exploreArrivalVisible`, and the CSS classes do not exist yet.

- [ ] **Step 3: Commit nothing yet**

Do not commit after the red test. Continue to Task 2 so the next commit contains the tested behavior and implementation together.

## Task 2: Implement Home Entry State And Overlay

**Files:**
- Modify: `frontend/src/pages/Home.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/tests/homeIslandArrival.test.mjs`

- [ ] **Step 1: Add the minimum duration constant**

In `frontend/src/pages/Home.tsx`, add this after the `Phase` type:

```ts
const EXPLORE_ARRIVAL_MIN_MS = 1150;
```

- [ ] **Step 2: Add `IslandArrivalOverlay`**

In `frontend/src/pages/Home.tsx`, add this component before `export default function Home()`:

```tsx
function IslandArrivalOverlay({ visual }: { visual: SceneVisual }) {
  return (
    <motion.div
      key="explore-arrival"
      className="island-arrival-overlay"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.34, ease: "easeOut" }}
      style={{
        background: `linear-gradient(180deg, rgba(3, 8, 22, 0.82) 0%, ${visual.skyTop}88 48%, ${visual.sea}cc 100%)`,
      }}
    >
      <motion.div
        className="island-arrival-light"
        aria-hidden
        initial={{ opacity: 0.15, scale: 0.84, y: 24 }}
        animate={{ opacity: 0.82, scale: 1.08, y: 0 }}
        transition={{ duration: 1.05, ease: "easeOut" }}
        style={{ background: `radial-gradient(circle at center, ${visual.accent}d9 0%, ${visual.seaHighlight}80 38%, transparent 72%)` }}
      />
      <span className="island-arrival-mist island-arrival-mist--far" aria-hidden />
      <span className="island-arrival-mist island-arrival-mist--mid" aria-hidden />
      <span className="island-arrival-mist island-arrival-mist--near" aria-hidden />
      <motion.div
        className="island-arrival-copy"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}
      >
        <span className="island-arrival-kicker">海风把路照亮了</span>
        <strong>正在靠岸……</strong>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 3: Add arrival state, timer cleanup, open, and close handlers**

Inside `Home`, near the existing `exploreOpen` state, add:

```ts
  const [exploreArrivalVisible, setExploreArrivalVisible] = useState(false);
  const exploreArrivalTimerRef = useRef<number | null>(null);

  const clearExploreArrivalTimer = useCallback(() => {
    if (exploreArrivalTimerRef.current === null) return;
    window.clearTimeout(exploreArrivalTimerRef.current);
    exploreArrivalTimerRef.current = null;
  }, []);

  const openExploreMode = useCallback(() => {
    clearExploreArrivalTimer();
    setExploreArrivalVisible(true);
    setExploreOpen(true);
    exploreArrivalTimerRef.current = window.setTimeout(() => {
      setExploreArrivalVisible(false);
      exploreArrivalTimerRef.current = null;
    }, EXPLORE_ARRIVAL_MIN_MS);
  }, [clearExploreArrivalTimer]);

  const closeExploreMode = useCallback(() => {
    clearExploreArrivalTimer();
    setExploreArrivalVisible(false);
    setExploreOpen(false);
  }, [clearExploreArrivalTimer]);

  useEffect(() => () => clearExploreArrivalTimer(), [clearExploreArrivalTimer]);
```

- [ ] **Step 4: Wire the entry and exit paths**

In the `上岛走走` button, replace:

```tsx
onClick={() => setExploreOpen(true)}
```

with:

```tsx
onClick={openExploreMode}
```

In the explore render block, replace both direct closes:

```tsx
onError={() => setExploreOpen(false)}
onExit={() => setExploreOpen(false)}
```

with:

```tsx
onError={closeExploreMode}
onExit={closeExploreMode}
```

After the explore render block, add:

```tsx
      <AnimatePresence>
        {exploreArrivalVisible && <IslandArrivalOverlay key="explore-arrival" visual={visual} />}
      </AnimatePresence>
```

- [ ] **Step 5: Add CSS for sea mist and reduced motion**

Append this near the existing `.island-cta` CSS in `frontend/src/index.css`:

```css
.island-arrival-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: auto;
  color: rgba(255, 255, 255, 0.92);
}

.island-arrival-light {
  position: absolute;
  left: 50%;
  bottom: 15vh;
  width: min(72vw, 42rem);
  aspect-ratio: 1;
  border-radius: 9999px;
  transform: translateX(-50%);
  filter: blur(26px);
  opacity: 0.65;
}

.island-arrival-mist {
  position: absolute;
  left: 50%;
  bottom: -9vh;
  width: 150vw;
  height: 28vh;
  border-radius: 9999px 9999px 0 0;
  background:
    radial-gradient(ellipse at 18% 45%, rgba(255, 255, 255, 0.78), transparent 42%),
    radial-gradient(ellipse at 52% 30%, rgba(223, 244, 255, 0.7), transparent 46%),
    radial-gradient(ellipse at 84% 50%, rgba(255, 255, 255, 0.58), transparent 40%);
  filter: blur(18px);
  transform: translate3d(-50%, 0, 0);
  animation: island-arrival-drift 5.8s ease-in-out infinite alternate;
}

.island-arrival-mist--far {
  bottom: 6vh;
  opacity: 0.28;
  animation-duration: 7.2s;
}

.island-arrival-mist--mid {
  bottom: -1vh;
  opacity: 0.42;
  animation-duration: 6.4s;
  animation-delay: -1.3s;
}

.island-arrival-mist--near {
  bottom: -10vh;
  height: 34vh;
  opacity: 0.62;
  animation-duration: 5.2s;
  animation-delay: -0.7s;
}

.island-arrival-copy {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.42rem;
  padding: 0 1.25rem;
  text-align: center;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.42);
}

.island-arrival-copy strong {
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 650;
  letter-spacing: 0;
}

.island-arrival-kicker {
  font-size: 0.82rem;
  letter-spacing: 0;
  color: rgba(255, 255, 255, 0.68);
}

@media (max-width: 640px) {
  .island-arrival-copy strong {
    font-size: 1.55rem;
  }
}

@keyframes island-arrival-drift {
  from { transform: translate3d(-53%, 2%, 0) scaleX(0.96); }
  to { transform: translate3d(-47%, -4%, 0) scaleX(1.04); }
}

@media (prefers-reduced-motion: reduce) {
  .island-arrival-overlay *,
  .island-arrival-overlay *::before,
  .island-arrival-overlay *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm test -- tests/homeIslandArrival.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

Stage only the task files and commit:

```bash
cd /Users/a111/chen/code/心屿
git add frontend/tests/homeIslandArrival.test.mjs
git add -p frontend/src/pages/Home.tsx
git add -p frontend/src/index.css
git commit -m "feat: add island arrival transition"
```

## Task 3: Regression Verification

**Files:**
- Verify: `frontend/tests/homeIslandArrival.test.mjs`
- Verify: `frontend/tests/mobileCompletion.test.mjs`
- Verify: frontend build output

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm test -- tests/homeIslandArrival.test.mjs tests/mobileCompletion.test.mjs
```

Expected: PASS with no failures.

- [ ] **Step 2: Run full frontend tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm test
```

Expected: PASS with no failures.

- [ ] **Step 3: Build**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run build
```

Expected: PASS and Vite reports a successful production build.

- [ ] **Step 4: Browser smoke check**

Run or reuse the Vite dev server, open the app, click `上岛走走`, and verify:

- The full-screen sea-mist overlay appears immediately.
- `正在靠岸……` is visible.
- The overlay fades away and the island remains interactive.

- [ ] **Step 5: Final status**

Confirm `git diff --cached --name-status` is empty and report any pre-existing unrelated worktree changes separately.
