import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { resolveMusicTrack } from "../lib/musicMap";
import { setSfxMuted } from "../lib/sfx";
import { setEnvVolume } from "../lib/samples";
import { setLanternMusicMuted } from "../lib/lanternMusic";
import { setAmbience, setAmbienceMuted } from "../lib/ambience";
import { setLocationAmbienceMuted } from "../lib/locationAmbience";
import { useImmersion } from "../hooks/useImmersion";
import { useSkin3d } from "../hooks/useSkin3d";

interface Props {
  music: string | undefined;
  /** 当前情绪 key（sad/anxious/tired/...），驱动氛围底噪层。 */
  emotion?: string;
}

const FADE_STEP_MS = 40;
const FADE_DURATION_MS = 650;
const MIN_VOLUME = 0;
const DEFAULT_VOLUME = 0.36;

// 自动播放策略：首次 play() 若被浏览器拒绝（非文件错误），挂起等待用户手势重试，
// 而非直接判失败。监听器全局只注册一次。
let autoplayArmed = false;
function armAutoplayRetry() {
  if (autoplayArmed || typeof window === "undefined") return;
  autoplayArmed = true;
  const trigger = () => {
    window.dispatchEvent(new CustomEvent("xinyu:audio-gesture"));
  };
  window.addEventListener("pointerdown", trigger, { once: true });
  window.addEventListener("keydown", trigger, { once: true });
}

export default function MusicControl({ music, emotion }: Props) {
  const track = useMemo(() => resolveMusicTrack(music), [music]);
  const { calmMode, setCalmMode } = useImmersion();
  const { wanted: skin3dOn, supported: skin3dOk, setSkin3d } = useSkin3d();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const duckTimerRef = useRef<number | null>(null); // 放天灯让位后恢复 BGM 的定时器
  const volumeRef = useRef(DEFAULT_VOLUME);
  const autoplayBlockedRef = useRef<string | null>(null); // autoplay 被拦时记下的待播 src
  // 默认开启：用户在身份门点「进入心屿」时已产生用户手势，autoplay 通常被允许；
  // 若浏览器仍拒绝，play().catch 会自动 setEnabled(false) 优雅降级，不报错。
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [awaitingGesture, setAwaitingGesture] = useState(false); // autoplay 被浏览器拦截、等用户首次交互
  const available = failedSrc !== track.src;

  const clearFade = useCallback(() => {
    if (fadeTimerRef.current) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const fadeTo = useCallback((target: number, onDone?: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearFade();

    const start = audio.volume;
    const steps = Math.max(1, Math.round(FADE_DURATION_MS / FADE_STEP_MS));
    let currentStep = 0;

    fadeTimerRef.current = window.setInterval(() => {
      currentStep += 1;
      const next = start + (target - start) * (currentStep / steps);
      audio.volume = Math.max(MIN_VOLUME, Math.min(1, next));

      if (currentStep >= steps) {
        clearFade();
        audio.volume = target;
        onDone?.();
      }
    }, FADE_STEP_MS);
  }, [clearFade]);

  useEffect(() => {
    return clearFade;
  }, [clearFade]);

  useEffect(() => {
    const audio = audioRef.current;
    volumeRef.current = volume;
    if (!audio) return;
    audio.volume = enabled ? volume : MIN_VOLUME;
    // SFX 跟随音乐开关：音乐关 = SFX 静音；保持"一键静音"约定
    const shouldMute = !enabled || volume === 0;
    setSfxMuted(shouldMute);
    // 氛围底噪同样跟随：一键静音覆盖 BGM + SFX + 情绪底噪 + 位置底噪 + 环境音效(脚步/水花/雾号) 五层
    setAmbienceMuted(shouldMute);
    setLocationAmbienceMuted(shouldMute);
    setEnvVolume(shouldMute ? 0 : 0.7); // env 类默认常响，一键静音时也归零，避免「静音了还有脚步声」
    setLanternMusicMuted(shouldMute); // 放天灯庆典曲目同样跟随一键静音
  }, [volume, enabled]);

  // 情绪变化 → 切换氛围底噪（跟随音乐开关 enabled）
  useEffect(() => {
    setAmbience(emotion, enabled);
  }, [emotion, enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (failedSrc === track.src) {
      audio.pause();
      return;
    }

    const loadAndMaybePlay = () => {
      audio.src = track.src;
      audio.currentTime = 0;
      audio.volume = MIN_VOLUME;
      const play = audio.play();
      if (play) {
        play
          .then(() => {
            setAwaitingGesture(false);
            fadeTo(volumeRef.current);
          })
          .catch(() => {
            // 区分「autoplay 被拒」与「真正加载失败」：被拒时 audio.error 为 null。
            if (audio.error) {
              setFailedSrc(track.src);
              setEnabled(false);
            } else {
              // autoplay 被拦截：挂起，等首个用户手势时由 effect 重试，并据此如实显示「轻触播放」。
              armAutoplayRetry();
              autoplayBlockedRef.current = track.src;
              setAwaitingGesture(true);
            }
          });
      }
    };

    if (!enabled) {
      audio.pause();
      audio.volume = volumeRef.current;
      return;
    }

    if (audio.src && !audio.src.endsWith(track.src)) {
      fadeTo(MIN_VOLUME, () => {
        audio.pause();
        loadAndMaybePlay();
      });
      return;
    }

    loadAndMaybePlay();
  }, [track.src, enabled, failedSrc, fadeTo]);

  // 自动播放被拦后的手势重试：用户首次交互时重播被挂起的 BGM。
  useEffect(() => {
    const onGesture = () => {
      const audio = audioRef.current;
      if (!audio || !autoplayBlockedRef.current) return;
      const src = autoplayBlockedRef.current;
      autoplayBlockedRef.current = null;
      audio.src = src;
      audio.currentTime = 0;
      audio.volume = MIN_VOLUME;
      audio
        .play()
        .then(() => { setAwaitingGesture(false); fadeTo(volumeRef.current); })
        .catch(() => { /* 仍失败则放弃，等用户手动点播放 */ });
    };
    window.addEventListener("xinyu:audio-gesture", onGesture);
    return () => window.removeEventListener("xinyu:audio-gesture", onGesture);
  }, [fadeTo]);

  // 放天灯庆典让位：天灯曲目奏起时(lanternMusic 派发 xinyu:bgm-duck)把 BGM 暂时淡低，结束前恢复，
  // 让真实庆典曲目（Frost Waltz / Skye Cuillin）听得清，又不打断背景。
  useEffect(() => {
    const onDuck = (e: Event) => {
      const audio = audioRef.current;
      if (!audio || !enabled || !available) return;
      const ms = (e as CustomEvent<{ ms?: number }>).detail?.ms ?? 8000;
      const base = volumeRef.current;
      if (duckTimerRef.current) { window.clearTimeout(duckTimerRef.current); duckTimerRef.current = null; }
      fadeTo(base * 0.34); // 让位但不全静，仍留一层底色
      duckTimerRef.current = window.setTimeout(() => {
        duckTimerRef.current = null;
        const a = audioRef.current;
        if (a && enabled && !a.paused) fadeTo(volumeRef.current); // 仍在播且未被用户暂停/静音才恢复
      }, Math.max(1500, ms - 500));
    };
    window.addEventListener("xinyu:bgm-duck", onDuck);
    return () => {
      window.removeEventListener("xinyu:bgm-duck", onDuck);
      if (duckTimerRef.current) { window.clearTimeout(duckTimerRef.current); duckTimerRef.current = null; }
    };
  }, [enabled, available, fadeTo]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !available) return;

    if (enabled) {
      fadeTo(MIN_VOLUME, () => {
        audio.pause();
        setEnabled(false);
      });
      return;
    }

    setEnabled(true);
  };

  const handleAudioError = () => {
    setFailedSrc(track.src);
    setEnabled(false);
  };

  return (
    <motion.div
      className="panel-glass-1 fixed z-30 w-[min(88vw,19rem)] rounded-card px-4 py-3"
      style={{
        left: "calc(1rem + env(safe-area-inset-left))",
        bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <audio ref={audioRef} loop preload="none" onError={handleAudioError} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!available}
          aria-label={enabled ? "暂停背景音乐" : "播放背景音乐"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/14 text-white/85 border border-white/15 hover:bg-white/22 disabled:cursor-not-allowed disabled:opacity-45 transition"
        >
          <span className="text-sm">{enabled ? "Ⅱ" : "▶"}</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-white/80">{track.label}</p>
            <span className="shrink-0 text-[10px] text-white/35">{available ? (enabled ? (awaitingGesture ? "轻触播放" : "播放中") : "静音") : "无音频"}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="背景音乐音量"
            disabled={!available}
            className="mt-2 h-1.5 w-full accent-white/80 disabled:opacity-40"
          />
        </div>
      </div>

      {/* CC-BY 署名：曲目均为 Kevin MacLeod，授权要求在「可被合理发现」处署名 */}
      <a
        href={track.licenseUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 block truncate text-[9px] leading-tight text-white/30 hover:text-white/55 transition-colors"
        title={`「${track.title}」 by ${track.artist} — 知识共享 署名 4.0（点击查看许可）`}
      >
        ♪ {track.title} · {track.artist} · {track.license}
      </a>

      {/* 静海模式：一键减弱全部 3D/视差/体积光（无障碍/晕动症开关，持久化） */}
      <button
        type="button"
        onClick={() => setCalmMode(!calmMode)}
        aria-pressed={calmMode}
        className="mt-2.5 flex w-full items-center justify-between border-t border-white/10 pt-2 text-left"
        title="减弱画面动态，适合容易晕动或想安静的时候"
      >
        <span className="text-[10px] tracking-wider text-white/45">静海模式 · 减弱动态</span>
        <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${calmMode ? "bg-white/55" : "bg-white/15"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-[#0a0e1f] transition-all duration-200 ${calmMode ? "left-3.5" : "left-0.5"}`} />
        </span>
      </button>

      {/* 真 3D 岛屿（实验）：仅设备支持 WebGL 时出现；开启后由 react-three-fiber 接管背景。
          静海/reduced-motion 仍生效——届时 3D 静态单帧不漂。 */}
      {skin3dOk && (
        <button
          type="button"
          onClick={() => setSkin3d(!skin3dOn)}
          aria-pressed={skin3dOn}
          className="mt-2 flex w-full items-center justify-between border-t border-white/10 pt-2 text-left"
          title="用真 3D 渲染岛屿（深海玻璃旗舰皮）。设备弱或开启静海模式时会自动减弱。"
        >
          <span className="text-[10px] tracking-wider text-white/45">真 3D 岛屿 · 实验</span>
          <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${skin3dOn ? "bg-white/55" : "bg-white/15"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-[#0a0e1f] transition-all duration-200 ${skin3dOn ? "left-3.5" : "left-0.5"}`} />
          </span>
        </button>
      )}
    </motion.div>
  );
}
