"""风险提示服务。纯逻辑，不调用模型。

触发条件（满足其一即触发）：
1. 高风险情绪（sad/angry/helpless）且强度达到阈值；
2. 命中高风险关键词黑名单（自伤/绝望/伤人类表达）——不依赖强度，
   修复「平静措辞的自伤表达因强度低而漏过」的安全漏洞。
"""

import re
import unicodedata

from app import config
from app.schemas import Safety

# 归一化用：保留字母/数字/汉字，去掉其余一切（空格、标点、分隔符）。
_NONWORD = re.compile(r"[^0-9a-z一-鿿]+")


def _compact(text: str) -> str:
    """全角转半角 + 小写 + 去掉所有非「字母/数字/汉字」字符。
    用于挫败「想 死」「自。杀」「ｋｉｌｌ」「想-死」这类插入空格/标点/全角的绕过。"""
    norm = unicodedata.normalize("NFKC", text or "").lower()
    return _NONWORD.sub("", norm)

SAFETY_MESSAGE = (
    "你的情绪听起来很重。如果你觉得很难受，请记得，你不是一个人。"
    "《心屿》不是心理咨询或医疗服务，它只能陪伴你片刻。"
    "如果你可能伤害自己或他人，请立刻联系身边可信任的人，或拨打当地紧急电话。"
    "在需要的时候，也可以拨打全国统一心理援助热线 12356。"
)


class SafetyService:
    def check(self, emotion: str, intensity: float, text: str = "") -> Safety:
        keyword_hit = self.has_risk_keyword(text)
        threshold_hit = (
            emotion in config.SAFETY_EMOTIONS and intensity >= config.SAFETY_INTENSITY_THRESHOLD
        )
        if not (keyword_hit or threshold_hit):
            return Safety(triggered=False, message=None)
        return Safety(triggered=True, message=SAFETY_MESSAGE)

    @staticmethod
    def has_risk_keyword(text: str) -> bool:
        """公开的关键词安全检查——供 whisper/revision/letter 等非 reflect 端点对
        历史记忆原文做复检，避免「平静措辞的自伤记忆」被 LLM 自由复述。
        双重匹配：① 原文小写子串；② 归一化「紧凑形」子串（去空格/标点、全角转半角），
        挫败「想 死」「自。杀」「ｋｉｌｌ ｍｙｓｅｌｆ」等插字符/全角绕过。安全优先，宁可误触发。"""
        if not text:
            return False
        lowered = text.lower()
        compact = _compact(text)
        for kw in config.SAFETY_KEYWORDS:
            kl = kw.lower()
            if kl in lowered:
                return True
            kc = _compact(kw)
            if kc and kc in compact:
                return True
        return False

    def memory_is_high_risk(self, memory: dict) -> bool:
        """一条记忆是否高风险：情绪+强度阈值 或 原文命中关键词黑名单。"""
        if not memory:
            return False
        emotion = memory.get("emotion", "")
        try:
            intensity = float(memory.get("intensity", 0) or 0)
        except (TypeError, ValueError):
            intensity = 0.0
        threshold_hit = emotion in config.SAFETY_EMOTIONS and intensity >= config.SAFETY_INTENSITY_THRESHOLD
        return threshold_hit or self.has_risk_keyword(memory.get("text", ""))
