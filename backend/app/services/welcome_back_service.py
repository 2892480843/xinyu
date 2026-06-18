"""离岛信件：用户超过一定时长没回来时，岛屿主动留一句话。

不打扰：从来不发推送，仅在下次打开时浮现；用户随手可关；当日 dismiss 不再弹。
不焦虑化：不是 streak、不是打卡，只是一句温柔的"我替你看着"。
"""

from datetime import datetime
from typing import Any, Dict, Optional, Tuple


ABSENCE_THRESHOLD_HOURS = 48

_TEMPLATES_WITH_ARTIFACT = (
    "你那{label}，岛屿替你看了{phrase}。海风很轻，没人打扰它。",
    "你上次留下的{label}还在原地，岛上{phrase}没什么大事，欢迎回来。",
    "岛上的雾散了一些。你那{label}就在你离开时的位置，岛屿一直替你守着。",
    "{phrase}里，海面没起过大浪。你那{label}今天依旧好好的。",
)
_TEMPLATES_NO_ARTIFACT = (
    "好久不见。岛上潮起潮落{phrase}，海面一直在等你。",
    "岛屿在想你。{phrase}过去了，今天的海是浅蓝色的。",
    "你回来啦。这{phrase}里，岛屿替你把雾收了又放，没出什么事。",
)


def _humanize(hours: float) -> str:
    if hours < 24:
        return "一阵子"
    days = int(hours // 24)
    if days < 7:
        return f"{days} 天"
    if days < 30:
        return f"{days // 7} 周"
    return f"{days // 30} 个月"


def _parse_iso(ts: str) -> Optional[datetime]:
    if not ts:
        return None
    try:
        # 兼容尾部 'Z'；datetime.fromisoformat 在 3.9 不支持 'Z'
        return datetime.fromisoformat(ts.rstrip("Z"))
    except (TypeError, ValueError):
        return None


class WelcomeBackService:
    """根据最新记忆时间 + 最近物件，决定是否给一句离岛问候。"""

    threshold_hours: float = ABSENCE_THRESHOLD_HOURS

    def compose(
        self,
        last_memory_iso: Optional[str],
        latest_artifact: Optional[Dict[str, Any]],
        force: bool = False,
        now: Optional[datetime] = None,
    ) -> Tuple[bool, str, int]:
        """返回 (should_show, message, hours_away)。
        - 没有任何记忆：不显示。
        - 离开时长 < 阈值且非 force：不显示。
        - force=True：演示用，强制按当前 hours_away（可能为 0）走文案；
          此时文案里的"X 天/X 周"会按时长 humanize，0 小时显示"一阵子"。
        """
        last_dt = _parse_iso(last_memory_iso or "")
        if last_dt is None:
            return False, "", 0
        now_dt = now or datetime.utcnow()
        hours_away = max(0.0, (now_dt - last_dt).total_seconds() / 3600)

        if not force and hours_away < self.threshold_hours:
            return False, "", int(hours_away)

        phrase = _humanize(hours_away)
        # 选择模板：按 hours_away 取模，避免随机不稳定，演示与回归测试一致
        bucket = int(hours_away)
        if latest_artifact and latest_artifact.get("label"):
            tpl = _TEMPLATES_WITH_ARTIFACT[bucket % len(_TEMPLATES_WITH_ARTIFACT)]
            msg = tpl.format(label=latest_artifact["label"], phrase=phrase)
        else:
            tpl = _TEMPLATES_NO_ARTIFACT[bucket % len(_TEMPLATES_NO_ARTIFACT)]
            msg = tpl.format(phrase=phrase)
        return True, msg, int(hours_away)
