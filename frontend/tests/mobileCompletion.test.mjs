import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("mobile shell uses Web-aligned safe-area layout helpers", () => {
  const css = read("../src/index.css");
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(css, /\.mobile-web-shell\s*\{/);
  assert.match(css, /\.mobile-web-header\s*\{/);
  assert.match(css, /\.mobile-web-main\s*\{/);
  assert.match(css, /\.mobile-web-stage\s*\{/);
  assert.match(css, /padding-left:\s*max\(1rem,\s*env\(safe-area-inset-left\)\)/);
  assert.match(css, /padding-bottom:\s*calc\(1\.25rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(home, /className="mobile-web-shell/);
  assert.match(home, /<header\s+className="mobile-web-header/);
  assert.match(home, /<main\s+className="mobile-web-main/);
  assert.match(home, /<div\s+className="mobile-web-stage/);
  assert.match(home, /overflow-y-auto/);
  assert.doesNotMatch(home, /mobile-bottom-buffer/);
});

test("mobile home renders direct MoodInput instead of compose sheet", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");
  const moodInput = read("../src/components/MoodInput.tsx");
  const css = read("../src/index.css");

  assert.match(home, /<MoodInput\s+onSubmit=\{onSubmit\}\s+onSilent=\{openSilent\}\s+onGlyph=\{openGlyph\}\s+loading=\{false\}\s+variant="mobile-web"/);
  assert.match(moodInput, /variant\?: "default" \| "mobile-web"/);
  assert.match(moodInput, /mood-input--mobile-web/);
  assert.match(moodInput, /variant !== "mobile-web"/);
  assert.match(css, /\.mood-input--mobile-web textarea/);
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

  assert.match(home, /className="mobile-web-secondary-actions"/);
  assert.match(home, />\s*回望这些天\s*›\s*</);
  assert.match(home, /<IslandAssistant\s+userId=\{identity\.user_id\}/);
  assert.match(home, />\s*登高望岛\s*›\s*</);
  assert.match(home, />\s*心象地图\s*<\/button>/);
});

test("mobile home follows the Web page order instead of a bottom-dock app layout", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");
  const css = read("../src/index.css");
  const headerIndex = home.indexOf('className="mobile-web-header');
  const mainIndex = home.indexOf('className="mobile-web-main');
  const footerIndex = home.indexOf('className="mobile-web-footer');

  assert.ok(headerIndex > 0, "mobile Web header should exist");
  assert.ok(mainIndex > headerIndex, "main stage should follow header");
  assert.ok(footerIndex > mainIndex, "footer should follow main stage");
  assert.match(css, /\.mobile-web-main\s*\{[\s\S]*justify-content:\s*center/);
  assert.match(css, /\.mobile-web-stage\s*\{[\s\S]*max-width:\s*min\(100%,\s*36rem\)/);
  assert.doesNotMatch(home, /mobile-action-dock|bottom-dock|fixed bottom/);
});

test("mobile home defaults to the Web 3D island when WebGL is supported", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");

  assert.match(home, /skin3d\.supported\s*\?/);
  assert.match(home, /<Island3D visual=\{visual\} features=\{activeIsland\?\.features \?\? \[\]\} animate=\{immersive\} \/>/);
  assert.doesNotMatch(home, /skin3d\.active && immersive/);
});

test("homepage 3D island keeps a sharper mobile DPR instead of a fixed 1x canvas", () => {
  const island3d = read("../src/components/Island3D.tsx");

  assert.match(island3d, /const HOMEPAGE_DPR_RANGE: Record<PerfTier, \[number, number\]> = \{\s*low: \[1, 1\.5\],\s*high: \[1, 1\.75\],\s*\}/);
  assert.match(island3d, /dpr=\{HOMEPAGE_DPR_RANGE\[tier\]\}/);
  assert.doesNotMatch(island3d, /dpr=\{tier === "high" \? \[1, 1\.75\] : \[1, 1\]\}/);
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

test("mobile PWA entry remains installable and offline-shell aware", () => {
  const mobileHtml = read("../mobile.html");
  const manifest = JSON.parse(read("../public/manifest.mobile.webmanifest"));
  const sw = read("../public/sw.js");

  assert.match(mobileHtml, /<link rel="manifest" href="\/manifest\.mobile\.webmanifest"/);
  assert.equal(manifest.start_url, "/mobile.html");
  assert.equal(manifest.display, "standalone");
  assert.match(sw, /"\/mobile\.html"/);
  assert.match(sw, /url\.pathname === "\/mobile\.html"/);
});

test("shared app entry sends phones to the mobile shell before desktop bundle loads", () => {
  const desktopHtml = read("../index.html");
  const redirectScriptIndex = desktopHtml.indexOf("data-mobile-entry-redirect");
  const desktopBundleIndex = desktopHtml.indexOf("/src/main.tsx");

  assert.ok(redirectScriptIndex > 0);
  assert.ok(desktopBundleIndex > redirectScriptIndex);
  assert.match(desktopHtml, /mobile\.html/);
  assert.match(desktopHtml, /max-width:\s*767px/);
  assert.match(desktopHtml, /navigator\.maxTouchPoints/);
  assert.match(desktopHtml, /requestedView\s*===\s*"desktop"/);
});

test("mobile explore entry allows landscape play", () => {
  const manifest = JSON.parse(read("../public/manifest.mobile.webmanifest"));
  const home = read("../src/mobile/pages/HomeMobile.tsx");
  const explore = read("../src/components/ExploreMode.tsx");
  const css = read("../src/index.css");

  assert.equal(manifest.orientation, "any");
  assert.match(home, /requestExploreLandscape/);
  assert.match(home, /void openExploreMode\(\)/);
  assert.match(explore, /className="xy-explore-mode/);
  assert.match(css, /@media\s*\(orientation:\s*landscape\)/);
  assert.match(css, /@media\s*\(orientation:\s*portrait\)\s*and\s*\(pointer:\s*coarse\)/);
  assert.match(css, /\.xy-explore-mode \.xy-explore-action-pad/);
  assert.match(css, /\.xy-explore-mode \.xy-explore-joystick/);
});

test("mobile explore entry loads Web-complete assets with a staged budget", () => {
  const home = read("../src/mobile/pages/HomeMobile.tsx");
  const explore = read("../src/components/ExploreMode.tsx");
  const openBlock = home.match(/const openExploreMode = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";

  assert.match(openBlock, /prefetchExplore\(\)/);
  assert.match(home, /onPointerDown=\{prefetchExplore\}/);
  assert.doesNotMatch(explore, /function isCoarsePointerDevice/);
  assert.doesNotMatch(explore, /if \(isCoarsePointerDevice\(\)\) return/);
  const prefetchModelsBlock = explore.match(/const EXPLORE_PREFETCH_MODELS[\s\S]*?\];/)?.[0] ?? "";
  assert.match(prefetchModelsBlock, /Object\.values\(MODELS\)/);
  assert.match(explore, /function queueExplorePreload/);
  assert.match(explore, /requestIdleCallback[\s\S]*useGLTF\.preload\(url\)/);
  assert.doesNotMatch(explore, /Object\.values\(MODELS\)\.forEach\(\(u\) => \{/);
  assert.match(explore, /const EXPLORE_GRASS_COUNT: Record<PerfTier, number>/);
  assert.match(explore, /low:\s*8000/);
  assert.match(explore, /high:\s*28000/);
  assert.match(explore, /const EXPLORE_DPR_RANGE: Record<PerfTier, \[number, number\]>/);
  assert.match(explore, /low:\s*\[0\.75, 1\]/);
  assert.match(explore, /high:\s*\[0\.85, 1\.15\]/);
  assert.match(explore, /const EXPLORE_TERRAIN_SEGMENTS: Record<PerfTier, number>/);
  assert.match(explore, /low:\s*160/);
  assert.match(explore, /function defaultCharacterForTier\(tier: PerfTier\): CharKind/);
  assert.match(explore, /return "hero"/);
  assert.match(explore, /loadInitialCharacter\(tier\)/);
  assert.match(explore, /const grassCount = EXPLORE_GRASS_COUNT\[tier\]/);
  assert.match(explore, /\{grassCount > 0 && <GroundGrass count=\{grassCount\} animate=\{tier === "high" && !degraded\} grad=\{toonGrad\} \/>\}/);
  assert.doesNotMatch(explore, /if \(lowTier\) return \[\]/);
  assert.match(explore, /function getExploreRevealDelay\(tier: PerfTier\): ExploreRevealDelay/);
  assert.match(explore, /town:\s*tier === "low" \? 120 : 0/);
  assert.match(explore, /village:\s*tier === "low" \? 260 : 120/);
  assert.match(explore, /coastline:\s*tier === "low" \? 420 : 220/);
  assert.match(explore, /districts:\s*tier === "low" \? 560 : 320/);
  assert.match(explore, /companion:\s*tier === "low" \? 700 : 360/);
  assert.match(explore, /interactions:\s*tier === "low" \? 900 : 520/);
  assert.match(explore, /townblock:\s*tier === "low" \? 1050 : 620/);
  assert.match(explore, /rhododendron:\s*tier === "low" \? 1250 : 760/);
  assert.match(explore, /manor:\s*tier === "low" \? 1450 : 900/);
  assert.match(explore, /bath:\s*tier === "low" \? 1700 : 1100/);
  assert.match(explore, /<Town toonGrad=\{toonGrad\} accent=\{visual\.accent\} collidersRef=\{collidersRef\} isNight=\{isNight\} revealDelay=\{revealDelay\} allowHeavyLandmarks \/>/);
  assert.match(explore, /<DelayedMount ms=\{revealDelay\.companion\}>/);
  assert.doesNotMatch(explore, /!\s*degraded && <DelayedMount ms=\{revealDelay\.companion\}>/);
  assert.doesNotMatch(explore, /function shouldPreloadSkyLantern/);
  assert.match(explore, /useGLTF\.preload\(MODELS\.skyLantern\)/);
  assert.match(explore, /function PerfWatch\(\{ tier, onDegrade \}/);
  assert.match(explore, /setDpr\(EXPLORE_DPR_STAGE_ONE\)/);
  assert.match(explore, /setDpr\(tier === "low" \? 0\.65 : EXPLORE_DPR_STAGE_TWO\)/);
  assert.match(explore, /dpr=\{EXPLORE_DPR_RANGE\[tier\]\}/);
  assert.doesNotMatch(explore, /prewarmLanternCues/);
});

test("explore prefetch queues heavyweight GLBs before island entry", () => {
  const desktop = read("../src/pages/Home.tsx");
  const mobile = read("../src/mobile/pages/HomeMobile.tsx");
  const explore = read("../src/components/ExploreMode.tsx");
  const prefetchBlock = explore.match(/export function prefetchExploreAssets\(\): void \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const prefetchModelsBlock = explore.match(/const EXPLORE_PREFETCH_MODELS[\s\S]*?\];/)?.[0] ?? "";

  assert.match(desktop, /requestIdleCallback[\s\S]*prefetchExplore/);
  assert.match(desktop, /setTimeout\(prefetchExplore,\s*1800\)/);
  assert.match(desktop, /function ExploreLaunchFallback/);
  assert.match(desktop, /const openExploreMode = useCallback\(\(\) => \{[\s\S]*prefetchExplore\(\);[\s\S]*setExploreOpen\(true\);[\s\S]*\}, \[\]\);/);
  assert.match(desktop, /onClick=\{openExploreMode\}/);
  assert.match(desktop, /fallback=\{<ExploreLaunchFallback accent=\{visual\.accent\} \/>\}/);
  assert.match(desktop, /onPointerEnter=\{prefetchExplore\}/);
  assert.match(desktop, /onPointerDown=\{prefetchExplore\}/);

  assert.match(mobile, /requestIdleCallback[\s\S]*prefetchExplore/);
  assert.match(mobile, /setTimeout\(prefetchExplore,\s*1800\)/);
  assert.match(mobile, /onPointerEnter=\{prefetchExplore\}/);
  assert.match(mobile, /onPointerDown=\{prefetchExplore\}/);

  assert.doesNotMatch(explore, /Object\.values\(MODELS\)\.forEach\(\(u\) => \{\s*if \(shouldPreloadLightModels/);
  assert.match(prefetchModelsBlock, /Object\.values\(MODELS\)/);
  assert.match(explore, /function queueExplorePreload/);
  assert.match(explore, /requestIdleCallback[\s\S]*useGLTF\.preload\(url\)/);
  assert.match(prefetchBlock, /queueExplorePreload\(EXPLORE_PREFETCH_MODELS\)/);
  assert.doesNotMatch(prefetchBlock, /isCoarsePointerDevice/);
  for (const heavy of ["companion", "skyLantern", "townblock", "qiche", "rhododendron", "bathhouse"]) {
    assert.match(explore, new RegExp(`${heavy}:`));
  }
  assert.doesNotMatch(explore, /prewarmLanternCues/);
});

test("explore entry whoosh stays synthetic-only on first load", () => {
  const sfx = read("../src/lib/sfx.ts");
  const sampledSetBlock = sfx.match(/const SAMPLED_NAMES[\s\S]*?\]\);/)?.[0] ?? "";

  assert.doesNotMatch(sampledSetBlock, /"whoosh"/);
  assert.match(sfx, /case "whoosh":/);
});
