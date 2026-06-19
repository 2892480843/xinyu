// 情绪 -> 背景音乐映射。
// 9 首曲目均为 Kevin MacLeod (incompetech.com)，授权 CC-BY 4.0；
// 已转码为 AAC 128k(.m4a)。完整署名见 public/audio/CREDITS.md，
// App 内署名常驻于 MusicControl 控件（CC-BY 要求「可被合理发现」）。

export type MusicKey =
  | "sad"
  | "anxious"
  | "tired"
  | "lonely"
  | "calm"
  | "happy"
  | "angry"
  | "helpless"
  | "default";

interface MusicTrack {
  key: MusicKey;
  label: string;
  src: string;
  /** 原曲名，用于 App 内 CC-BY 署名 */
  title: string;
  artist: string;
  license: string;
  licenseUrl: string;
}

const ARTIST = "Kevin MacLeod";
const LICENSE = "CC-BY 4.0";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

function track(key: MusicKey, label: string, title: string): MusicTrack {
  return { key, label, src: `/audio/${key}.m4a`, title, artist: ARTIST, license: LICENSE, licenseUrl: LICENSE_URL };
}

const MUSIC_TRACKS: Record<MusicKey, MusicTrack> = {
  sad: track("sad", "细雨钢琴", "Bittersweet"),
  anxious: track("anxious", "雾屿弦音", "Long Note Three"),
  tired: track("tired", "安眠电钢", "Ether Vox"),
  lonely: track("lonely", "孤屿独唱", "Shores of Avalon"),
  calm: track("calm", "澄澈空气", "Clear Air"),
  happy: track("happy", "无忧原声", "Carefree"),
  angry: track("angry", "暗涌低弦", "Gloom Horizon"),
  helpless: track("helpless", "微光三重奏", "Sad Trio"),
  default: track("default", "心屿水波", "Ripples"),
};

// 兼容历史接口返回的旧风格 key（后端现已直接返回情绪 key）。
const LEGACY_ALIAS: Record<string, MusicKey> = {
  soft_piano: "sad",
  ambient_drone: "anxious",
  lofi: "calm",
  bright_acoustic: "happy",
  low_strings: "angry",
};

export function resolveMusicTrack(music: string | undefined): MusicTrack {
  if (!music) return MUSIC_TRACKS.default;
  const key = (music in MUSIC_TRACKS ? music : LEGACY_ALIAS[music]) as MusicKey | undefined;
  return (key && MUSIC_TRACKS[key]) || MUSIC_TRACKS.default;
}

/** 全部曲目（去重后）——用于在「关于/版权」处罗列完整署名。 */
export const MUSIC_CREDITS: MusicTrack[] = Object.values(MUSIC_TRACKS);
