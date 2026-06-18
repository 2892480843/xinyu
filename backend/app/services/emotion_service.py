"""情绪分析服务：薄封装，委托给 LLM Provider。"""

from typing import Any, Dict, List

from app.services.llm_provider import LLMProvider


class EmotionService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    def analyze(self, text: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        data = self._provider.analyze_emotion(text, history)
        # 防御性补全
        data.setdefault("emotion", "calm")
        data.setdefault("intensity", 0.5)
        data.setdefault("summary", "用户情绪平稳")
        try:
            data["intensity"] = max(0.0, min(1.0, float(data["intensity"])))
        except (TypeError, ValueError):
            data["intensity"] = 0.5
        return data
