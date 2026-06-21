import { useState } from "react";
import type { WelcomeBackResponse, WhisperResponse, RevisionResponse } from "../../lib/api";

interface Props {
  revision: RevisionResponse | null;
  welcomeBack: WelcomeBackResponse | null;
  whisper: WhisperResponse | null;
}

// 顶部「岛屿留言」薄卡：一次只显一张，可收起。
// 优先级与桌面 Home.tsx:650-658 一致：修正信 > 离岛信 > 低语。
export default function MobileInbox({ revision, welcomeBack, whisper }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const msg =
    revision?.show ? { kind: "岛屿想更正一句", text: revision.revision }
    : welcomeBack?.show ? { kind: "岛屿留了句话", text: welcomeBack.message }
    : whisper?.show ? { kind: "岛屿轻声说", text: whisper.whisper }
    : null;
  if (!msg || dismissed) return null;
  return (
    <div className="panel-glass-1 mx-auto w-full max-w-[30rem] rounded-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption tracking-[0.2em] text-white/40">{msg.kind}</p>
          <p className="mt-1 font-serif text-[14px] leading-relaxed text-white/82">{msg.text}</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="收起"
          className="shrink-0 text-[18px] leading-none text-white/40 active:scale-90"
        >
          ×
        </button>
      </div>
    </div>
  );
}
