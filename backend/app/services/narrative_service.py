"""治愈叙事生成服务：委托给 LLM Provider。"""

from typing import Any, Dict, List

from app.services.llm_provider import LLMProvider


class NarrativeService:
    def __init__(self, provider: LLMProvider) -> None:
        self._provider = provider

    def generate(
        self, emotion: str, intensity: float, summary: str, imagery: List[str], history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        data = self._provider.generate_narrative(emotion, intensity, summary, imagery, history)
        data.setdefault("narrative", "")
        data.setdefault("imprint", None)
        return data
