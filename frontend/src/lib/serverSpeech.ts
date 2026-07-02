import { resolveAsrWsUrl, transcribeSpeech } from "./api";

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export interface ServerSpeechSession {
  stop: () => Promise<string | null>;
  abort: () => void;
}

export interface RealtimeServerSpeechOptions {
  onTranscript: (text: string, final: boolean) => void;
  onStatus?: (status: string) => void;
}

export function downsampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === TARGET_SAMPLE_RATE) return new Float32Array(input);
  const ratio = sourceRate / TARGET_SAMPLE_RATE;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j];
      count += 1;
    }
    output[i] = count > 0 ? sum / count : input[Math.min(start, input.length - 1)] ?? 0;
  }
  return output;
}

export function floatTo16BitPcm(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const size = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return merged.buffer;
}

/** 启动实时服务端语音输入兜底。边录边推给后端 ASR，识别结果会通过 onTranscript 回调返回。 */
export async function startRealtimeServerSpeech({
  onTranscript,
  onStatus,
}: RealtimeServerSpeechOptions): Promise<ServerSpeechSession | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const AudioContextCtor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextCtor || typeof WebSocket === "undefined") return null;

  let socket: WebSocket;
  try {
    socket = new WebSocket(resolveAsrWsUrl());
    socket.binaryType = "arraybuffer";
  } catch {
    return null;
  }

  let stopped = false;
  let latestTranscript = "";
  let latestFinalTranscript = "";

  socket.onopen = () => {
    socket.send(JSON.stringify({ sample_rate: TARGET_SAMPLE_RATE, format: "pcm" }));
    onStatus?.("正在实时识别…");
  };

  socket.onmessage = (message) => {
    if (typeof message.data !== "string") return;
    try {
      const event = JSON.parse(message.data) as {
        event?: string;
        transcript?: string;
        final?: boolean;
        message?: string;
      };
      if (event.event === "started") {
        onStatus?.("正在实时识别…");
      }
      if (event.event === "transcript") {
        const text = String(event.transcript || "").trim();
        if (!text) return;
        latestTranscript = text;
        if (event.final) latestFinalTranscript = text;
        onTranscript(text, Boolean(event.final));
      }
      if (event.event === "done") {
        onStatus?.("已结束实时识别");
      }
      if (event.event === "error") {
        onStatus?.(event.message || "服务端语音识别失败，先用文字输入");
      }
    } catch {
      onStatus?.("服务端语音识别格式异常，先用文字输入");
    }
  };

  socket.onerror = () => {
    onStatus?.("服务端语音识别失败，先用文字输入");
  };

  socket.onclose = () => {
    if (!stopped) onStatus?.("实时语音连接已断开");
  };

  let stream: MediaStream;
  let context: AudioContext;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    context = new AudioContextCtor();
    if (context.state === "suspended") {
      await context.resume();
    }
  } catch (error) {
    stopped = true;
    if (socket.readyState <= WebSocket.OPEN) socket.close();
    throw error;
  }

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
  const silentGain = context.createGain();

  silentGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    if (stopped || socket.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleTo16k(input, context.sampleRate);
    socket.send(floatTo16BitPcm(downsampled));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: "stop" }));
      }
    } catch {
      /* ignore */
    }
    if (socket.readyState <= WebSocket.OPEN) socket.close();
    processor.disconnect();
    source.disconnect();
    silentGain.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };

  return {
    abort: cleanup,
    stop: async () => {
      cleanup();
      return (latestFinalTranscript || latestTranscript).trim() || null;
    },
  };
}

/** 启动服务端语音输入兜底。调用 stop() 后会返回识别文本，失败时返回 null。 */
export async function startServerSpeech(): Promise<ServerSpeechSession | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const AudioContextCtor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContextCtor();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
  const silentGain = context.createGain();
  const chunks: ArrayBuffer[] = [];
  let stopped = false;

  silentGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleTo16k(input, context.sampleRate);
    chunks.push(floatTo16BitPcm(downsampled));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  const cleanup = () => {
    stopped = true;
    processor.disconnect();
    source.disconnect();
    silentGain.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };

  return {
    abort: cleanup,
    stop: async () => {
      cleanup();
      if (chunks.length === 0) return null;
      return transcribeSpeech(concatBuffers(chunks), TARGET_SAMPLE_RATE);
    },
  };
}
