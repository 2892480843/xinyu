import { useEffect, useMemo, useRef, useState } from "react";
import {
  startRealtimeServerSpeech,
  startServerSpeech,
  type ServerSpeechSession,
} from "../lib/serverSpeech";

interface Props {
  disabled?: boolean;
  /** 当前输入框文本：语音结果会「追加」在它之后，而非覆盖用户已输入的内容。 */
  baseText?: string;
  onTranscript: (text: string) => void;
}

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function isServiceUnavailableError(error: string): boolean {
  return error === "network" || error === "service-not-allowed";
}

function describeError(error: string): string {
  if (error === "not-allowed") return "麦克风权限未开启";
  if (error === "service-not-allowed") return "当前浏览器未开放语音服务，先用文字输入";
  if (error === "no-speech") return "没有听到声音";
  if (error === "audio-capture") return "无法访问麦克风";
  if (error === "network") return "语音服务连不上，已切回文字输入";
  return "语音识别暂时不可用";
}

export default function VoiceInputButton({ disabled = false, baseText = "", onTranscript }: Props) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const serverSessionRef = useRef<ServerSpeechSession | null>(null);
  const serverRealtimeRef = useRef(false);
  const serverBaseRef = useRef("");
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const Recognition = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return getSpeechRecognitionCtor();
  }, []);
  const supported = Boolean(Recognition);
  // 浏览器仅在「安全上下文」(HTTPS 或 localhost) 下允许麦克风/语音识别；
  // 手机上用 http:// 或局域网 IP 访问时 isSecureContext=false，识别必失败。
  const secureContext = typeof window === "undefined" || window.isSecureContext;

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      serverSessionRef.current?.abort();
      serverRealtimeRef.current = false;
    };
  }, []);

  const stop = () => {
    const serverSession = serverSessionRef.current;
    if (serverSession) {
      const wasRealtime = serverRealtimeRef.current;
      serverSessionRef.current = null;
      serverRealtimeRef.current = false;
      setListening(false);
      setBusy(true);
      setHint(wasRealtime ? "正在结束实时识别…" : "正在识别语音…");
      void serverSession.stop().then((spoken) => {
        if (wasRealtime) {
          setHint(spoken ? "已结束实时识别" : "没有识别到内容，先用文字输入");
          return;
        }
        const transcript = (spoken || "").trim();
        if (transcript) {
          const base = serverBaseRef.current;
          onTranscript(base ? `${base} ${transcript}` : transcript);
          setHint("已转成文字");
        } else {
          setHint("没有识别到内容，先用文字输入");
        }
      }).catch(() => {
        setHint("服务端语音识别失败，先用文字输入");
      }).finally(() => {
        setBusy(false);
      });
      return;
    }
    recognitionRef.current?.stop();
    setListening(false);
    setHint("已停止聆听");
  };

  const startServerFallback = async () => {
    if (disabled || busy) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setHint("麦克风需安全连接（HTTPS）");
      return;
    }
    setBusy(true);
    setHint("正在打开麦克风…");
    try {
      const base = baseText.trim();
      let realtime = true;
      let session = await startRealtimeServerSpeech({
        onTranscript: (spoken, final) => {
          const transcript = spoken.trim();
          if (!transcript) return;
          onTranscript(base ? `${base} ${transcript}` : transcript);
          setHint(final ? "已实时转成文字" : "正在实时识别…");
        },
        onStatus: setHint,
      });
      if (!session) {
        realtime = false;
        session = await startServerSpeech();
      }
      if (!session) {
        setHint("当前浏览器无法录音，先用文字输入");
        return;
      }
      serverSessionRef.current = session;
      serverRealtimeRef.current = realtime;
      serverBaseRef.current = base;
      setServiceUnavailable(true);
      setListening(true);
      setHint(realtime ? "正在实时识别…" : "正在录音，再点一次结束识别");
    } catch {
      setHint("无法访问麦克风，先用文字输入");
    } finally {
      setBusy(false);
    }
  };

  const start = (retryService = false) => {
    if (!Recognition || disabled) return;
    if (serviceUnavailable && !retryService) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setHint("麦克风需安全连接（HTTPS）");
      return;
    }
    setServiceUnavailable(false);

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = "";
    // 开始聆听时快照输入框已有文本——语音结果追加其后，不抹掉用户已打的字。
    const base = baseText.trim();

    recognition.onstart = () => {
      setListening(true);
      setHint("正在聆听…");
    };

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const item = event.results[i];
        const transcript = item[0].transcript.trim();
        if (item.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      const spoken = (finalText || interimText).trim();
      // base 在前、语音在后；spoken 为空时保留 base，避免清空已输入内容。
      const combined = base ? (spoken ? `${base} ${spoken}` : base) : spoken;
      onTranscript(combined);
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (isServiceUnavailableError(event.error)) {
        setServiceUnavailable(true);
        setHint("浏览器语音连不上，改用服务端识别");
        return;
      }
      setHint(describeError(event.error));
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      setHint((current) => (current === "正在聆听…" ? "识别已结束" : current));
    };

    try {
      recognition.start();
    } catch {
      setListening(false);
      setHint("语音识别启动失败");
    }
  };

  if (!supported) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/40">
        <button
          type="button"
          disabled
          title="当前浏览器不支持语音输入"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-white/35 border border-white/10 cursor-not-allowed"
        >
          麦
        </button>
        <span>当前浏览器不支持语音输入</span>
      </div>
    );
  }

  if (!secureContext) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/40">
        <button
          type="button"
          disabled
          title="麦克风需 HTTPS 安全连接（用 https:// 或 localhost 打开）"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-white/35 border border-white/10 cursor-not-allowed"
        >
          麦
        </button>
        <span>麦克风需 HTTPS 安全连接</span>
      </div>
    );
  }

  if (serviceUnavailable) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
        <button
          type="button"
          onClick={listening ? stop : () => startServerFallback()}
          disabled={disabled || busy}
          title={listening ? "结束录音并识别" : "改用服务端语音输入"}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/12 hover:bg-white/20 text-white/82 border border-white/15 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {listening ? "■" : "麦"}
        </button>
        <span>{hint || "浏览器语音连不上，改用服务端识别"}</span>
        {!listening && (
          <button
            type="button"
            onClick={() => startServerFallback()}
            disabled={disabled || busy}
            className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] text-white/65 transition hover:bg-white/14 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            重试
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-white/45">
      <button
        type="button"
        onClick={listening ? stop : () => start()}
        disabled={disabled || busy}
        title={listening ? "停止语音输入" : "开始语音输入"}
        className="grid h-10 w-10 place-items-center rounded-full bg-white/12 hover:bg-white/20 text-white/82 border border-white/15 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {listening ? "■" : "麦"}
      </button>
      <span>{hint || "点击麦克风说出心情"}</span>
    </div>
  );
}
