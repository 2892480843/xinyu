# Anime Realistic Beach Bay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current hard-looking bay water with a localized anime-realistic sea, shore-break, and light-reflection layer.

**Architecture:** Keep gameplay, collisions, and GLB beach layout in `ExploreMode.tsx`. Extract deterministic bay visual calculations into `frontend/src/lib/animeBayVisuals.ts` so tests can cover wave placement, palette decisions, and low-tier behavior without rendering WebGL.

**Tech Stack:** React 19, React Three Fiber, Three.js, Node test runner, TypeScript transpilation in existing `.mjs` tests.

---

## File Structure

- Create `frontend/src/lib/animeBayVisuals.ts`
  - Owns pure calculations for bay basis vectors, shore-break specs, reflection specs, and anime sea palette.
  - Has no React dependency and no `window` dependency.
- Create `frontend/tests/animeBayVisuals.test.mjs`
  - Transpiles and imports `animeBayVisuals.ts`, following the pattern in `toonGeo.test.mjs`.
  - Verifies shore-break count/order, low-tier reduction, waterline placement, and night/rain palette behavior.
- Modify `frontend/src/components/ExploreMode.tsx`
  - Imports the new visual helpers.
  - Adds `AnimatedAnimeSea`, `AnimeShoreBreaks`, and `BayLightReflection` components near the existing terrain-surface helpers.
  - Replaces the old large sea plane material and single shore ring with these components while preserving existing GLB coastline details.

## Task 1: Add Failing Tests For Bay Visual Calculations

**Files:**
- Create: `frontend/tests/animeBayVisuals.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/animeBayVisuals.test.mjs` with:

```js
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function importAnimeBayVisuals() {
  const sourcePath = path.resolve("src/lib/animeBayVisuals.ts");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const dir = path.resolve("node_modules/.tmp/xinyu-anime-bay-tests");
  await mkdir(dir, { recursive: true });
  const modulePath = path.join(dir, `animeBayVisuals-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  await writeFile(modulePath, compiled, "utf8");
  return import(`file://${modulePath}`);
}

test("shore breaks form ordered animated bands outside the bay waterline", async () => {
  const { makeAnimeShoreBreaks } = await importAnimeBayVisuals();

  const breaks = makeAnimeShoreBreaks({
    bayAngle: 0.55,
    waterlineRadius: 248,
    lowTier: false,
    night: true,
  });

  assert.equal(breaks.length, 5);
  assert.deepEqual(breaks.map((b) => b.key), ["shore-0", "shore-1", "shore-2", "shore-3", "shore-4"]);
  assert.ok(breaks.every((b) => b.radius > 248), "all visible breaks should sit seaward of the waterline");
  assert.ok(breaks.every((b) => b.length > b.width * 6), "breaks should read as long hand-painted wave bands");
  assert.ok(breaks.every((b, i) => i === 0 || b.radius > breaks[i - 1].radius), "breaks should progress away from shore");
  assert.ok(breaks.every((b) => b.color === "#d9f4ff"), "night foam should shift from pure white to moonlit blue");
});

test("low tier reduces shore break count but keeps the first near-shore band", async () => {
  const { makeAnimeShoreBreaks } = await importAnimeBayVisuals();

  const high = makeAnimeShoreBreaks({ bayAngle: 0.55, waterlineRadius: 248, lowTier: false, night: false });
  const low = makeAnimeShoreBreaks({ bayAngle: 0.55, waterlineRadius: 248, lowTier: true, night: false });

  assert.equal(low.length, 3);
  assert.equal(low[0].radius, high[0].radius);
  assert.ok(low.every((b) => b.color === "#f7fbff"));
});

test("anime sea palette darkens for night and softens for rain", async () => {
  const { resolveAnimeSeaPalette } = await importAnimeBayVisuals();

  const clearDay = resolveAnimeSeaPalette({
    sea: "#2fa6b8",
    seaHighlight: "#a8ecf2",
    timeOfDay: "noon",
    weather: "clear",
  });
  const night = resolveAnimeSeaPalette({
    sea: "#2fa6b8",
    seaHighlight: "#a8ecf2",
    timeOfDay: "night",
    weather: "clear",
  });
  const rain = resolveAnimeSeaPalette({
    sea: "#2fa6b8",
    seaHighlight: "#a8ecf2",
    timeOfDay: "sunset",
    weather: "rain",
  });

  assert.notEqual(clearDay.deep, night.deep);
  assert.equal(night.foam, "#d9f4ff");
  assert.equal(rain.reflectionOpacity < clearDay.reflectionOpacity, true);
  assert.equal(rain.waveOpacity < clearDay.waveOpacity, true);
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run:

```bash
cd frontend && node --test tests/animeBayVisuals.test.mjs
```

Expected: FAIL with `ENOENT` for `src/lib/animeBayVisuals.ts`.

## Task 2: Implement Pure Anime Bay Visual Helpers

**Files:**
- Create: `frontend/src/lib/animeBayVisuals.ts`
- Test: `frontend/tests/animeBayVisuals.test.mjs`

- [ ] **Step 1: Add the minimal helper module**

Create `frontend/src/lib/animeBayVisuals.ts` with:

```ts
export type AnimeBayWeather = "clear" | "rain" | "meteor";
export type AnimeBayTimeOfDay = "dawn" | "noon" | "sunset" | "night";

export interface AnimeSeaPaletteInput {
  sea: string;
  seaHighlight: string;
  timeOfDay: AnimeBayTimeOfDay;
  weather: AnimeBayWeather;
}

export interface AnimeSeaPalette {
  deep: string;
  mid: string;
  shallow: string;
  foam: string;
  reflection: string;
  waveOpacity: number;
  reflectionOpacity: number;
}

export interface AnimeShoreBreakInput {
  bayAngle: number;
  waterlineRadius: number;
  lowTier: boolean;
  night: boolean;
}

export interface AnimeShoreBreakSpec {
  key: string;
  x: number;
  z: number;
  radius: number;
  alongOffset: number;
  offShoreOffset: number;
  length: number;
  width: number;
  opacity: number;
  phase: number;
  speed: number;
  color: string;
}

const HIGH_SHORE_BREAKS = [
  { u: -18, v: 3.2, length: 74, width: 4.8, opacity: 0.34, phase: 0.0, speed: 0.42 },
  { u: 13, v: 6.4, length: 58, width: 3.5, opacity: 0.26, phase: 1.7, speed: 0.34 },
  { u: -34, v: 10.5, length: 42, width: 2.8, opacity: 0.2, phase: 2.6, speed: 0.3 },
  { u: 35, v: 14.0, length: 46, width: 2.5, opacity: 0.17, phase: 3.4, speed: 0.24 },
  { u: 0, v: 18.0, length: 82, width: 2.2, opacity: 0.14, phase: 4.1, speed: 0.2 },
] as const;

function bayPoint(bayAngle: number, radius: number, alongOffset: number, offShoreOffset: number): { x: number; z: number } {
  const rx = Math.cos(bayAngle);
  const rz = Math.sin(bayAngle);
  const tx = -Math.sin(bayAngle);
  const tz = Math.cos(bayAngle);
  return {
    x: rx * radius + tx * alongOffset + rx * offShoreOffset,
    z: rz * radius + tz * alongOffset + rz * offShoreOffset,
  };
}

export function makeAnimeShoreBreaks(input: AnimeShoreBreakInput): AnimeShoreBreakSpec[] {
  const count = input.lowTier ? 3 : HIGH_SHORE_BREAKS.length;
  const foam = input.night ? "#d9f4ff" : "#f7fbff";
  return HIGH_SHORE_BREAKS.slice(0, count).map((b, index) => {
    const p = bayPoint(input.bayAngle, input.waterlineRadius, b.u, b.v);
    return {
      key: `shore-${index}`,
      x: p.x,
      z: p.z,
      radius: input.waterlineRadius + b.v,
      alongOffset: b.u,
      offShoreOffset: b.v,
      length: b.length,
      width: b.width,
      opacity: b.opacity,
      phase: b.phase,
      speed: b.speed,
      color: foam,
    };
  });
}

export function resolveAnimeSeaPalette(input: AnimeSeaPaletteInput): AnimeSeaPalette {
  if (input.weather === "meteor") {
    return {
      deep: "#071326",
      mid: "#0c4561",
      shallow: "#4aa7b9",
      foam: "#d9f4ff",
      reflection: "#dcecff",
      waveOpacity: 0.68,
      reflectionOpacity: 0.34,
    };
  }
  if (input.timeOfDay === "night") {
    return {
      deep: "#071426",
      mid: "#0e3c56",
      shallow: "#326f82",
      foam: "#d9f4ff",
      reflection: "#dcecff",
      waveOpacity: 0.62,
      reflectionOpacity: 0.28,
    };
  }
  if (input.weather === "rain") {
    return {
      deep: "#1d4d5e",
      mid: "#4e7c88",
      shallow: "#91c2c6",
      foam: "#e7f6fb",
      reflection: "#c6dbe2",
      waveOpacity: 0.42,
      reflectionOpacity: 0.14,
    };
  }
  return {
    deep: input.sea,
    mid: "#4cb6c5",
    shallow: input.seaHighlight,
    foam: "#f7fbff",
    reflection: "#fff4cf",
    waveOpacity: 0.56,
    reflectionOpacity: 0.24,
  };
}
```

- [ ] **Step 2: Run the new test to verify GREEN**

Run:

```bash
cd frontend && node --test tests/animeBayVisuals.test.mjs
```

Expected: PASS for 3 tests.

## Task 3: Connect Anime Bay Visuals To ExploreMode

**Files:**
- Modify: `frontend/src/components/ExploreMode.tsx`
- Test: `frontend/tests/exploreBeachAccess.test.mjs`

- [ ] **Step 1: Add integration assertions before production code**

Append this test to `frontend/tests/exploreBeachAccess.test.mjs`:

```js
test("explore mode renders anime bay water and shore breaks instead of a single hard sea layer", async () => {
  const source = await readExploreSource();
  const importBlock = sourceBlock(source, 'import { DEFAULT_EXPLORE_ENVIRONMENT', 'import DriveScene from "./DriveScene";');
  const sceneBlock = sourceBlock(source, "function ExploreScene({", "function ExploreMode");

  assert.match(importBlock, /makeAnimeShoreBreaks/);
  assert.match(importBlock, /resolveAnimeSeaPalette/);
  assert.match(source, /function AnimatedAnimeSea/);
  assert.match(source, /function AnimeShoreBreaks/);
  assert.match(source, /function BayLightReflection/);
  assert.match(sceneBlock, /<AnimatedAnimeSea/);
  assert.match(sceneBlock, /<AnimeShoreBreaks/);
  assert.match(sceneBlock, /<BayLightReflection/);
  assert.doesNotMatch(sceneBlock, /<ringGeometry args=\{\[SHORE_FOAM_INNER_RADIUS,\s*SHORE_FOAM_OUTER_RADIUS/);
});
```

- [ ] **Step 2: Run integration test to verify RED**

Run:

```bash
cd frontend && node --test tests/exploreBeachAccess.test.mjs
```

Expected: FAIL because `makeAnimeShoreBreaks`, `AnimatedAnimeSea`, `AnimeShoreBreaks`, and `BayLightReflection` are not present.

- [ ] **Step 3: Implement the R3F visual components**

In `frontend/src/components/ExploreMode.tsx`:

1. Extend the `exploreEnvironment` import with new helper imports after it:

```ts
import {
  makeAnimeShoreBreaks,
  resolveAnimeSeaPalette,
  type AnimeSeaPalette,
  type AnimeShoreBreakSpec,
} from "../lib/animeBayVisuals";
```

2. Add the components near `FlatEllipseSurface`:

```tsx
function AnimatedAnimeSea({
  palette,
  lowTier,
  degraded,
}: {
  palette: AnimeSeaPalette;
  lowTier: boolean;
  degraded: boolean;
}) {
  const segments = lowTier || degraded ? 10 : 36;
  const geo = useMemo(() => new THREE.PlaneGeometry(10000, 10000, segments, segments), [segments]);
  const mat = useMemo(() => new THREE.MeshToonMaterial({ color: palette.deep, transparent: true, opacity: 0.94 }), [palette.deep]);
  const pos = useMemo(() => geo.getAttribute("position") as THREE.BufferAttribute, [geo]);
  const baseZ = useMemo(() => {
    const out = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) out[i] = pos.getZ(i);
    return out;
  }, [pos]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => { mat.color.set(palette.deep); mat.opacity = 0.94; }, [mat, palette.deep]);
  useFrame((s) => {
    if (lowTier || degraded) return;
    const t = s.clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const wave = Math.sin(x * 0.012 + t * 0.45) * 0.018 + Math.sin(y * 0.018 - t * 0.32) * 0.014;
      pos.setZ(i, baseZ[i] + wave);
    }
    pos.needsUpdate = true;
  });
  return (
    <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]} renderOrder={-6} />
  );
}

function AnimeShoreBreak({ spec, bayAngle, lowTier, degraded }: {
  spec: AnimeShoreBreakSpec;
  bayAngle: number;
  lowTier: boolean;
  degraded: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity, depthWrite: false, toneMapped: false }),
    [spec.color, spec.opacity],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((s) => {
    const m = mesh.current;
    if (!m || lowTier || degraded) return;
    const pulse = 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * spec.speed + spec.phase);
    m.scale.set(1 + pulse * 0.045, 1 + pulse * 0.12, 1);
    mat.opacity = spec.opacity * (0.72 + pulse * 0.28);
  });
  return (
    <mesh ref={mesh} position={[spec.x, 0.075 + spec.offShoreOffset * 0.003, spec.z]} rotation={[-Math.PI / 2, 0, bayAngle - Math.PI / 2]} scale={[spec.length * 0.5, spec.width * 0.5, 1]} renderOrder={3}>
      <circleGeometry args={[1, 32]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function AnimeShoreBreaks({
  bayAngle,
  waterlineRadius,
  palette,
  lowTier,
  degraded,
  night,
}: {
  bayAngle: number;
  waterlineRadius: number;
  palette: AnimeSeaPalette;
  lowTier: boolean;
  degraded: boolean;
  night: boolean;
}) {
  const breaks = useMemo(
    () => makeAnimeShoreBreaks({ bayAngle, waterlineRadius, lowTier, night }),
    [bayAngle, waterlineRadius, lowTier, night],
  );
  return (
    <group>
      {breaks.map((spec) => (
        <AnimeShoreBreak key={spec.key} spec={{ ...spec, color: palette.foam }} bayAngle={bayAngle} lowTier={lowTier} degraded={degraded} />
      ))}
    </group>
  );
}

function BayLightReflection({
  bayAngle,
  centerRadius,
  radius,
  palette,
  active,
}: {
  bayAngle: number;
  centerRadius: number;
  radius: number;
  palette: AnimeSeaPalette;
  active: boolean;
}) {
  const opacity = active ? palette.reflectionOpacity : palette.reflectionOpacity * 0.48;
  const x = Math.cos(bayAngle) * centerRadius;
  const z = Math.sin(bayAngle) * centerRadius;
  return (
    <mesh rotation={[-Math.PI / 2, 0, bayAngle - Math.PI / 2]} position={[x, 0.065, z]} scale={[radius * 1.05, radius * 0.42, 1]} renderOrder={2}>
      <circleGeometry args={[1, 42]} />
      <meshBasicMaterial color={palette.reflection} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
```

3. In `ExploreScene`, compute:

```ts
const animeSeaPalette = useMemo(
  () => resolveAnimeSeaPalette({
    sea: visual.sea,
    seaHighlight: visual.seaHighlight,
    timeOfDay: environment.timeOfDay,
    weather: environment.weather,
  }),
  [visual.sea, visual.seaHighlight, environment.timeOfDay, environment.weather],
);
```

4. Replace the old ring foam mesh and large sea plane with:

```tsx
<AnimeShoreBreaks
  bayAngle={BAY_ANGLE}
  waterlineRadius={SHORE_FOAM_INNER_RADIUS}
  palette={animeSeaPalette}
  lowTier={lowTier}
  degraded={degraded}
  night={isNight}
/>
<AnimatedAnimeSea palette={animeSeaPalette} lowTier={lowTier} degraded={degraded} />
<BayLightReflection
  bayAngle={BAY_ANGLE}
  centerRadius={BAY_SHALLOW_WATER_CENTER_RADIUS}
  radius={BAY_SHALLOW_WATER_RADIUS}
  palette={animeSeaPalette}
  active={isNight || isMeteorNight}
/>
```

- [ ] **Step 4: Run integration test to verify GREEN**

Run:

```bash
cd frontend && node --test tests/exploreBeachAccess.test.mjs
```

Expected: PASS.

## Task 4: Full Verification

**Files:**
- Verify: `frontend/src/lib/animeBayVisuals.ts`
- Verify: `frontend/src/components/ExploreMode.tsx`
- Verify: `frontend/tests/animeBayVisuals.test.mjs`
- Verify: `frontend/tests/exploreBeachAccess.test.mjs`

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd frontend && node --test tests/animeBayVisuals.test.mjs tests/exploreBeachAccess.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run:

```bash
cd frontend && npm test
```

Expected: PASS. If unrelated dirty-worktree tests fail, record exact failing test names and error messages.

- [ ] **Step 3: Run build**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 4: Capture visual screenshot**

Start Vite if no dev server is available:

```bash
cd frontend && npm run dev -- --host 127.0.0.1
```

Then use Playwright to load the explore route, enter the island, force night/high performance if existing debug hooks allow it, and save a screenshot to `tmp/anime-bay-after.png`.

Expected: the bay has layered water, moonlit shore-break bands, and no single hard white foam ring.
