import type { BackendScene } from "./sceneMap";

export interface IslandState {
  dominant_emotion: string;
  trend: string; // recovering | brightening | stormy | stable | mixed
  growth_level: number; // 1-5
  features: string[];
  weather_memory: string;
  summary: string;
  chapter?: string; // 章节导语：岛屿的去向/在等待什么
}

export interface AgentTraceItem {
  agent: string; // emotion | memory | environment | narrative | safety
  label: string;
  status: string; // waiting | running | done
  output: string;
}

export interface IslandChoice {
  id: string;
  stance: string; // 面对情绪的方式
  ritual: string; // 岛屿仪式
  artifact: string; // 物件 key
  reply: string; // 选择后的反馈叙事
  rare?: boolean; // 「此刻限定」稀缺仪式（只在特定趋势出现）
}

export interface ArtifactItem {
  id: number;
  user_id: string;
  artifact: string;
  label: string;
  emotion: string;
  created_at: string;
  inscription: string;
}

export interface IslandActResponse {
  artifact: ArtifactItem;
  reply: string;
  island_state: IslandState;
}

export interface WelcomeBackResponse {
  show: boolean;
  message: string;
  hours_away: number;
  artifact: string;
  artifact_label: string;
}

export interface WhisperResponse {
  show: boolean;
  whisper: string;
  artifact: string;
  artifact_label: string;
}

export interface LetterResponse {
  letter: string;
  observed_pattern: string;
  mentioned_artifacts: string[];
  memory_count: number;
  artifact_count: number;
}

export interface RevisionResponse {
  show: boolean;
  kind: string;         // too_heavy | too_light | off_topic
  revision: string;
  target_emotion: string;
  target_intensity: number;
  target_created_at: string;
  target_narrative: string;
}

export interface EchoPhrase {
  content: string;
  attribution: string;
  emotion: string;
}

export interface GlyphDynamics {
  avg_speed: number;
  duration_ms: number;
  stroke_count: number;
  pause_count: number;
  jitter: number;
}

export interface GlyphResponse {
  char: string;
  emotion: string;
  intensity: number;
  reading: string;
  artifact: ArtifactItem;
}

export interface CompanionChatRequest {
  user_id: string;
  message: string;
  companion_name: string;
  affinity: number;
  emotion?: string;
  feed_count: number;
  talk_count: number;
  unlocked_secrets: string[];
}

export interface CompanionChatResponse {
  reply: string;
  emotion: string;
  animation: string;
  safety: { triggered: boolean; message: string | null };
  prompt_version: string;
}

export interface PhraseItem {
  id: number;
  user_id: string;
  emotion: string;
  content: string;
  attribution: string;
  is_active: boolean;
  created_at: string;
}

export interface ReflectResponse {
  emotion: string;
  intensity: number;
  summary: string;
  scene: BackendScene;
  island_state: IslandState;
  agent_trace: AgentTraceItem[];
  choices: IslandChoice[];
  narrative: string;
  imprint: string | null;
  memory_hint: string | null;
  safety: { triggered: boolean; message: string | null };
  ephemeral: boolean;
  echo_phrase: EchoPhrase | null;
}

export type ReflectStreamEvent =
  | { event: "started"; message?: string }
  | {
      event: "agent";
      agent: string;
      label: string;
      status: string;
      output: string;
    }
  | {
      event: "emotion";
      emotion: string;
      intensity: number;
      summary: string;
      safety: { triggered: boolean; message: string | null };
    }
  | { event: "scene"; scene: BackendScene }
  | { event: "island_state"; island_state: IslandState }
  | { event: "narrative"; narrative: string; imprint?: string | null; memory_hint: string | null }
  | { event: "memory"; memory: MemoryItem }
  | { event: "done"; result: ReflectResponse }
  | { event: "error"; message: string };

export interface MemoryItem {
  id: number;
  user_id: string;
  text: string;
  emotion: string;
  intensity: number;
  summary: string;
  narrative: string;
  imprint?: string | null;
  created_at: string;
}

// 生产构建走相对路径（与前端同源，由 Nginx 反代到后端，无跨域）；开发回退本机后端。
// 注意 ??：仅在「未定义」时兜底；.env / .env.production 里的显式空值会被保留为相对路径，
// 不会落回 localhost。PROD 兜底确保即使服务器上缺 env 文件，生产也不会硬编码 127.0.0.1:8000。
const BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? "" : "http://127.0.0.1:8000");
// 流式逐阶段推送后，等待期间用户能看到导演台「信使逐个抵达」，长一点的等待是可接受的；
// 后端单次 LLM 上限 30s，情绪+叙事两段串行，慢模型下需要给足窗口，否则 WS 会在叙事生成中途
// 被掐断、白白回退 HTTP 重算（且重算可能得到不同情绪）。8s 处已有手动「先回去」可随时退出。
const WS_TIMEOUT_MS = 30000;

function resolveWsUrl(path: string): string {
  const url = new URL(path, BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function resolveAsrWsUrl(): string {
  return resolveWsUrl("/ws/asr");
}

export async function reflect(
  user_id: string, text: string, ephemeral = false, request_id?: string,
): Promise<ReflectResponse> {
  const res = await fetch(`${BASE}/api/reflect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, text, ephemeral, request_id }),
  });
  if (!res.ok) {
    let detail = `请求失败 (${res.status})`;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

// ── P2 多轮对话伙伴 ──
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
export interface IslandChatResponse {
  reply: string;
  safety: { triggered: boolean; message?: string };
  tools_used: string[];
}
export async function chatWithIsland(user_id: string, messages: ChatTurn[]): Promise<IslandChatResponse> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, messages }),
  });
  if (!res.ok) throw new Error(`对话失败 (${res.status})`);
  return res.json();
}

// ── P3 常驻 AI 助手 ──
export interface AgentAskResponse {
  answer: string;
  tools_used: string[];
  safety: { triggered: boolean; message?: string };
}
export async function agentAsk(user_id: string, question: string): Promise<AgentAskResponse> {
  const res = await fetch(`${BASE}/api/agent/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, question }),
  });
  if (!res.ok) throw new Error(`助手暂时没接上 (${res.status})`);
  return res.json();
}

export function reflectStream(
  user_id: string,
  text: string,
  onEvent: (event: ReflectStreamEvent) => void,
  timeoutMs = WS_TIMEOUT_MS,
  ephemeral = false,
  request_id?: string,
  onCancel?: (cancel: () => void) => void,
): Promise<ReflectResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: WebSocket | null = null;

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      reject(error);
    };

    const settleResolve = (result: ReflectResponse) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      settleReject(new Error("流式回应超时"));
    }, timeoutMs);

    // 暴露「取消」句柄：用户中途返回时主动关闭 socket，并以 AbortError 结束，
    // 调用方据此跳过 HTTP 降级、忽略迟到结果（不会把用户从输入态拽回）。
    onCancel?.(() => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
      const err = new Error("已取消");
      err.name = "AbortError";
      reject(err);
    });

    try {
      socket = new WebSocket(resolveWsUrl("/ws/reflect"));
    } catch (e) {
      settleReject(e instanceof Error ? e : new Error("无法建立流式连接"));
      return;
    }

    socket.onopen = () => {
      socket?.send(JSON.stringify({ user_id, text, ephemeral, request_id }));
    };

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as ReflectStreamEvent;
        onEvent(event);
        if (event.event === "done") {
          settleResolve(event.result);
        }
        if (event.event === "error") {
          settleReject(new Error(event.message));
        }
      } catch {
        settleReject(new Error("流式回应格式异常"));
      }
    };

    socket.onerror = () => {
      settleReject(new Error("流式连接异常"));
    };

    socket.onclose = () => {
      if (!settled) {
        settleReject(new Error("流式连接已断开"));
      }
    };
  });
}

export async function fetchMemories(user_id: string): Promise<MemoryItem[]> {
  const res = await fetch(`${BASE}/api/memories?user_id=${encodeURIComponent(user_id)}&limit=20`);
  if (!res.ok) throw new Error("无法读取记忆");
  const data = await res.json();
  // 兜底：后端返回非预期结构（缺 memories 字段 / 返回数组 / null）时不致整页崩溃。
  return Array.isArray(data?.memories) ? data.memories : Array.isArray(data) ? data : [];
}

export interface TimelineStep {
  index: number;
  created_at: string;
  emotion: string;
  intensity: number;
  text: string;
  summary: string;
  narrative: string;
  scene: BackendScene;
  island_state: IslandState;
}

/** 时光机·一键回望：为专用演示身份注入一段跨天、有起伏的轨迹（幂等重置，不碰真实用户）。 */
export async function seedDemoTimeline(user_id = "demo-timeline"): Promise<number> {
  try {
    const res = await fetch(`${BASE}/api/demo/timeline-seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id }),
    });
    if (!res.ok) return 0;
    const d = await res.json();
    return d.inserted ?? 0;
  } catch {
    return 0;
  }
}

/** 时光机·一键回望：拉取该身份「从最早到最新」的逐步岛屿状态快照，供延时生长动画。 */
export async function fetchTimeline(user_id: string): Promise<TimelineStep[]> {
  try {
    const res = await fetch(`${BASE}/api/island/timeline?user_id=${encodeURIComponent(user_id)}`);
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d?.steps) ? d.steps : [];
  } catch {
    return [];
  }
}

/** 情感语音合成：配了云端 TTS（阿里云 CosyVoice / 腾讯云）则返回情感音色音频(data URL)，
 * 否则返回 null 由前端降级浏览器原生。voice 指定音色 id（字符串，腾讯云数字也以字符串传）；省略用默认。 */
export async function synthesizeSpeech(text: string, emotion: string, voice?: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, emotion, voice }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.ok && d.audio_base64) return `data:${d.mime || "audio/mp3"};base64,${d.audio_base64}`;
    return null;
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** 语音输入兜底：浏览器 SpeechRecognition 不可达时，发送短 PCM 片段给后端 ASR。 */
export async function transcribeSpeech(pcm: ArrayBuffer, sampleRate = 16000): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/asr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_base64: arrayBufferToBase64(pcm),
        sample_rate: sampleRate,
        format: "pcm",
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.ok && d.transcript ? String(d.transcript) : null;
  } catch {
    return null;
  }
}

export interface StreamingSpeechPlayback {
  audio: HTMLAudioElement;
  done: Promise<void>;
  stop: () => void;
}

const TTS_STREAM_FIRST_CHUNK_TIMEOUT_MS = 10000;

/** 真流式情感 TTS：后端 WebSocket 推送 mp3 二进制分片，前端用 MediaSource 边收边播。
 * 返回 null 时调用方继续走旧的整段 /api/tts 或浏览器 speechSynthesis 降级。 */
export async function playStreamingSpeech(text: string, emotion: string, voice?: string): Promise<StreamingSpeechPlayback | null> {
  if (typeof window === "undefined" || !("MediaSource" in window)) return null;
  if (!MediaSource.isTypeSupported("audio/mpeg")) return null;
  if (!text.trim()) return null;

  return new Promise((resolve) => {
    const mediaSource = new MediaSource();
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(mediaSource);
    let objectUrlActive = true;
    const queue: ArrayBuffer[] = [];
    let socket: WebSocket | null = null;
    let sourceBuffer: SourceBuffer | null = null;
    let resolved = false;
    let stopped = false;
    let streamEnded = false;
    let playbackStarted = false;
    let doneResolve: () => void = () => undefined;
    const done = new Promise<void>((r) => { doneResolve = r; });

    audio.src = objectUrl;

    const releaseObjectUrl = () => {
      if (!objectUrlActive) return;
      objectUrlActive = false;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      try {
        audio.removeAttribute("src");
        audio.load();
      } catch {
        /* Some browsers may reject load() during teardown; the URL still needs releasing. */
      }
      URL.revokeObjectURL(objectUrl);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close();
      releaseObjectUrl();
    };

    const settleNull = () => {
      if (resolved) return;
      resolved = true;
      stopped = true;
      cleanup();
      doneResolve();
      resolve(null);
    };

    const playback: StreamingSpeechPlayback = {
      audio,
      done,
      stop: () => {
        stopped = true;
        cleanup();
        doneResolve();
      },
    };

    const settlePlayback = () => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timer);
      resolve(playback);
    };

    const finishMediaIfReady = () => {
      if (!streamEnded || !sourceBuffer || sourceBuffer.updating || queue.length > 0) return;
      if (mediaSource.readyState === "open") {
        try {
          mediaSource.endOfStream();
        } catch {
          /* ignore */
        }
      }
    };

    const startPlayback = () => {
      if (playbackStarted || stopped) return;
      playbackStarted = true;
      audio.play().then(settlePlayback).catch(settleNull);
    };

    const appendNext = () => {
      if (stopped || !sourceBuffer || sourceBuffer.updating) return;
      const next = queue.shift();
      if (!next) {
        finishMediaIfReady();
        return;
      }
      try {
        sourceBuffer.appendBuffer(next);
        startPlayback();
      } catch {
        settleNull();
      }
    };

    const timer = window.setTimeout(settleNull, TTS_STREAM_FIRST_CHUNK_TIMEOUT_MS);

    audio.onended = () => {
      cleanup();
      doneResolve();
    };
    audio.onerror = () => {
      if (!resolved) settleNull();
      else doneResolve();
    };

    mediaSource.addEventListener("sourceopen", () => {
      try {
        sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
        try {
          sourceBuffer.mode = "sequence";
        } catch {
          /* Safari may keep the default mode for audio/mpeg. */
        }
        sourceBuffer.addEventListener("updateend", () => {
          appendNext();
          finishMediaIfReady();
        });
        appendNext();
      } catch {
        settleNull();
      }
    }, { once: true });

    try {
      socket = new WebSocket(resolveWsUrl("/ws/tts"));
      socket.binaryType = "arraybuffer";
    } catch {
      settleNull();
      return;
    }

    socket.onopen = () => {
      socket?.send(JSON.stringify({ text, emotion, voice }));
    };

    socket.onmessage = (message) => {
      if (stopped) return;
      if (typeof message.data === "string") {
        try {
          const event = JSON.parse(message.data) as { event?: string; message?: string };
          if (event.event === "error") {
            if (!resolved) settleNull();
            else {
              streamEnded = true;
              finishMediaIfReady();
            }
          }
          if (event.event === "done") {
            streamEnded = true;
            finishMediaIfReady();
          }
        } catch {
          settleNull();
        }
        return;
      }
      if (message.data instanceof ArrayBuffer) {
        queue.push(message.data);
        appendNext();
        return;
      }
      settleNull();
    };

    socket.onerror = () => {
      if (!resolved) settleNull();
      else {
        streamEnded = true;
        finishMediaIfReady();
      }
    };

    socket.onclose = () => {
      if (!resolved) {
        settleNull();
        return;
      }
      streamEnded = true;
      finishMediaIfReady();
    };
  });
}

export interface TtsVoice {
  id: string; // 阿里云为字符串音色名（如 longanrou），腾讯云为数字字符串（如 "101016"）
  label: string;
  desc: string;
  gender: "female" | "male";
  default?: boolean;
}
export interface TtsVoicesResponse {
  configured: boolean;
  provider?: "aliyun" | "tencent" | null;
  voices: TtsVoice[];
}
/** 拉取可选音色清单 + 是否已配置云端 TTS。未配置时 voices 为空，UI 显示降级提示。 */
export async function fetchTtsVoices(): Promise<TtsVoicesResponse> {
  try {
    const res = await fetch(`${BASE}/api/tts/voices`);
    if (!res.ok) return { configured: false, voices: [] };
    return await res.json();
  } catch {
    return { configured: false, voices: [] };
  }
}

/** 隐私：彻底删除该本地身份在后端的全部记忆/物件/私房话/向量。返回是否成功。 */
export async function deleteIdentity(user_id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/identity/${encodeURIComponent(user_id)}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchIslandState(user_id: string): Promise<IslandState> {
  const res = await fetch(`${BASE}/api/island-state?user_id=${encodeURIComponent(user_id)}`);
  if (!res.ok) throw new Error("无法读取岛屿状态");
  return res.json();
}

export async function fetchArtifacts(user_id: string): Promise<ArtifactItem[]> {
  const res = await fetch(`${BASE}/api/artifacts?user_id=${encodeURIComponent(user_id)}`);
  if (!res.ok) throw new Error("无法读取岛屿收藏");
  const data = await res.json();
  // 同 fetchMemories 的兜底：缺 artifacts 字段 / 返回数组 / null 时降级为空。
  return Array.isArray(data?.artifacts) ? data.artifacts : Array.isArray(data) ? data : [];
}

/** 写一个字给岛屿：描红写下一个心境字 + 书写动力学，岛屿读出情绪刻成心境石。 */
export async function readGlyph(
  user_id: string, char: string, dynamics: GlyphDynamics,
): Promise<GlyphResponse | null> {
  try {
    const res = await fetch(`${BASE}/api/glyph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, char, dynamics }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 静默坐岛：什么都没说也是说话——后端只留一枚静默贝壳，不写记忆。 */
export async function silentCompanion(user_id: string, duration_seconds: number): Promise<ArtifactItem | null> {
  try {
    const res = await fetch(`${BASE}/api/silent/companion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, duration_seconds }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 专属精灵 AI 对话：后端默认 mock，配置 OpenAI 兼容模型后自动升级。失败时前端走本地温柔回退。 */
export async function requestCompanionChat(payload: CompanionChatRequest): Promise<CompanionChatResponse | null> {
  try {
    const res = await fetch(`${BASE}/api/companion/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function inscribeArtifact(
  user_id: string, artifact_id: number, text: string,
): Promise<ArtifactItem | null> {
  try {
    const res = await fetch(`${BASE}/api/artifacts/${artifact_id}/inscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, text }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function actOnIsland(user_id: string, choice_id: string): Promise<IslandActResponse> {
  const res = await fetch(`${BASE}/api/island/act`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, choice_id }),
  });
  if (!res.ok) throw new Error("岛屿仪式失败");
  return res.json();
}

/** 岛屿主动低语：进入岛屿但还没说话时，岛屿主动用 LLM 说一句温柔的话。
 * 失败/无记忆/安全风险时返回 null。 */
export async function fetchIslandWhisper(user_id: string): Promise<WhisperResponse | null> {
  try {
    const res = await fetch(`${BASE}/api/island/whisper?user_id=${encodeURIComponent(user_id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.show ? data : null;
  } catch {
    return null;
  }
}

/** 岛屿年报：LLM 读全部历史 + 物件，写一封 ~200 字第二人称温柔短信。 */
export async function requestIslandLetter(user_id: string): Promise<LetterResponse | null> {
  try {
    const res = await fetch(`${BASE}/api/island/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 私房安慰话：查询用户教过的所有安慰话。 */
export async function fetchPhrases(user_id: string): Promise<PhraseItem[]> {
  try {
    const res = await fetch(`${BASE}/api/phrases?user_id=${encodeURIComponent(user_id)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.phrases) ? data.phrases : [];
  } catch {
    return [];
  }
}

/** 私房安慰话：教岛屿一句。emotion 必须在 8 类白名单内。 */
export async function addPhrase(
  user_id: string, emotion: string, content: string, attribution = "",
): Promise<PhraseItem | null> {
  try {
    const res = await fetch(`${BASE}/api/phrases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, emotion, content, attribution }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 私房安慰话：软删一条。 */
export async function deletePhrase(user_id: string, phrase_id: number): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE}/api/phrases/${phrase_id}?user_id=${encodeURIComponent(user_id)}`,
      { method: "DELETE" },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** 岛屿修正信：LLM 回看历史叙事，主动承认"那句说得不准确"。
 * force=true 是手动触发开关（调试 / 预览用），让 LLM 用更宽松的判定主动找一处修正。 */
export async function fetchIslandRevision(user_id: string, force = false): Promise<RevisionResponse | null> {
  try {
    const res = await fetch(
      `${BASE}/api/island/revision?user_id=${encodeURIComponent(user_id)}${force ? "&force=true" : ""}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.show ? data : null;
  } catch {
    return null;
  }
}

/** 离岛信件：用户超过 48 小时没回来时拉一句温柔的「我替你看着」。
 * force=true 是手动触发开关（调试 / 预览用），不看实际离开时长仍输出文案。 */
export async function fetchWelcomeBack(user_id: string, force = false): Promise<WelcomeBackResponse | null> {
  try {
    const res = await fetch(
      `${BASE}/api/island/welcome-back?user_id=${encodeURIComponent(user_id)}${force ? "&force=true" : ""}`,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 为新身份请求种子记忆（后端幂等，仅当用户无记忆时实际写入）。失败静默——
 * 没有种子也不影响主流程，只是首访体验弱一些。 */
export async function seedIdentity(user_id: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/identity/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id }),
    });
  } catch {
    /* 种子是优化项，失败不阻塞首访 */
  }
}
