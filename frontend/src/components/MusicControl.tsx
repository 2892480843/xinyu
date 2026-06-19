import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { resolveMusicTrack } from "../lib/musicMap";
import { setSfxMuted } from "../lib/sfx";
import { useImmersion } from "../hooks/useImmersion";
import { useSkin3d } from "../hooks/useSkin3d";

interface Props {
  music: string | undefined;
}

const FADE_STEP_MS = 40;
const FADE_DURATION_MS = 650;
const MIN_VOLUME = 0;
const DEFAULT_VOLUME = 0.36;

export default function MusicControl({ music }: Props) {
  const track = useMemo(() => resolveMusicTrack(music), [music]);
  const { calmMode, setCalmMode } = useImmersion();
  const { wanted: skin3dOn, supported: skin3dOk, setSkin3d } = useSkin3d();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
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
    // SFX 跟随音乐开关：音乐关 = SFX 静音；保持答辩场地的"一键静音"约定
    setSfxMuted(!enabled || volume === 0);
  }, [volume, enabled]);

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
            fadeTo(volumeRef.current);
          })
          .catch(() => {
            setFailedSrc(track.src);
            setEnabled(false);
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
            <span className="shrink-0 text-[10px] text-white/35">{available ? (enabled ? "播放中" : "静音") : "无音频"}</span>
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
