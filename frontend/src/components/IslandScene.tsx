import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { SceneVisual } from "../lib/sceneMap";
import { getSceneMotion } from "../lib/sceneMotion";
import { FEATURE_META } from "../lib/islandMeta";
import FeatureGlyph from "./IslandFeatureIcons";

interface Props {
  visual: SceneVisual;
  // 心象岛屿元素（灯塔/星光/花……），随岛屿成长在场景上逐步浮现
  features?: string[];
}

// 生成星星位置（按屏幕宽高比例），保证稳定
function useStars(count: number) {
  return useMemo(() => {
    const seed = 1337;
    const rand = (i: number) => {
      const x = Math.sin(seed * (i + 1)) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: count }, (_, i) => ({
      left: `${rand(i) * 100}%`,
      top: `${rand(i + 50) * 55}%`,
      size: 1 + rand(i + 99) * 1.8,
      delay: rand(i + 7) * 4,
    }));
  }, [count]);
}

// 生成雨滴
function useDrops(count: number) {
  return useMemo(() => {
    const seed = 9001;
    const rand = (i: number) => {
      const x = Math.sin(seed * (i + 3)) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: count }, (_, i) => ({
      left: `${rand(i) * 100}%`,
      delay: rand(i + 11) * 2,
      duration: 0.6 + rand(i + 5) * 0.5,
      opacity: 0.25 + rand(i + 2) * 0.35,
    }));
  }, [count]);
}

export default function IslandScene({ visual, features = [] }: Props) {
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const showStars = visual.stars;
  const stars = useStars(80);
  const isRain = visual.weather === "rain" || visual.weather === "light_rain" || visual.weather === "storm";
  const rainCount = visual.weather === "storm" ? 90 : visual.weather === "rain" ? 70 : 45;
  const drops = useDrops(rainCount);
  const isFog = visual.weather === "fog";
  const isStorm = visual.weather === "storm";

  const sky = `linear-gradient(to bottom, ${visual.skyTop} 0%, ${visual.skyMid} 48%, ${visual.skyBottom} 78%)`;
  const isNight = visual.time === "night";
  const imageReady = loadedImage === visual.image;
  const imageFailed = failedImage === visual.image;
  const showImage = Boolean(visual.image) && !imageFailed;
  const showFallbackScene = !showImage || !imageReady;
  const sceneMotion = getSceneMotion(visual.motion);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.6, ease: "easeInOut" }}
      key={visual.time + visual.weather}
    >
      {/* 图片主背景，缺失或未加载完成时回退到原渐变/SVG 场景 */}
      {showImage && (
        <motion.img
          src={visual.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0 }}
          animate={
            prefersReducedMotion
              ? { opacity: imageReady ? 1 : 0 }
              : {
                  opacity: imageReady ? 1 : 0,
                  scale: sceneMotion.imageScale,
                  x: sceneMotion.imageX,
                  y: sceneMotion.imageY,
                }
          }
          transition={{
            opacity: { duration: 1.2, ease: "easeInOut" },
            scale: { duration: sceneMotion.imageDuration, repeat: Infinity, ease: "easeInOut" },
            x: { duration: sceneMotion.imageDuration, repeat: Infinity, ease: "easeInOut" },
            y: { duration: sceneMotion.imageDuration, repeat: Infinity, ease: "easeInOut" },
          }}
          onLoad={() => setLoadedImage(visual.image)}
          onError={() => setFailedImage(visual.image)}
        />
      )}

      {/* 天空 */}
      {showFallbackScene && <div className="absolute inset-0" style={{ background: sky }} />}

      {/* 插画背景遮罩，保证前景文字可读 */}
      {imageReady && (
        <div
          className="absolute inset-0"
          style={{
            background: isNight
              ? "linear-gradient(to bottom, rgba(4,8,18,0.28), rgba(4,8,18,0.16) 45%, rgba(4,8,18,0.42))"
              : "linear-gradient(to bottom, rgba(8,14,24,0.12), rgba(8,14,24,0.08) 45%, rgba(8,14,24,0.32))",
          }}
        />
      )}

      {/* 动态呼吸层：只在图片背景加载后出现，给云、光和海面一点生命感 */}
      {imageReady && !prefersReducedMotion && (
        <>
          <motion.div
            className="pointer-events-none absolute -inset-[6%]"
            style={{
              background: `radial-gradient(circle at 76% 18%, ${visual.celestialGlow} 0%, rgba(255,255,255,0.08) 18%, transparent 34%),
                radial-gradient(circle at 36% 20%, rgba(255,255,255,0.18) 0%, transparent 30%)`,
              mixBlendMode: isNight ? "screen" : "soft-light",
            }}
            animate={{ opacity: sceneMotion.auraOpacity, scale: sceneMotion.auraScale }}
            transition={{ duration: sceneMotion.auraDuration, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute -inset-x-[10%] top-[7%] h-[48%]"
            style={{
              background: `radial-gradient(ellipse at 28% 35%, rgba(255,255,255,0.34) 0%, transparent 34%),
                radial-gradient(ellipse at 70% 54%, rgba(255,255,255,0.18) 0%, transparent 38%)`,
              filter: "blur(34px)",
              mixBlendMode: isNight ? "screen" : "soft-light",
            }}
            animate={{ x: sceneMotion.cloudX, opacity: sceneMotion.cloudOpacity }}
            transition={{ duration: sceneMotion.cloudDuration, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute inset-x-0 bottom-[8%] h-[32%]"
            style={{
              background: `linear-gradient(to bottom, transparent 0%, ${visual.seaHighlight} 52%, transparent 100%)`,
              filter: "blur(26px)",
              mixBlendMode: "screen",
            }}
            animate={{ opacity: sceneMotion.seaOpacity }}
            transition={{ duration: sceneMotion.seaDuration, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      {/* 星空 */}
      {showStars && (
        <div className="absolute inset-0">
          {stars.map((s, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-white"
              style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 4, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>
      )}

      {/* 天体（日 / 月）：图片背景已包含主体光源，兜底场景中再绘制 */}
      {showFallbackScene && (
        <motion.div
          className="absolute"
          style={{
            top: "14%",
            right: "16%",
            width: 110,
            height: 110,
            borderRadius: "9999px",
            background: visual.celestial,
            boxShadow: `0 0 80px 24px ${visual.celestialGlow}`,
          }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* 雾 */}
      {isFog && (
        <>
          <motion.div
            className="absolute inset-x-0"
            style={{ top: "30%", height: "45%", background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(220,225,235,0.5), rgba(255,255,255,0))" }}
            animate={{ x: [ "-8%", "8%", "-8%" ], opacity: [0.7, 0.95, 0.7] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-x-0"
            style={{ top: "42%", height: "38%", background: "linear-gradient(to bottom, rgba(255,255,255,0), rgba(210,215,228,0.4), rgba(255,255,255,0))" }}
            animate={{ x: [ "6%", "-6%", "6%" ], opacity: [0.6, 0.85, 0.6] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      {/* 暴风云 */}
      {isStorm && (
        <>
          <motion.div className="absolute" style={{ top: "8%", left: "10%", width: 260, height: 90, background: "rgba(20,12,18,0.35)", filter: "blur(28px)", borderRadius: 999 }} animate={{ x: [0, 40, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="absolute" style={{ top: "16%", right: "12%", width: 300, height: 100, background: "rgba(20,12,18,0.3)", filter: "blur(32px)", borderRadius: 999 }} animate={{ x: [0, -30, 0] }} transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }} />
        </>
      )}

      {/* 雨 */}
      {isRain && (
        <div className="absolute inset-0">
          {drops.map((d, i) => (
            <motion.span
              key={i}
              className="absolute top-0"
              style={{ left: d.left, width: 1.5, height: isStorm ? 22 : 16, background: "rgba(255,255,255,0.5)", opacity: d.opacity, borderRadius: 999 }}
              animate={{ y: ["-10vh", "110vh"] }}
              transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: "linear" }}
            />
          ))}
        </div>
      )}

      {/* 海面 + 岛屿（SVG）：图片缺失时作为完整兜底画面 */}
      {showFallbackScene && (
      <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 400" preserveAspectRatio="none" style={{ height: "52%" }}>
        <defs>
          <linearGradient id="seaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={visual.seaHighlight} stopOpacity="0.9" />
            <stop offset="55%" stopColor={visual.sea} stopOpacity="1" />
            <stop offset="100%" stopColor={visual.sea} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="islGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={visual.island} stopOpacity="0.95" />
            <stop offset="100%" stopColor={visual.island} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* 远处岛屿剪影 */}
        <motion.path
          d="M0,210 C160,150 320,180 470,160 C640,138 720,176 860,150 C1020,120 1160,168 1300,150 C1380,140 1440,150 1440,150 L1440,400 L0,400 Z"
          fill="url(#islGrad)"
          opacity="0.55"
          animate={{ y: [0, 3, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* 主岛屿剪影 */}
        <motion.path
          d="M0,250 C200,205 360,235 520,212 C700,186 820,230 980,200 C1160,168 1300,222 1440,205 L1440,400 L0,400 Z"
          fill="url(#islGrad)"
          animate={{ y: [0, 2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* 海浪线 */}
        <motion.path
          d="M0,300 C240,278 480,320 720,300 C960,280 1200,322 1440,300 L1440,400 L0,400 Z"
          fill="url(#seaGrad)"
          animate={{ x: [0, -24, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M0,332 C220,312 460,350 700,330 C940,310 1180,352 1440,330 L1440,400 L0,400 Z"
          fill="url(#seaGrad)"
          opacity="0.85"
          animate={{ x: [0, 30, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
      )}

      {/* 海面反光（夜间/暖色场景增加氛围） */}
      {showFallbackScene && (
        <div
          className="absolute inset-x-0"
          style={{
            bottom: "30%",
            height: 2,
            background: isNight ? visual.celestialGlow : "rgba(255,255,255,0.12)",
            filter: "blur(1px)",
          }}
        />
      )}

      {/* 心象岛屿元素：随岛屿成长在场景下方逐步浮现，让「岛屿生长」可见 */}
      {features.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {features.map((f, i) => {
            const meta = FEATURE_META[f];
            if (!meta) return null;
            return (
              <motion.span
                key={f}
                className="absolute select-none"
                style={{
                  left: `${meta.left}%`,
                  bottom: `${meta.bottom}%`,
                  color: visual.accent,
                  filter: `drop-shadow(0 1px 4px rgba(0,0,0,0.5)) drop-shadow(0 0 7px ${visual.accent}66)`,
                }}
                initial={{ opacity: 0, y: 8, scale: 0.7 }}
                animate={
                  prefersReducedMotion
                    ? { opacity: 0.92, y: 0, scale: 1 }
                    : { opacity: 0.92, y: [0, -6, 0], scale: 1 }
                }
                transition={{
                  opacity: { duration: 0.9, delay: 0.3 + i * 0.18 },
                  scale: { duration: 0.9, delay: 0.3 + i * 0.18 },
                  y: { duration: 5 + i, repeat: Infinity, ease: "easeInOut" },
                }}
                title={meta.label}
              >
                <FeatureGlyph name={f} size={28} />
              </motion.span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
