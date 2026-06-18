"""心象岛屿生长系统。

把用户的情绪记忆历史聚合成一个可视化的游戏世界状态 `island_state`：
- growth_level：随记忆数量增长的岛屿成长等级（1-5）
- dominant_emotion：最近记忆里的主导情绪
- trend：情绪趋势（recovering / brightening / stormy / stable / mixed）
- features：岛屿元素（灯塔、星光、花……），随成长等级累积
- weather_memory：近期天气记忆
- summary：给用户看的一句话岛屿状态

纯 Python 计算，不依赖 LLM，保证离线与弱网下演示稳定。
"""

from typing import Any, Dict, List, Optional

from app.schemas import IslandState

EMOTION_ZH = {
    "sad": "难过",
    "anxious": "焦虑",
    "tired": "疲惫",
    "lonely": "孤独",
    "calm": "平静",
    "happy": "愉悦",
    "angry": "愤怒",
    "helpless": "无助",
}

NEGATIVE_EMOTIONS = {"sad", "anxious", "tired", "lonely", "angry", "helpless"}
POSITIVE_EMOTIONS = {"calm", "happy"}

# 情绪 -> 岛屿元素（与前端 IslandScene 可渲染的元素 key 对齐）
EMOTION_FEATURES: Dict[str, List[str]] = {
    "sad": ["rain", "lighthouse", "tide"],
    "anxious": ["fog", "rocks", "wind"],
    "tired": ["stars", "hammock", "fireflies"],
    "lonely": ["single_tree", "moonlight", "distant_boat"],
    "calm": ["sailboat", "calm_water", "sunrise"],
    "happy": ["flowers", "butterflies", "sunshine"],
    "angry": ["cliffs", "storm", "spray"],
    "helpless": ["faint_light", "still_water", "shelter"],
}

TREND_SUMMARY = {
    "recovering": "最近的云层正在慢慢散开，灯塔的光比之前亮了一些。",
    "brightening": "岛屿正在一点点变亮，海面也有了暖色。",
    "stormy": "岛上最近风浪有点大，多停靠休息一会儿也没关系。",
    "stable": "岛屿保持着平稳的潮汐，海面安安静静。",
    "mixed": "岛上的天气交错出现，像你最近起伏的心情。",
}

# 章节导语：岛屿的「去向 / 在等待什么」，给 growth_level 一个方向感而非纯计数。
# 伦理红线：描述性、不评判、不预测、绝不承诺方向必然向好。
CHAPTER_BY_TREND = {
    "recovering": "岛屿正从雾季里慢慢走出来——它不催你，只陪你一程一程地走。",
    "brightening": "岛屿的光一点点亮起来了——这片晴是你自己走到的，它替你收着。",
    "stormy": "岛屿最近风浪不小——它不评判你走得快或慢，先在这儿陪你避一会儿。",
    "stable": "岛屿守着平稳的潮汐——它在原地，等你想说的时候，再说。",
    "mixed": "岛屿的天气交错着来——起伏本就是它真实的样子，它都接得住。",
}


def _growth_level(total_count: int) -> int:
    if total_count <= 1:
        return 1
    if total_count <= 4:
        return 2
    if total_count <= 9:
        return 3
    if total_count <= 19:
        return 4
    return 5


def _trend(seq: List[tuple]) -> str:
    """seq: 最新在前的 (emotion, intensity) 列表（含本次输入）。"""
    if not seq:
        return "stable"

    emotions = [e for e, _ in seq]
    distinct = set(emotions)
    recent3 = seq[:3]
    negatives = [(e, i) for e, i in seq if e in NEGATIVE_EMOTIONS]

    # 连续高强度负面 -> 风浪
    high_neg = sum(1 for e, i in recent3 if e in NEGATIVE_EMOTIONS and i >= 0.8)
    if high_neg >= 2:
        return "stormy"

    # 最近偏正面 -> 变亮
    positive_recent = sum(1 for e in emotions[:3] if e in POSITIVE_EMOTIONS)
    if positive_recent >= 2:
        return "brightening"

    # 负面但强度在缓解 -> 正在恢复
    if len(negatives) >= 2:
        newest = negatives[0][1]
        older_avg = sum(i for _, i in negatives[1:]) / len(negatives[1:])
        if newest < older_avg - 0.05:
            return "recovering"

    # 多种情绪交替 -> 天气交错
    if len(distinct) >= 4:
        return "mixed"

    return "stable"


def _weather_memory(dominant: str, trend: str) -> str:
    if trend in ("recovering", "brightening"):
        return "clearing_sky"
    if dominant in ("sad", "helpless"):
        return "recent_rain"
    if dominant in ("anxious", "lonely"):
        return "misty"
    if dominant in ("happy", "calm"):
        return "clear_sky"
    if dominant == "angry":
        return "after_storm"
    return "drifting_tide"


def _merge_features(emotion_features: List[str], artifacts: List[str]) -> List[str]:
    """情绪元素 + 玩家留下的物件（持久），去重，物件优先常驻。最多展示 8 个。"""
    merged: List[str] = []
    for f in list(artifacts) + list(emotion_features):
        if f not in merged:
            merged.append(f)
    return merged[:8]


def _features(dominant: str, growth_level: int) -> List[str]:
    base = EMOTION_FEATURES.get(dominant, EMOTION_FEATURES["calm"])
    # 成长等级越高，可见元素越多：1-2 级 1 个，3 级 2 个，4-5 级 3 个
    count = 1 if growth_level <= 2 else (2 if growth_level == 3 else 3)
    features = list(base[:count])
    # 灯塔是长期地标：成长到 3 级起常驻
    if growth_level >= 3 and "lighthouse" not in features:
        features.append("lighthouse")
    return features


class IslandStateService:
    """根据情绪历史聚合岛屿状态。"""

    def compute(
        self,
        recent: List[Dict[str, Any]],
        total_count: int,
        current: Optional[Dict[str, Any]] = None,
        artifacts: Optional[List[str]] = None,
    ) -> IslandState:
        """
        recent: 最新在前的记忆列表（不含本次未保存的输入）。
        total_count: 该用户记忆总数（已含本次时由调用方 +1）。
        current: 本次输入 {emotion, intensity}，首次进入未提交时可为 None。
        artifacts: 玩家在岛上留下的物件 key 列表，作为持久元素叠加到岛屿。
        """
        artifacts = artifacts or []
        seq: List[tuple] = []
        if current:
            seq.append((current.get("emotion", "calm"), float(current.get("intensity", 0.5))))
        for m in recent:
            seq.append((m.get("emotion", "calm"), float(m.get("intensity", 0.5))))

        if not seq:
            # 全新岛屿，还没有任何记忆（玩家留下的物件仍然常驻）
            return IslandState(
                dominant_emotion="calm",
                trend="stable",
                growth_level=1,
                features=_merge_features(["sailboat"], artifacts),
                weather_memory="clear_sky",
                summary="这是一座刚刚醒来的岛屿，正在等你说说今天的心情。",
                chapter="这座岛还在等你说第一句话——它会照你说的样子，慢慢长出形状。",
            )

        # 主导情绪：最近序列里出现最多的情绪（平局取更靠前/更新的）
        counts: Dict[str, int] = {}
        for e, _ in seq:
            counts[e] = counts.get(e, 0) + 1
        dominant = max(seq, key=lambda x: (counts[x[0]], -seq.index(x)))[0]

        growth_level = _growth_level(total_count)
        trend = _trend(seq)
        features = _merge_features(_features(dominant, growth_level), artifacts)
        weather_memory = _weather_memory(dominant, trend)
        zh = EMOTION_ZH.get(dominant, "平静")
        summary = (
            f"你的心象岛屿成长到第 {growth_level} 级，最近以{zh}为主。"
            + TREND_SUMMARY.get(trend, TREND_SUMMARY["stable"])
        )

        return IslandState(
            dominant_emotion=dominant,
            trend=trend,
            growth_level=growth_level,
            features=features,
            weather_memory=weather_memory,
            summary=summary,
            chapter=CHAPTER_BY_TREND.get(trend, CHAPTER_BY_TREND["stable"]),
        )
