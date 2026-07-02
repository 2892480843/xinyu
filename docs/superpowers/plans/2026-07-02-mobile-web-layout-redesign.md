# Mobile Web-Aligned Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the existing mobile entry so `/mobile.html` follows the desktop Web homepage information hierarchy: brand, identity/map, inbox, direct `MoodInput`, island CTA, compact secondary links, and service notice.

**Architecture:** Keep the independent mobile entry and the current `useReflectFlow` state machine. Replace the three-tab shell in `HomeMobile.tsx` with a single scrollable Web-aligned mobile page, while retaining existing fullscreen overlays for loading, breathing, safety, narrative, silent mode, glyph canvas, time machine, mind map, island map, and explore mode.

**Tech Stack:** Vite 8, React 19, TypeScript, Tailwind CSS utilities plus `frontend/src/index.css`, Framer Motion, Node test runner, Playwright visual checks.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/tests/mobileCompletion.test.mjs` | Structure tests for Web-aligned mobile layout, direct `MoodInput`, no mobile tabbar in the main flow, PWA and explore constraints. |
| `frontend/tests/mobile_visual_check.mjs` | Mobile viewport checks for the new single-page flow, direct input, CTA, links, identity controls, and no horizontal overflow. |
| `frontend/src/mobile/pages/HomeMobile.tsx` | Main implementation: replace tabbed shell with Web-aligned single-column mobile home while preserving flow phases and overlays. |
| `frontend/src/index.css` | Mobile single-page layout classes and responsive constraints. Existing unused tabbar CSS can remain for now. |
| `docs/superpowers/plans/2026-07-02-mobile-web-layout-redesign.md` | This execution plan. |

## Task 1: Red Tests For Web-Aligned Mobile Structure

**Files:**
- Modify: `frontend/tests/mobileCompletion.test.mjs`

- [ ] **Step 1: Replace tab-shell assertions with Web-aligned layout assertions**

Edit `frontend/tests/mobileCompletion.test.mjs`. Replace the first six mobile layout/navigation/self-tab tests with these tests. Keep the PWA and explore tests that follow.

```js
test("mobile shell uses Web-aligned safe-area layout helpers", () => {
  const css = read("../src/index.css");
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(css, /\.mobile-web-shell\s*\{/);
  assert.match(css, /padding-left:\s*max\(1rem,\s*env\(safe-area-inset-left\)\)/);
  assert.match(css, /padding-bottom:\s*calc\(1\.25rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(home, /className="mobile-web-shell/);
  assert.match(home, /overflow-y-auto/);
  assert.doesNotMatch(home, /mobile-bottom-buffer/);
});

test("mobile home renders direct MoodInput instead of compose sheet", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(home, /<MoodInput\s+onSubmit=\{onSubmit\}\s+onSilent=\{openSilent\}\s+onGlyph=\{openGlyph\}\s+loading=\{false\}/);
  assert.doesNotMatch(home, /<BottomSheet\s+open=\{composeOpen\}/);
  assert.doesNotMatch(home, /setComposeOpen\(true\)/);
  assert.doesNotMatch(home, /const \[composeOpen/);
});

test("mobile home no longer uses the three-tab app shell", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.doesNotMatch(home, /MobileTabBar/);
  assert.doesNotMatch(home, /MemoryTab/);
  assert.doesNotMatch(home, /SelfTab/);
  assert.doesNotMatch(home, /type MobileTab/);
  assert.doesNotMatch(home, /const \[tab,/);
});

test("mobile home keeps Web homepage secondary actions", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(home, />\s*回望这些天\s*›\s*</);
  assert.match(home, /<IslandAssistant\s+userId=\{identity\.user_id\}/);
  assert.match(home, />\s*登高望岛\s*›\s*</);
  assert.match(home, />\s*心象地图\s*<\/button>/);
});

test("mobile identity and privacy actions remain reachable on the main screen", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(home, /<UserBadge\s+identity=\{identity\}\s+onClear=\{handleClearIdentity\}\s+onDeleteData=\{handleDeleteData\}/);
  assert.match(home, /《心屿》提供情感陪伴，并非心理咨询或医疗服务/);
});

test("mobile sheet utility remains available but is not the default input route", () => {
  const css = read("../src/index.css");
  const sheet = read("../src/mobile/components/BottomSheet.tsx");
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(css, /\.mobile-sheet-content\s*\{/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(sheet, /prevTouchAction/);
  assert.match(sheet, /document\.body\.style\.touchAction = "none"/);
  assert.doesNotMatch(home, /<BottomSheet\s+open=\{composeOpen\}/);
});
```

- [ ] **Step 2: Run the mobile structure tests and verify they fail**

Run:

```bash
cd frontend
npm run test -- tests/mobileCompletion.test.mjs
```

Expected: FAIL. At least the new assertions for `.mobile-web-shell`, no `MobileTabBar`, and direct `MoodInput` fail against the current tabbed mobile implementation.

- [ ] **Step 3: Commit the red tests**

```bash
git add frontend/tests/mobileCompletion.test.mjs
git commit -m "test: expect mobile web-aligned layout"
```

## Task 2: Convert HomeMobile To The Web-Aligned Single Page

**Files:**
- Modify: `frontend/src/mobile/pages/HomeMobile.tsx`

- [ ] **Step 1: Update imports**

In `frontend/src/mobile/pages/HomeMobile.tsx`, remove these imports:

```ts
import MobileTabBar, { type MobileTab } from "../components/MobileTabBar";
import BottomSheet from "../components/BottomSheet";
import MemoryTab from "../components/MemoryTab";
import SelfTab from "../components/SelfTab";
import IslandPhrases from "../../components/IslandPhrases";
import IslandLetter from "../../components/IslandLetter";
```

Add this import near the other component imports:

```ts
import UserBadge from "../../components/UserBadge";
```

- [ ] **Step 2: Remove tab and sheet state**

Remove these state declarations:

```ts
const [tab, setTab] = useState<MobileTab>("island");
const [composeOpen, setComposeOpen] = useState(false);
const [phrasesOpen, setPhrasesOpen] = useState(false);
const [letterOpen, setLetterOpen] = useState(false);
```

Keep these overlay states:

```ts
const [silentOpen, setSilentOpen] = useState(false);
const [glyphOpen, setGlyphOpen] = useState(false);
const [mindOpen, setMindOpen] = useState(false);
const [tmOpen, setTmOpen] = useState(false);
const [mapOpen, setMapOpen] = useState(false);
```

- [ ] **Step 3: Update identity reset and submit handlers**

Replace the body of `handleClearIdentity` with:

```ts
const handleClearIdentity = () => {
  clearIdentity();
  setIdentity(null);
  setMemories([]);
  setArtifacts([]);
  setWelcomeBack(null);
  setWhisper(null);
  setRevision(null);
  setFlowIsland(null);
  resetFlow();
  setSilentOpen(false);
  setGlyphOpen(false);
  setMindOpen(false);
  setTmOpen(false);
  setMapOpen(false);
};
```

Replace `onSubmit`, `openSilent`, and `openGlyph` with:

```ts
const onSubmit = (text: string, ephemeral: boolean) => {
  void flow.submit(text, ephemeral);
};

const openSilent = () => setSilentOpen(true);
const openGlyph = () => setGlyphOpen(true);
```

- [ ] **Step 4: Replace the `flow.phase === "input"` tabbed shell**

In the `flow.phase === "input"` branch, replace the current fragment that renders `mobile-app-shell`, tab-specific content, `MobileTabBar`, and compose `BottomSheet` with:

```tsx
{flow.phase === "input" && (
  <main
    className="mobile-web-shell relative z-20 mx-auto flex w-full max-w-[34rem] flex-col"
    style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
  >
    <section className="mobile-web-brand">
      <MobileBrand subtitle />
    </section>

    <section className="mobile-web-top-actions" aria-label="身份与心象入口">
      <UserBadge
        identity={identity}
        onClear={handleClearIdentity}
        onDeleteData={handleDeleteData}
      />
      <button
        type="button"
        onClick={() => setMindOpen(true)}
        className="mobile-web-map-button"
      >
        心象地图
      </button>
    </section>

    {flow.error && (
      <IslandHushCard
        kind={flow.errorKind}
        onRetry={flow.retry}
        onDismiss={flow.dismissError}
      />
    )}

    <MobileInbox revision={revision} welcomeBack={welcomeBack} whisper={whisper} />

    {nightWatch && !bedtime && (
      <div className="mobile-web-nightwatch">
        <NightWatchBanner onBedtime={() => setBedtime(true)} />
      </div>
    )}

    <section className="mobile-web-input" aria-label="说给岛屿">
      <MoodInput onSubmit={onSubmit} onSilent={openSilent} onGlyph={openGlyph} loading={false} />
      {memories.length > 0 && (
        <motion.p
          className="mt-3 text-center text-[12px] text-white/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
        >
          岛屿记得你上次的 {EMOTION_META[memories[0].emotion]?.label ?? "心事"}，欢迎回来
        </motion.p>
      )}
    </section>

    <section className="mobile-web-primary-action" aria-label="上岛探索">
      <motion.button
        type="button"
        onClick={() => { void openExploreMode(); }}
        onPointerEnter={prefetchExplore}
        onFocus={prefetchExplore}
        className="island-cta"
        style={{
          background: `linear-gradient(165deg, ${visual.accent} 0%, ${visual.accent}d9 52%, ${visual.accent}b3 100%)`,
          boxShadow: `0 16px 42px -10px ${visual.accent}, 0 3px 12px -3px ${visual.accent}cc, inset 0 1px 0 rgba(255,255,255,0.75)`,
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, scale: [1, ctaGlow.breathe, 1] }}
        transition={{
          opacity: { delay: 0.2, duration: 0.5 },
          y: { delay: 0.2, duration: 0.5 },
          scale: { delay: 0.8, duration: ctaGlow.dur, repeat: Infinity, ease: "easeInOut" },
        }}
        whileTap={{ scale: 0.96 }}
      >
        <motion.span
          className="island-cta__glow"
          style={{ background: `radial-gradient(ellipse at center, ${visual.accent} 0%, ${visual.accent}55 45%, transparent 72%)` }}
          animate={{ opacity: [ctaGlow.base, ctaGlow.peak, ctaGlow.base], scale: [1, ctaGlow.scale, 1] }}
          transition={{ duration: ctaGlow.dur, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="island-cta__ring"
          animate={{ scale: [1, ctaGlow.ringScale], opacity: [ctaGlow.ringOpacity, 0] }}
          transition={{ duration: ctaGlow.ringDur, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="island-cta__shine" aria-hidden />
        上岛走走
        <span className="island-cta__arrow" aria-hidden>›</span>
      </motion.button>
    </section>

    <section className="mobile-web-secondary-actions" aria-label="更多入口">
      {memories.length > 0 && (
        <button type="button" onClick={() => setTmOpen(true)} className="btn-link">
          回望这些天 ›
        </button>
      )}
      {memories.length > 0 && (
        <IslandAssistant userId={identity.user_id} zIndexClass="z-[85]" />
      )}
      {(memories.length > 0 || artifacts.length > 0) && (
        <button type="button" onClick={() => setMapOpen(true)} className="btn-link">
          登高望岛 ›
        </button>
      )}
    </section>

    <footer className="mobile-web-footer">
      <p>《心屿》提供情感陪伴，并非心理咨询或医疗服务 · 如处于危机请联系专业热线</p>
    </footer>
  </main>
)}
```

- [ ] **Step 5: Remove phrases and letter sheets**

Delete these render blocks from `HomeMobile.tsx`:

```tsx
<BottomSheet open={phrasesOpen} onClose={() => setPhrasesOpen(false)} label="私房安慰话" accent={visual.accent}>
  <IslandPhrases userId={identity.user_id} />
</BottomSheet>
<BottomSheet open={letterOpen} onClose={() => setLetterOpen(false)} label="岛屿年报" accent={visual.accent}>
  <IslandLetter userId={identity.user_id} memoryCount={memories.length} />
</BottomSheet>
```

Delete the fixed night watch banner block at the bottom of the component, because the new main flow renders `NightWatchBanner` inline:

```tsx
{nightWatch && !bedtime && flow.phase === "input" && (
  <div className="fixed inset-x-0 z-40 px-4" style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}>
    <div className="mx-auto max-w-[30rem]">
      <NightWatchBanner onBedtime={() => setBedtime(true)} />
    </div>
  </div>
)}
```

Keep the dimming overlay and `GoodnightScreen`:

```tsx
{nightWatch && !bedtime && (
  <div className="pointer-events-none fixed inset-0 z-10 bg-slate-950/45" aria-hidden />
)}
{bedtime && <GoodnightScreen onWake={() => setBedtime(false)} />}
```

- [ ] **Step 6: Run the structure tests**

Run:

```bash
cd frontend
npm run test -- tests/mobileCompletion.test.mjs
```

Expected: tests still fail only for missing CSS classes from Task 3, not for missing JSX structure or imports.

## Task 3: Add Mobile Web Layout CSS

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add single-page mobile layout classes**

Append these classes near the existing mobile classes in `frontend/src/index.css`, after `.mobile-sheet-content`:

```css
.mobile-web-shell {
  min-height: 100dvh;
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
  padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
  overflow-x: hidden;
}

.mobile-web-brand {
  display: flex;
  justify-content: center;
  padding-bottom: 0.8rem;
}

.mobile-web-top-actions {
  display: flex;
  width: min(100%, 30rem);
  margin-inline: auto;
  align-items: stretch;
  justify-content: center;
  gap: 0.65rem;
  padding-bottom: 0.8rem;
}

.mobile-web-top-actions > * {
  min-width: 0;
}

.mobile-web-top-actions > .max-w-\[min\(46vw\,16rem\)\] {
  max-width: none;
  flex: 1 1 0;
}

.mobile-web-map-button {
  min-height: 44px;
  flex: 0 0 auto;
  border-radius: 1rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.045)),
    rgba(10, 14, 31, 0.34);
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  letter-spacing: 0.08em;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.mobile-web-nightwatch {
  width: min(100%, 30rem);
  margin: 0 auto 0.8rem;
}

.mobile-web-input {
  width: 100%;
  margin-inline: auto;
}

.mobile-web-primary-action {
  display: flex;
  justify-content: center;
  padding-top: 1rem;
}

.mobile-web-primary-action .island-cta {
  min-height: 54px;
  width: min(100%, 18.5rem);
}

.mobile-web-secondary-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.45rem 0.9rem;
  min-height: 44px;
  padding-top: 0.75rem;
}

.mobile-web-footer {
  margin-top: auto;
  padding-top: 1rem;
  text-align: center;
}

.mobile-web-footer p {
  font-size: 10px;
  line-height: 1.7;
  letter-spacing: 0.08em;
  color: rgba(214, 226, 255, 0.42);
}

@media (max-width: 374px) {
  .mobile-web-top-actions {
    flex-direction: column;
  }

  .mobile-web-map-button {
    width: 100%;
  }
}
```

- [ ] **Step 2: Ensure root mobile page can scroll vertically**

In `HomeMobile.tsx`, change the root wrapper class from:

```tsx
<div className="relative min-h-[100dvh] overflow-x-hidden overflow-y-hidden">
```

to:

```tsx
<div className="relative min-h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-contain">
```

- [ ] **Step 3: Run the mobile structure tests**

Run:

```bash
cd frontend
npm run test -- tests/mobileCompletion.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit implementation and CSS**

```bash
git add frontend/src/mobile/pages/HomeMobile.tsx frontend/src/index.css
git commit -m "feat: align mobile layout with web home"
```

## Task 4: Update Mobile Visual Check For The New Flow

**Files:**
- Modify: `frontend/tests/mobile_visual_check.mjs`

- [ ] **Step 1: Replace tab and compose-sheet interactions**

In `frontend/tests/mobile_visual_check.mjs`, replace the interaction section after the first screenshot with this flow:

```js
await assertVisible(page, "岛屿正在聆听");
await assertVisible(page, "上岛走走");
await page.screenshot({ path: resolve(shotDir, "390-web-home.png"), fullPage: true });
await assertNoHorizontalOverflow(page);

await page.getByPlaceholder("岛屿正在聆听……把此刻的心情说给它听").fill("今天只是想来岛上坐一会儿。");
await page.waitForTimeout(500);
await page.screenshot({ path: resolve(shotDir, "390-direct-input.png"), fullPage: true });
await assertNoHorizontalOverflow(page);

await page.getByRole("button", { name: "心象地图" }).click();
await assertVisible(page, "还是一片刚刚浮出海面的岛屿");
await page.waitForTimeout(700);
await page.screenshot({ path: resolve(shotDir, "390-mind-map.png"), fullPage: true });
await assertNoHorizontalOverflow(page);
await page.getByRole("button", { name: "‹ 返回" }).click();
```

Replace the final viewport loop with:

```js
for (const [width, height, name] of [
  [360, 740, "360-web-home"],
  [390, 640, "390-short-web-home"],
  [430, 932, "430-web-home"],
]) {
  await page.setViewportSize({ width, height });
  await assertVisible(page, "心 屿");
  await assertVisible(page, "上岛走走");
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(shotDir, `${name}.png`), fullPage: true });
  await assertNoHorizontalOverflow(page);
}
```

- [ ] **Step 2: Run the Playwright visual check with a dev server**

Start Vite in one terminal:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Run the check in another terminal:

```bash
cd frontend
node tests/mobile_visual_check.mjs
```

Expected: PASS and screenshots written to `docs/screenshots/mobile-app-completion`.

- [ ] **Step 3: Commit visual check update**

```bash
git add frontend/tests/mobile_visual_check.mjs docs/screenshots/mobile-app-completion
git commit -m "test: update mobile visual check for web layout"
```

## Task 5: Full Verification

**Files:**
- Verify: `frontend/src/mobile/pages/HomeMobile.tsx`
- Verify: `frontend/src/index.css`
- Verify: `frontend/tests/mobileCompletion.test.mjs`
- Verify: `frontend/tests/mobile_visual_check.mjs`

- [ ] **Step 1: Run frontend tests**

Run:

```bash
cd frontend
npm run test
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS. Vite may print chunk size warnings already accepted by the project, but TypeScript and Vite build must exit with code 0.

- [ ] **Step 3: Run mobile visual check again**

With the Vite dev server running:

```bash
cd frontend
node tests/mobile_visual_check.mjs
```

Expected: PASS. Inspect these screenshots manually:

```text
docs/screenshots/mobile-app-completion/390-web-home.png
docs/screenshots/mobile-app-completion/390-direct-input.png
docs/screenshots/mobile-app-completion/390-mind-map.png
docs/screenshots/mobile-app-completion/360-web-home.png
docs/screenshots/mobile-app-completion/390-short-web-home.png
docs/screenshots/mobile-app-completion/430-web-home.png
```

Manual acceptance:

```text
1. Brand, identity, map button, inbox area, direct input, "上岛走走", secondary links, and service notice are visible or reachable by vertical scroll.
2. No mobile bottom tabbar appears.
3. Direct input is not hidden behind a sheet.
4. The mind map overlay opens and returns.
5. No text overlaps the CTA or exits the viewport horizontally.
```

- [ ] **Step 4: Commit final verification notes only if files changed**

If the visual check generated updated screenshots that should be kept:

```bash
git add docs/screenshots/mobile-app-completion
git commit -m "test: refresh mobile web layout screenshots"
```

If no tracked screenshot files changed:

```bash
git status --short
```

Expected: only unrelated pre-existing workspace changes remain.

## Self-Review

Spec coverage:

| Spec requirement | Covered by |
|---|---|
| Keep independent mobile entry | Task 1 keeps existing PWA/mobile tests. |
| Replace three Tab main navigation | Task 1 and Task 2 remove `MobileTabBar`, `MemoryTab`, `SelfTab` from `HomeMobile`. |
| Render `MoodInput` directly | Task 1 and Task 2 add direct `MoodInput` in the input phase. |
| Keep “上岛走走” below input | Task 2 adds `mobile-web-primary-action`; Task 3 sizes it. |
| Keep Web secondary actions | Task 1 and Task 2 add 回望、问问岛屿、登高望岛、心象地图. |
| Keep overlays | Task 2 retains loading, breathing, safety, narrative, silent, glyph, time machine, mind map, island map, and explore overlays. |
| Safe area and short-screen behavior | Task 3 adds mobile layout classes; Task 4 verifies 360/390/430 widths and short height. |
| Build and tests | Task 5 runs `npm run test`, `npm run build`, and visual checks. |

Placeholder scan:

```text
No placeholder markers, no deferred implementation steps, and no undefined function names are intentionally introduced by this plan.
```

Type consistency:

```text
The plan uses existing component props: `MoodInput.onSubmit/onSilent/onGlyph/loading`, `UserBadge.identity/onClear/onDeleteData`, `IslandAssistant.userId/zIndexClass`, `MindMap.variant="fullscreen"`, and existing `HomeMobile` state setters.
```
