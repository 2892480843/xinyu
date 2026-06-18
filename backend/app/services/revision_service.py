"""岛屿修正信：LLM 回看昨日叙事，主动承认"我那句说得不准确"。

破圈点：上一轮所有 LLM 输出（whisper/letter/narrative）都是单向前进的——
AI 永远在"说下一句"，从不回头看"上一句"。本服务让 LLM 第一次回头审视自己。

设计原则：
- 不改写原记忆（时间真实性）—— 只追加一封今日修正信
- 不每次都修正（评判过敏会让用户感到 AI 在自责讨好），按需触发
- 高风险记忆不做"修正"（避免影响关键安全叙事）
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


def _parse_iso(ts: str) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.rstrip("Z"))
    except (TypeError, ValueError):
        return None


class RevisionService:
    """筛选出"昨天/前天的某条叙事"，让 LLM 判断是否需要修正。"""

    def pick_target(
        self,
        memories: List[Dict[str, Any]],
        now: Optional[datetime] = None,
        force: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """选出最值得回看的一条记忆：优先昨天，回退到 24-72 小时之前。
        force=True 时即使是最近也允许（演示用）。"""
        if not memories:
            return None
        now_dt = now or datetime.utcnow()
        candidates: List[Tuple[float, Dict[str, Any]]] = []
        for m in memories:
            dt = _parse_iso(m.get("created_at", ""))
            if dt is None or not m.get("narrative"):
                continue
            hours = (now_dt - dt).total_seconds() / 3600
            if force or (12 <= hours <= 72):
                candidates.append((hours, m))
        if not candidates:
            # 都太近？演示路径走 force=True 时取最新的一条有叙事
            if force:
                for m in memories:
                    if m.get("narrative"):
                        return m
            return None
        # 优先 "刚过昨天" 的记忆（约 24-36 小时），靠这个窗口最有"今天回看"的语义
        candidates.sort(key=lambda x: abs(x[0] - 28))
        return candidates[0][1]
