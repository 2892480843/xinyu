export type MusicKey =
  | "soft_piano"
  | "ambient_drone"
  | "lofi"
  | "bright_acoustic"
  | "low_strings"
  | "default";

interface MusicTrack {
  key: MusicKey;
  label: string;
  src: string;
}

const MUSIC_TRACKS: Record<MusicKey, MusicTrack> = {
  soft_piano: { key: "soft_piano", label: "治愈钢琴", src: "/audio/soft_piano.mp3" },
  ambient_drone: { key: "ambient_drone", label: "环境氛围", src: "/audio/ambient_drone.mp3" },
  lofi: { key: "lofi", label: "轻 Lo-fi", src: "/audio/lofi.mp3" },
  bright_acoustic: { key: "bright_acoustic", label: "明亮原声", src: "/audio/bright_acoustic.mp3" },
  low_strings: { key: "low_strings", label: "低弦铺底", src: "/audio/low_strings.mp3" },
  default: { key: "default", label: "岛屿默认", src: "/audio/default.mp3" },
};

export function resolveMusicTrack(music: string | undefined): MusicTrack {
  if (!music) return MUSIC_TRACKS.default;
  return MUSIC_TRACKS[(music as MusicKey)] ?? MUSIC_TRACKS.default;
}

