# Mobile App Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing mobile entry as a complete app-like experience that matches the web visual language.

**Architecture:** Keep `frontend/mobile.html` and `frontend/src/mobile` as the mobile app shell. Reuse the desktop scene, narrative, safety, memory, music, and exploration components, while tightening mobile-only navigation, sheet behavior, compact cards, safe areas, and visual polish.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind CSS 3, Framer Motion, existing shared CSS classes in `frontend/src/index.css`.

---

## Files

| Path | Responsibility |
|---|---|
| `frontend/src/mobile/pages/HomeMobile.tsx` | Main mobile shell, state orchestration, overlay routing, tab content composition |
| `frontend/src/mobile/components/MobileTabBar.tsx` | Bottom navigation and central compose FAB |
| `frontend/src/mobile/components/BottomSheet.tsx` | Mobile bottom sheet behavior, scroll lock, drag close, keyboard-safe layout |
| `frontend/src/mobile/components/MobileInbox.tsx` | Compact inbox card for revision, welcome-back, and whisper messages |
| `frontend/src/mobile/components/MemoryTab.tsx` | Mobile memory feature entry list |
| `frontend/src/mobile/components/SelfTab.tsx` | Identity and privacy tab layout |
| `frontend/src/mobile/components/MobileBrand.tsx` | Mobile brand lockup matching desktop |
| `frontend/src/index.css` | Shared visual system and mobile CTA refinements |
| `frontend/mobile.html` | Mobile PWA metadata, only if validation shows metadata drift |
| `frontend/public/sw.js` | Service worker mobile shell fallback, only if validation shows drift |

## Task 1: Baseline Mobile Audit

**Files:**
- Read: `frontend/src/mobile/pages/HomeMobile.tsx`
- Read: `frontend/src/mobile/components/*.tsx`
- Read: `frontend/src/index.css`
- Read: `frontend/mobile.html`
- Read: `frontend/public/sw.js`

- [ ] **Step 1: Run static checks before edits**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run build
```

Expected: Either PASS, or a TypeScript/build error that must be recorded before edits.

- [ ] **Step 2: Start the Vite dev server**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 3: Capture mobile baseline screenshots**

Use browser automation to open:

```text
http://127.0.0.1:5173/mobile.html
```

Viewports:

```text
390x844
360x740
430x932
```

Expected: Capture at least the island tab, compose sheet, memory tab, and self tab. Record visual issues before editing.

## Task 2: Polish Mobile Shell Layout

**Files:**
- Modify: `frontend/src/mobile/pages/HomeMobile.tsx`
- Modify: `frontend/src/mobile/components/MobileBrand.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Tighten root mobile layout**

In `HomeMobile.tsx`, ensure the app root uses mobile-safe dimensions and prevents accidental horizontal overflow:

```tsx
return (
  <div className="relative min-h-[100dvh] overflow-x-hidden overflow-y-hidden">
```

Expected: No horizontal scrollbars at 360px width.

- [ ] **Step 2: Add a reusable mobile page shell class**

In `frontend/src/index.css`, add:

```css
.mobile-app-shell {
  min-height: 100dvh;
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}

.mobile-bottom-buffer {
  padding-bottom: calc(7.5rem + env(safe-area-inset-bottom));
}
```

Expected: Mobile page padding is centralized and consistent with safe areas.

- [ ] **Step 3: Apply the shell classes**

In `HomeMobile.tsx`, change the input-phase wrapper from hand-written `px-4` and bottom padding to:

```tsx
className="mobile-app-shell mobile-bottom-buffer relative z-20 mx-auto flex w-full max-w-[34rem] flex-col"
style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
```

Expected: The bottom tab bar no longer overlaps content on small screens.

- [ ] **Step 4: Verify brand fit**

In `MobileBrand.tsx`, keep the same visual language but ensure the title can shrink on very narrow screens:

```tsx
<h1 className="relative inline-block bg-gradient-to-b from-white via-white to-white/65 bg-clip-text px-4 pl-[0.42em] font-display text-[clamp(19px,5.8vw,22px)] font-light tracking-[0.42em] text-transparent">
  心 屿
</h1>
```

Expected: The brand never clips at 360px.

## Task 3: Finish Mobile Navigation And CTAs

**Files:**
- Modify: `frontend/src/mobile/components/MobileTabBar.tsx`
- Modify: `frontend/src/mobile/pages/HomeMobile.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add accessible CSS markers without new dependencies**

In `MobileTabBar.tsx`, keep `TabButton` props unchanged and replace the current dot markup with a CSS-only marker:

```tsx
<span className="mobile-tab-mark" data-active={active ? "true" : "false"} style={{ "--tab-accent": accent } as React.CSSProperties} aria-hidden>
  <span />
</span>
```

Expected: Navigation remains recognizable through the existing dot-and-halo language without adding an icon package or decorative text glyphs.

- [ ] **Step 2: Add marker CSS**

In `frontend/src/index.css`, add:

```css
.mobile-tab-mark {
  position: relative;
  display: grid;
  height: 18px;
  width: 18px;
  place-items: center;
}

.mobile-tab-mark::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: radial-gradient(circle, var(--tab-accent) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.mobile-tab-mark > span {
  position: relative;
  height: 8px;
  width: 8px;
  border-radius: 9999px;
  border: 1.5px solid rgba(255, 255, 255, 0.32);
  transition: all 0.3s ease;
}

.mobile-tab-mark[data-active="true"]::before {
  opacity: 1;
}

.mobile-tab-mark[data-active="true"] > span {
  background: var(--tab-accent);
  border-color: var(--tab-accent);
  box-shadow: 0 0 8px var(--tab-accent);
}
```

Expected: Active and inactive markers match the existing Web glass/accent style.

- [ ] **Step 3: Keep tab calls unchanged**

In `MobileTabBar.tsx`, keep calls as:

```tsx
<TabButton label="岛屿" active={active === "island"} accent={accent} onClick={() => onSelect("island")} />
<TabButton label="足迹" active={active === "memory"} accent={accent} onClick={() => onSelect("memory")} />
<TabButton label="我" active={active === "self"} accent={accent} onClick={() => onSelect("self")} />
```

Expected: The tab bar still reads as the same quiet glass UI and all targets remain at least 44px high.

- [ ] **Step 4: Remove decorative glyphs from CTA text**

In `HomeMobile.tsx`, remove decorative spans from the two CTAs:

- Delete the primary CTA span with class `island-cta__emoji`.
- Delete the ghost CTA leading `aria-hidden` icon span before `上岛走走`.

Expected: CTA typography aligns with the desktop title and glass UI without decorative icon mismatch.

- [ ] **Step 5: Ensure ghost CTA text fits**

In `frontend/src/index.css`, update `.mobile-cta-ghost` with:

```css
white-space: nowrap;
max-width: calc(100vw - 2rem);
```

Expected: `上岛走走` never wraps awkwardly on narrow screens.

## Task 4: Harden Bottom Sheet

**Files:**
- Modify: `frontend/src/mobile/components/BottomSheet.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Preserve existing body overflow on close**

Keep the existing effect but also preserve `position` and `touchAction`:

```tsx
const prevOverflow = document.body.style.overflow;
const prevTouchAction = document.body.style.touchAction;
document.body.style.overflow = "hidden";
document.body.style.touchAction = "none";
return () => {
  document.body.style.overflow = prevOverflow;
  document.body.style.touchAction = prevTouchAction;
};
```

Expected: Background does not rubber-band while the sheet is open.

- [ ] **Step 2: Add overscroll containment**

In the sheet panel class, add:

```tsx
className="panel-glass-2 relative w-full max-w-[34rem] overscroll-contain rounded-t-card-lg px-4 pt-2"
```

Expected: Dragging inside the sheet does not scroll the page behind it.

- [ ] **Step 3: Add a mobile sheet content class**

In `frontend/src/index.css`, add:

```css
.mobile-sheet-content {
  overflow-wrap: anywhere;
}
```

Apply it to the children wrapper:

```tsx
<div className="mobile-sheet-content space-y-1.5">
```

Expected: Long generated text or user text cannot force horizontal overflow.

## Task 5: Complete Memory And Self Tab Polish

**Files:**
- Modify: `frontend/src/mobile/components/MemoryTab.tsx`
- Modify: `frontend/src/mobile/components/SelfTab.tsx`
- Modify: `frontend/src/mobile/pages/HomeMobile.tsx`

- [ ] **Step 1: Make memory rows theme-aware**

Update `MemoryTab` props:

```tsx
accent: string;
```

Pass `accent={visual.accent}` from `HomeMobile.tsx`.

Expected: The memory tab can reuse the current emotion accent.

- [ ] **Step 2: Add subtle row accent**

In `Row`, add an optional `accent` prop and render:

```tsx
<span
  className="h-8 w-px shrink-0 rounded-full"
  style={{ background: `linear-gradient(180deg, transparent, ${accent}99, transparent)` }}
  aria-hidden
/>
```

Expected: Rows visually connect to the current island palette without becoming colorful cards.

- [ ] **Step 3: Keep self tab bottom statement above the tab bar**

In `SelfTab.tsx`, ensure the final statement container uses:

```tsx
<div className="w-full max-w-[30rem] px-6 pb-4 pt-4">
```

Expected: The crisis statement is not clipped by the mobile tab bar.

## Task 6: Validate PWA Metadata And Offline Shell

**Files:**
- Inspect: `frontend/mobile.html`
- Inspect: `frontend/public/manifest.mobile.webmanifest`
- Inspect: `frontend/public/sw.js`

- [ ] **Step 1: Verify mobile manifest**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('./public/manifest.mobile.webmanifest','utf8')); if(m.start_url!=='/mobile.html') process.exit(1); console.log(m.name, m.start_url, m.display)"
```

Expected:

```text
心屿 · 一座会回应你的岛屿 /mobile.html standalone
```

- [ ] **Step 2: Verify service worker contains mobile shell**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
node -e "const fs=require('fs'); const sw=fs.readFileSync('./public/sw.js','utf8'); for (const s of ['/mobile.html','manifest.mobile.webmanifest','url.pathname === \"/mobile.html\"']) { if(!sw.includes(s)) throw new Error(s); } console.log('mobile shell ok')"
```

Expected:

```text
mobile shell ok
```

- [ ] **Step 3: Edit only if verification fails**

If either command fails, minimally patch the matching file so `/mobile.html` is included as a shell asset and mobile navigations fall back to `/mobile.html`.

Expected: Do not edit PWA files if they already pass.

## Task 7: Build And Browser Verification

**Files:**
- Verify: `frontend/src/mobile/**/*`
- Verify: `frontend/src/index.css`

- [ ] **Step 1: Run tests**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run test
```

Expected: Existing Node tests pass, or unrelated pre-existing failures are recorded.

- [ ] **Step 2: Run production build**

Run:

```bash
cd /Users/a111/chen/code/心屿/frontend
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Screenshot mobile states**

With Vite dev server running, use browser automation at `http://127.0.0.1:5173/mobile.html`:

```text
390x844 island tab
390x844 compose sheet
390x844 memory tab
390x844 self tab
360x740 island tab
430x932 compose sheet
```

Expected: No text overlap, no horizontal scroll, bottom tab bar does not cover primary actions, sheet is keyboard-safe by layout.

- [ ] **Step 4: Final diff review**

Run:

```bash
cd /Users/a111/chen/code/心屿
git diff -- frontend/src/mobile frontend/src/index.css frontend/mobile.html frontend/public/sw.js frontend/public/manifest.mobile.webmanifest
```

Expected: Diff is limited to mobile completion and visual polish.
