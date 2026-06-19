"""LLM Provider 抽象层。

- MockProvider: 关键词驱动的离线模式，保证无 Key 也能完整演示。
- OpenAIProvider: 兼容 OpenAI Chat Completions 接口的真实模型，失败时自动降级到 Mock。
"""

import hashlib
import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

import httpx

from app import config
from app.services.companion_prompt import COMPANION_ALLOWED_ANIMATIONS, COMPANION_SYSTEM_PROMPT

logger = logging.getLogger("xinyu.llm")

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

# 各情绪的关键词表（含中英文常见表达）
EMOTION_KEYWORDS: Dict[str, List[str]] = {
    "sad": ["难过", "伤心", "悲伤", "想哭", "哭了", "心碎", "失落", "低落", "难受", "心痛", "遗憾", "思念", "想念", "sad", "cry"],
    "anxious": ["焦虑", "紧张", "担心", "害怕", "不安", "慌", "焦急", "压力", "怕", "恐惧", "烦躁", "坐立不安", "忐忑", "anxious", "nervous", "stress"],
    "tired": ["累", "疲惫", "疲倦", "困", "乏力", "没力气", "熬夜", "撑不住", "倦", "精疲力尽", "犯困", "透支", "tired", "exhausted"],
    "lonely": ["孤独", "寂寞", "一个人", "没人", "无人", "空虚", "冷清", "孤单", "没朋友", "形单影只", "lonely", "alone"],
    "calm": ["平静", "放松", "安静", "释然", "舒服", "还好", "挺好", "宁静", "惬意", "淡定", "平和", "calm", "relax"],
    "happy": ["开心", "快乐", "高兴", "兴奋", "满足", "幸福", "喜悦", "美好", "愉快", "棒", "惊喜", "happy", "glad"],
    "angry": ["生气", "愤怒", "气死", "讨厌", "受够", "烦死", "爆发", "抓狂", "气愤", "不爽", "怒", "气炸", "angry", "mad"],
    "helpless": ["无助", "无力", "没办法", "绝望", "崩溃", "不知所措", "撑不下去", "没希望", "想放弃", "无望", "窒息", "坚持不下去", "helpless"],
}

INTENSIFIERS = ["很", "非常", "太", "极", "超级", "特别", "真的", "巨", "贼", "死", "完全", "根本", "彻底", "真", "好", "超"]


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _pick_variant(variants: List[str], seed_text: str, offset: int = 0) -> str:
    """根据文本哈希挑选一个变体。

    offset 用于在重复相同输入时轮换变体，避免现场连续演示时输出完全一样。
    """
    h = int(hashlib.md5(seed_text.encode("utf-8")).hexdigest(), 16)
    return variants[(h + offset) % len(variants)]


class LLMProvider(ABC):
    """Provider 接口：情绪分析与叙事生成两件事，外加两条岛屿主动叙事能力。"""

    @abstractmethod
    def analyze_emotion(self, text: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """返回 {emotion, intensity, summary}。"""

    @abstractmethod
    def generate_narrative(
        self, emotion: str, intensity: float, summary: str, imagery: List[str], history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """返回 {narrative, imprint, memory_hint}。"""

    @abstractmethod
    def generate_whisper(
        self,
        recent_memories: List[Dict[str, Any]],
        island_state: Dict[str, Any],
        latest_artifact: Optional[Dict[str, Any]],
        avoid_phrases: List[str],
    ) -> str:
        """岛屿主动低语：15-30 字中文，环境化叙述，不向用户提问。无法生成时返回空串。"""

    @abstractmethod
    def generate_letter(
        self,
        memories: List[Dict[str, Any]],
        artifacts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """岛屿年报：返回 {letter, observed_pattern, mentioned_artifacts}。
        letter ≈ 180-220 字第二人称温柔短信，不诊断。"""

    @abstractmethod
    def read_glyph(self, char: str, dynamics: Dict[str, Any], prior_emotion: str) -> Dict[str, Any]:
        """手写一字读心：用户写下一个心境字（已知字，不做 OCR），附带书写动力学
        （笔速/停顿/抖动）。返回 {emotion, intensity, reading}，reading 是 15-24 字内
        读懂他写这个字时心情的一句话。不诊断身体症状。"""

    @abstractmethod
    def generate_revision(self, target_memory: Dict[str, Any], lenient: bool = False) -> Dict[str, Any]:
        """岛屿修正信：让 LLM 回看一条历史叙事，判断是否需要补一句"那时我说得不太对"。
        lenient=True 是演示模式，鼓励 AI 主动找一处可以更贴的细节做修正。
        返回 {needed: bool, kind: 'too_heavy'|'too_light'|'off_topic'|''，revision: 60-100 字修正文本（needed=False 时为空）}。"""

    @abstractmethod
    def generate_companion_reply(
        self,
        message: str,
        companion: Dict[str, Any],
        emotion: str,
        recent_memories: List[Dict[str, Any]],
        island_state: Dict[str, Any],
    ) -> Dict[str, Any]:
        """专属精灵对话：返回 {reply, emotion, animation}。"""


# 各情绪的治愈叙事模板（50-120 字），风格温柔克制
NARRATIVE_TEMPLATES: Dict[str, List[str]] = {
    "sad": [
        "岛屿下起了细雨，海浪一遍遍抚过沙滩，像在替你卸下肩上的重量。难过的情绪不必急着赶走，就让雨陪你坐一会儿，潮水会慢慢把它带走。",
        "暮色里，远处的灯塔亮起一盏柔光。此刻的失落是真实的，但你愿意把它说给岛屿听，已经很勇敢了。雨总会停，岸一直都在。",
    ],
    "anxious": [
        "雾气在海面缓缓散开，礁石安静地待在原地。焦虑像潮水涨了又退，你可以先什么都不做，跟着岛屿的呼吸，慢慢数一次浪花。",
        "风穿过薄雾，把翻涌的思绪轻轻抚平。眼前的事不必一次理清，岛屿陪你在雾里慢一点走，路会一点一点显出来。",
    ],
    "tired": [
        "夜深了，岛上的风很轻。你躺在吊床里，星星替你守着今晚。今天已经很努力了，那些做不好的事，先搁在岸边吧，岛屿会替你看着。",
        "萤火虫在草丛里一明一灭，像岛屿在对你说晚安。疲惫是身体在请求休息，不必自责。闭上眼，让海浪声接住你，明天太阳还会升起。",
    ],
    "lonely": [
        "晨雾里，岸边那棵树静静地站着，等你来。一个人不等于被遗忘，岛屿记得你每一次靠岸。雾会散，会有人像这片海一样，慢慢走向你。",
        "安静的清晨，海浪是岛屿低声的回应。此刻的孤单，岛屿都听见了。你不必马上热闹起来，先让这片宁静，轻轻陪陪你。",
    ],
    "calm": [
        "阳光洒在海面，一艘小帆船随波轻轻摇晃。这份平静是你自己走到这里的，岛屿为你留住了它。慢慢呼吸，让宁静多停留一会儿。",
        "晴朗的午后，浪花温柔地拍着岸。你愿意慢下来，真好。岛屿把这份安稳收好，等你下次再来，它还在这里，海还是这样蓝。",
    ],
    "happy": [
        "阳光落在花丛上，蝴蝶绕着光跳舞。你的喜悦让整座岛都亮了起来，岛屿想替你记住这个瞬间。开心的时候，就尽情地开心吧。",
        "海风带着花香，阳光把你的心情照得透亮。这份明亮值得被收藏，岛屿把它折成一颗星，挂在你今晚的天空上。",
    ],
    "angry": [
        "乌云压着海面，浪拍打着崖壁。愤怒是你在为自己撑出边界，岛屿懂你。风会一点点把火气吹散，等浪平静下来，你再来听海。",
        "风暴在远处翻涌，崖边的石头始终稳稳立着。你的怒气有它的来处，不必压住它。让岛屿陪你站一会儿，等风势小了，再慢慢说。",
    ],
    "helpless": [
        "雨落在静水里，远处有一点微光。撑不住的时候，停下来不是软弱，是你在保护自己。岛屿不催你，它只想让你知道，你不是一个人在这里。",
        "黑夜里，雨水轻轻敲着水面。无力感很重，岛屿接住了一部分。你不需要现在就有答案，先歇一歇，那点微光，会陪你到天亮。",
    ],
}

IMPRINT_TEMPLATES: Dict[str, List[str]] = {
    "sad": [
        "雨会停在你愿意抬头的那一刻，岸边的灯一直替你亮着。",
        "难过不是退潮后的荒凉，而是心在等待一束更柔的光。",
    ],
    "anxious": [
        "雾再浓，也会被一步一步的呼吸打开，路不必一次看清。",
        "把慌乱交给风，把脚步留给自己，潮水会慢慢退到远处。",
    ],
    "tired": [
        "今晚先把自己交给星光，明天的海会替你重新托起帆。",
        "疲惫只是心在请你停靠，不是你失去了再次出发的力气。",
    ],
    "lonely": [
        "即使此刻只有海浪回应你，也有一座岛认真记得你的名字。",
        "孤单像清晨的雾，会散；你心里的岸，会等来温柔的船。",
    ],
    "calm": [
        "愿这片安静在你心里多住一会儿，像海面收好午后的光。",
        "平静不是没有风，而是你终于听见了自己内在的潮汐。",
    ],
    "happy": [
        "把今天的光折进心里，往后暗下来的夜也会有星星可寻。",
        "喜悦是一枚小小的贝壳，愿你在忙碌时还能听见海声。",
    ],
    "angry": [
        "愤怒也在保护你，等风小一些，再为自己选一条更亮的路。",
        "让浪先替你喊出委屈，等海面平了，你依然可以稳稳站着。",
    ],
    "helpless": [
        "最暗的水面也会藏着微光，先停靠，别急着独自穿过黑夜。",
        "没有答案的夜里，也请先握住自己，天亮会慢慢靠近岸边。",
    ],
}


def _normalize_imprint(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    imprint = value.strip()
    if not imprint or imprint.lower() in ("null", "none"):
        return None
    if len(imprint) < 20:
        return None
    if len(imprint) > 60:
        imprint = imprint[:60]
    return imprint


class MockProvider(LLMProvider):
    """离线关键词驱动模式。"""

    def __init__(self) -> None:
        # 叙事/印记的轮换计数：让重复相同输入时输出也会变化
        self._rotation = 0

    def analyze_emotion(self, text: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        t = text.lower()
        scores: Dict[str, int] = {}
        for emo, kws in EMOTION_KEYWORDS.items():
            scores[emo] = sum(t.count(k) for k in kws)

        max_score = max(scores.values()) if scores else 0
        if max_score <= 0:
            emotion = "calm"
        else:
            # 平局时优先更"需要回应"的情绪
            priority = ["helpless", "sad", "angry", "anxious", "lonely", "tired", "happy", "calm"]
            best = max(scores.items(), key=lambda kv: (kv[1], -priority.index(kv[0])))
            emotion = best[0]

        hits = scores.get(emotion, 0)
        intensifier_count = sum(t.count(k) for k in INTENSIFIERS)
        excl = text.count("！") + text.count("!")
        ellipsis = text.count("…") + text.count("...")

        intensity = 0.5
        intensity += min(0.1 * hits, 0.28)
        intensity += min(0.08 * intensifier_count, 0.24)
        if len(text) > 45:
            intensity += 0.05
        if emotion in ("helpless", "sad", "angry") and intensifier_count >= 2:
            intensity += 0.08
        intensity += min(0.04 * excl, 0.08)
        if ellipsis:
            intensity += 0.04
        if len(text) > 80:
            intensity += 0.04
        intensity = round(_clamp(intensity, 0.32, 0.97), 2)

        zh = EMOTION_ZH.get(emotion, "平静")
        if intensity >= 0.8:
            level = "强烈的"
        elif intensity >= 0.6:
            level = "明显的"
        else:
            level = "淡淡的"
        summary = f"用户感到{level}{zh}"

        return {"emotion": emotion, "intensity": intensity, "summary": summary}

    def generate_narrative(
        self, emotion: str, intensity: float, summary: str, imagery: List[str], history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        self._rotation += 1
        narrative = _pick_variant(
            NARRATIVE_TEMPLATES.get(emotion, NARRATIVE_TEMPLATES["calm"]), emotion + str(intensity), self._rotation
        )
        imprint = _pick_variant(
            IMPRINT_TEMPLATES.get(emotion, IMPRINT_TEMPLATES["calm"]), narrative + summary, self._rotation
        )
        memory_hint = self._build_memory_hint(history)
        return {"narrative": narrative, "imprint": imprint, "memory_hint": memory_hint}

    @staticmethod
    def _build_memory_hint(history: List[Dict[str, Any]]) -> Optional[str]:
        if not history:
            return None
        last = history[0]
        zh = EMOTION_ZH.get(last.get("emotion", ""), "一些事")
        hints = [
            f"岛屿记得你上次也带着{zh}来过，但你依然走到了今天。",
            f"上次你来时也提到过{zh}，这片海替你记着呢。",
            f"我记得你上次的{zh}，今天的你，比那时又多走了一步。",
        ]
        return _pick_variant(hints, json.dumps(last, ensure_ascii=False, sort_keys=True))

    def generate_whisper(
        self,
        recent_memories: List[Dict[str, Any]],
        island_state: Dict[str, Any],
        latest_artifact: Optional[Dict[str, Any]],
        avoid_phrases: List[str],
    ) -> str:
        """模板低语：基于最近主导情绪 + 物件名 + trend，按时间分桶选模板。"""
        if not recent_memories:
            return ""
        dominant = island_state.get("dominant_emotion", "calm") if island_state else "calm"
        trend = island_state.get("trend", "stable") if island_state else "stable"
        artifact_label = (latest_artifact or {}).get("label", "")
        # 模板池——环境化叙述，第二人称，无问号
        if artifact_label:
            pool = [
                f"海面比上次平静了一些，你那{artifact_label}还在原地。",
                f"今晨雾散了一点，你那{artifact_label}没动过。",
                f"夜里风很轻，你那{artifact_label}替你守着光。",
                f"潮水退到远处，你那{artifact_label}也在等你回来。",
            ]
        elif trend == "recovering":
            pool = [
                "海面比你上次离开时更亮了一些，岛屿一直在等你。",
                "今晨雾散得早，岛屿想把这片清亮留给你。",
            ]
        elif trend == "brightening":
            pool = [
                "阳光今天好得有点过分，岛屿想分你一些。",
                "海面是浅蓝色的，岛屿替你收着这片好天气。",
            ]
        elif trend == "stormy":
            pool = [
                "夜里下过一阵雨，岛屿替你把礁石擦干净了。",
                "海面起过一阵浪，现在又安静了。",
            ]
        else:
            zh = EMOTION_ZH.get(dominant, "心事")
            pool = [
                f"岛屿记得你上次带来的{zh}，今天换了一面海风。",
                "潮水来过又退了，海面留下一道浅浅的光。",
            ]
        # 避开最近 5 句
        avoid = set(avoid_phrases or [])
        candidates = [p for p in pool if p not in avoid] or pool
        return _pick_variant(candidates, dominant + trend + artifact_label)

    def generate_letter(
        self,
        memories: List[Dict[str, Any]],
        artifacts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """模板年报：用统计 + 主导情绪 + 物件拼一封温柔短信。约 180-220 字。"""
        if not memories:
            return {"letter": "", "observed_pattern": "", "mentioned_artifacts": []}
        # 简单统计
        from collections import Counter
        emo_counts = Counter(m.get("emotion", "calm") for m in memories)
        dominant_emo, dominant_n = emo_counts.most_common(1)[0]
        dom_zh = EMOTION_ZH.get(dominant_emo, "心事")
        total = len(memories)
        # 物件
        art_labels = [a.get("label", "") for a in (artifacts or []) if a.get("label")]
        mention = art_labels[:2]
        art_text = ""
        if len(mention) == 2:
            art_text = f"你为自己留下过{mention[0]}，也留下过{mention[1]}——岛屿一直替你守着。"
        elif len(mention) == 1:
            art_text = f"你留下过{mention[0]}，岛屿替你看了很多次。"
        pattern_text = (
            f"这{total}次来岛屿，你常常带着{dom_zh}——出现了{dominant_n}次。"
            "你或许还没注意到这件事，但你每次都来了。"
        )
        letter = (
            "你回来啦。\n\n"
            f"{pattern_text}{art_text}\n\n"
            "岛屿没什么可教你，但它学会了一件事——"
            "你不必每次都好起来才来；只要你愿意把心情留下，海面就会替你抚平一些褶皱。\n\n"
            "明天的海还在原地，不催你。"
        )
        return {
            "letter": letter,
            "observed_pattern": pattern_text,
            "mentioned_artifacts": mention,
        }

    def read_glyph(self, char: str, dynamics: Dict[str, Any], prior_emotion: str) -> Dict[str, Any]:
        """Mock 手写读心：用字的情绪先验 + 书写动力学规则给一个读心。"""
        jitter = float(dynamics.get("jitter", 0) or 0)
        speed = float(dynamics.get("avg_speed", 0) or 0)  # px/s
        pauses = int(dynamics.get("pause_count", 0) or 0)
        emotion = prior_emotion if prior_emotion in EMOTION_ZH else "calm"
        intensity = 0.55
        if jitter > 0.45:
            intensity += 0.2
        if pauses >= 2:
            intensity += 0.08
        if speed and speed < 60:
            intensity += 0.06  # 写得很慢，往往更沉
        intensity = round(_clamp(intensity, 0.4, 0.95), 2)
        # 读心模板按动力学微调
        if jitter > 0.45:
            reading = f"你写「{char}」时手有点抖，这个字是从很深的地方写出来的。"
        elif speed and speed < 60:
            reading = f"你把「{char}」写得很慢，像是不舍得太快放下它。"
        else:
            reading = f"你写下「{char}」，岛屿把这个字稳稳收在了石上。"
        return {"emotion": emotion, "intensity": intensity, "reading": reading}

    def generate_revision(self, target_memory: Dict[str, Any], lenient: bool = False) -> Dict[str, Any]:
        """Mock 修正：按情绪+强度规则判定，给一段温柔的"再说一句"。
        默认保守只在明显失配时触发；lenient=True 时即使条件不达也给一条演示用文案。"""
        if not target_memory or not target_memory.get("narrative"):
            return {"needed": False, "kind": "", "revision": ""}
        emo = target_memory.get("emotion", "calm")
        intensity = float(target_memory.get("intensity", 0.5))
        narrative_len = len(target_memory.get("narrative") or "")
        # 简单启发：高强度但只给了较短叙事 → 可能"说浅了"
        if intensity >= 0.7 and narrative_len < 70:
            return {
                "needed": True,
                "kind": "too_light",
                "revision": (
                    "昨晚那句我说得有点轻了——你那时的累其实是骨头里的累，不是一句『先休息』能接住的。"
                    "今天我重新想：你能撑到现在已经不容易，岛屿还在原地，慢慢来就好。"
                ),
            }
        if intensity <= 0.5 and emo in ("happy", "calm") and narrative_len > 110:
            return {
                "needed": True,
                "kind": "too_heavy",
                "revision": (
                    "昨天那段话写得有点重了。其实你那时只是有一点点平静的开心，"
                    "不需要被我借机说一长串道理。今天的修正：那一刻的安静本身，就已经是答案了。"
                ),
            }
        if lenient:
            # 演示模式下给一条万能版的修正
            return {
                "needed": True,
                "kind": "too_light",
                "revision": (
                    "昨晚那句我说得有些不到位——你说的不只是『累』，是连说『累』的力气都没了。"
                    "今天我想换一句：你已经撑到这里，这本身就值得被看见，慢慢来，岛屿不催你。"
                ),
            }
        return {"needed": False, "kind": "", "revision": ""}

    def generate_companion_reply(
        self,
        message: str,
        companion: Dict[str, Any],
        emotion: str,
        recent_memories: List[Dict[str, Any]],
        island_state: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Mock 精灵聊天：不用 Key 也能保持入戏陪伴。"""
        name = str(companion.get("name") or "微光")[:8]
        emo = emotion if emotion in EMOTION_ZH else self.analyze_emotion(message, recent_memories).get("emotion", "calm")
        affinity = int(companion.get("affinity") or 0)
        trend = str((island_state or {}).get("trend") or "stable")
        if emo in {"sad", "anxious", "lonely", "helpless"}:
            if affinity >= 60:
                reply = f"{name}靠近你的肩侧，灯塔光压得很柔：我听见了。今晚先别急着解释自己，我陪你把这阵潮声慢慢听完。"
            else:
                reply = f"{name}轻轻停在你身边，尾鳍慢慢摆着：我在这里。你不用马上变好，先让灯塔替你照住这一小步。"
            animation = "TalkListen"
        elif emo == "angry":
            reply = f"{name}把小灯塔转向海面：这阵风有它的来处。你可以先站稳，我陪你等浪声小一点。"
            animation = "Worried"
        elif emo == "happy":
            reply = f"{name}开心地绕了一圈，灯塔亮出一颗小星：这份明亮我替你收进贝壳里，等夜晚也能听见。"
            animation = "Joyful"
        elif emo == "tired":
            reply = f"{name}把光调得低低的：累的时候不用撑出很亮的样子。你停一会儿，我守着这片岸。"
            animation = "TalkListen"
        else:
            extra = "，今晚的海会更安静一点" if trend == "stormy" else ""
            reply = f"{name}的灯塔像呼吸一样亮了一下：我在{extra}。你说的话，我会放进岛屿最柔软的光里。"
            animation = "BondGlow"
        return {"reply": reply[:120], "emotion": emo, "animation": animation}


class OpenAIProvider(LLMProvider):
    """OpenAI 兼容接口。失败时降级到 Mock，保证演示不中断。"""

    def __init__(self) -> None:
        self._mock = MockProvider()
        self._client = httpx.Client(timeout=config.LLM_TIMEOUT)

    def _chat_json(self, system: str, user: str, timeout: Optional[float] = None) -> Dict[str, Any]:
        payload = {
            "model": config.OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.8,
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {config.OPENAI_API_KEY}"}
        url = config.OPENAI_BASE_URL.rstrip("/") + "/chat/completions"
        # httpx 中显式 timeout=None 表示「永不超时」，因此 None 时不传、走客户端默认（LLM_TIMEOUT）；
        # 锦上添花型调用传入更短的超时以便网络抖动时快速降级。
        extra = {"timeout": timeout} if timeout is not None else {}
        resp = self._client.post(url, json=payload, headers=headers, **extra)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def analyze_emotion(self, text: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        allowed = ", ".join(EMOTION_ZH.keys())
        system = (
            "你是《心屿》的情感分析助手。分析用户当下的情绪，只输出 JSON："
            '{"emotion": "八种情绪之一", "intensity": "0到1的浮点数", "summary": "不超过12字的中文情绪概括"}。'
            "emotion 必须是下列之一：" + allowed + "。不输出任何额外文字，不做医疗诊断。"
        )
        try:
            data = self._chat_json(system, text)
            emo = str(data.get("emotion", "calm")).lower()
            if emo not in EMOTION_ZH:
                emo = "calm"
            intensity = _clamp(float(data.get("intensity", 0.5)))
            summary = str(data.get("summary") or "用户情绪波动")[:40]
            return {"emotion": emo, "intensity": round(intensity, 2), "summary": summary}
        except Exception as e:  # 降级
            logger.warning("OpenAI 情绪分析失败，降级到 Mock: %s", e)
            return self._mock.analyze_emotion(text, history)

    def generate_narrative(
        self, emotion: str, intensity: float, summary: str, imagery: List[str], history: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        hist_text = ""
        if history:
            lines = [f"- {h.get('summary', '')}({h.get('emotion', '')}, 强度{h.get('intensity', '')})" for h in history[:3]]
            hist_text = "用户最近的情绪记录：\n" + "\n".join(lines) + "\n请在叙事中自然地回应这种连续感。"
        system = (
            "你是《心屿》的治愈叙事写手。风格温柔、克制、有画面感，50-120 字中文。"
            "只表达陪伴、倾听与支持，绝不做医疗诊断或承诺治疗效果。"
            "同时生成一句 20-60 字中文心灵印记，像短诗或语录，温柔克制，不要鸡汤口号。"
            '只输出 JSON：{"narrative": "叙事文本", "imprint": "20-60字心灵印记", "memory_hint": "基于历史的一句话回访感，无历史则为 null"}。'
            "不输出额外文字。"
        )
        user = f"情绪：{emotion}（强度 {intensity}）\n概括：{summary}\n意象：{', '.join(imagery)}\n{hist_text}"
        try:
            data = self._chat_json(system, user)
            narrative = str(data.get("narrative", "")).strip()
            if not narrative:
                raise ValueError("empty narrative")
            imprint = _normalize_imprint(data.get("imprint"))
            if not imprint:
                imprint = self._mock.generate_narrative(emotion, intensity, summary, imagery, history)["imprint"]
            memory_hint = data.get("memory_hint")
            if isinstance(memory_hint, str) and memory_hint.strip().lower() in ("", "null", "none"):
                memory_hint = None
            return {"narrative": narrative, "imprint": imprint, "memory_hint": memory_hint}
        except Exception as e:  # 降级
            logger.warning("OpenAI 叙事生成失败，降级到 Mock: %s", e)
            return self._mock.generate_narrative(emotion, intensity, summary, imagery, history)

    def generate_whisper(
        self,
        recent_memories: List[Dict[str, Any]],
        island_state: Dict[str, Any],
        latest_artifact: Optional[Dict[str, Any]],
        avoid_phrases: List[str],
    ) -> str:
        if not recent_memories:
            return ""
        # 用户上下文紧凑化，避免把全部历史塞进 prompt
        lines = []
        for m in recent_memories[:5]:
            lines.append(f"- {EMOTION_ZH.get(m.get('emotion',''),'')}/{m.get('intensity','')}：{(m.get('summary') or m.get('text',''))[:30]}")
        artifact_str = ""
        if latest_artifact and latest_artifact.get("label"):
            artifact_str = f"上次留下的物件：{latest_artifact['label']}。"
        avoid_str = ""
        if avoid_phrases:
            avoid_str = "下面这些话最近已经说过，请避免和它们雷同：\n" + "\n".join(f"- {p}" for p in avoid_phrases[:5])
        system = (
            "你是《心屿》里那座会回应人的岛屿本身。基于这位旅人最近的记忆与岛屿当前状态，"
            "对刚刚回到岛屿、还没说话的他/她说一句温柔的话。"
            "硬约束："
            "(1) 15-30 个汉字；"
            "(2) 第二人称，不向用户提问，不使用问号；"
            "(3) 通过具体的岛屿元素（物件/天气/时间/海面）传递『被看见』的感觉，不要直接说『我一直记得你』之类带监视感的话；"
            "(4) 绝不诊断、绝不给建议、绝不出现医疗词；"
            '(5) 只输出 JSON：{"whisper": "你说的那句话"}，不输出任何额外文本。'
        )
        state_str = ""
        if island_state:
            state_str = (
                f"岛屿当前：成长 {island_state.get('growth_level','')} 级，"
                f"趋势 {island_state.get('trend','')}，"
                f"主导情绪 {EMOTION_ZH.get(island_state.get('dominant_emotion',''),'')}。"
            )
        user = f"{state_str}\n{artifact_str}\n最近的记忆：\n" + "\n".join(lines) + f"\n\n{avoid_str}"
        try:
            data = self._chat_json(system, user, timeout=config.LLM_FAST_TIMEOUT)
            whisper = str(data.get("whisper", "")).strip()
            # 长度兜底，过长截到 30 字
            if len(whisper) > 36:
                whisper = whisper[:30]
            if len(whisper) < 8:
                raise ValueError("whisper too short")
            return whisper
        except Exception as e:
            logger.warning("OpenAI 岛屿低语失败，降级到 Mock: %s", e)
            return self._mock.generate_whisper(recent_memories, island_state, latest_artifact, avoid_phrases)

    def generate_letter(
        self,
        memories: List[Dict[str, Any]],
        artifacts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if not memories:
            return {"letter": "", "observed_pattern": "", "mentioned_artifacts": []}
        # 拉最近 30 条进 prompt，避免 token 爆掉
        sample = memories[:30]
        lines = []
        for m in sample:
            lines.append(
                f"- {m.get('created_at','')[:10]} {EMOTION_ZH.get(m.get('emotion',''),'')}（强度 {m.get('intensity','')}）："
                f"{(m.get('summary') or m.get('text',''))[:40]}"
            )
        art_lines = [f"- {a.get('label','')}" for a in (artifacts or [])[:8] if a.get("label")]
        has_art = bool(art_lines)
        art_rule = (
            "(2.b) 自然地提到 1-2 件 TA 留下的物件，但**只能从下面物件列表里挑**，绝不要凭空虚构任何物件名（如贝壳、帆布包、信件、海螺等都不行，除非它真的出现在列表里）；"
            if has_art
            else "(2.b) TA 还没有在岛上留下任何物件——这种情况下绝不要在信里提到任何具体物件名（贝壳/帆布包/信件/海螺等一律不行），只关注情绪规律即可；mentioned_artifacts 字段返回空数组 []；"
        )
        system = (
            "你是《心屿》里那座一直在陪着旅人的岛屿。"
            "请基于这位旅人留下的全部印记，给 TA 写一封 180-220 字的中文短信。"
            "硬约束：(1) 第二人称，温柔克制，不鸡汤、不诊断、不建议就医、不催 TA 好起来；"
            "(2.a) 指出一个 TA 可能没意识到的情绪规律（例：常在某种心情下来岛屿、某个动作反复出现）；"
            + art_rule
            + "(2.c) 用不带说教意味的一句话作结尾；"
            "(3) 不出现医疗词、诊断、症状名；"
            '(4) 只输出 JSON：{"letter": "短信全文", "observed_pattern": "你观察到的那个规律，一句话", "mentioned_artifacts": ["实际点名的物件 label，未列出物件则返回空数组"]}，不输出额外文本。'
        )
        user = (
            "这位旅人最近留下的记忆（按时间倒序，最近在前）：\n"
            + "\n".join(lines)
            + ("\n\nTA 在岛上留下的物件：\n" + "\n".join(art_lines) if has_art else "\n\nTA 还没在岛上留下任何物件。")
        )
        try:
            data = self._chat_json(system, user)
            letter = str(data.get("letter", "")).strip()
            if len(letter) < 60:
                raise ValueError("letter too short")
            pattern = str(data.get("observed_pattern", "")).strip()
            mentioned = data.get("mentioned_artifacts", [])
            if not isinstance(mentioned, list):
                mentioned = []
            return {"letter": letter, "observed_pattern": pattern, "mentioned_artifacts": mentioned[:3]}
        except Exception as e:
            logger.warning("OpenAI 岛屿年报失败，降级到 Mock: %s", e)
            return self._mock.generate_letter(memories, artifacts)

    def generate_revision(self, target_memory: Dict[str, Any], lenient: bool = False) -> Dict[str, Any]:
        if not target_memory or not target_memory.get("narrative"):
            return {"needed": False, "kind": "", "revision": ""}
        emo_zh = EMOTION_ZH.get(target_memory.get("emotion", ""), "")
        intensity = target_memory.get("intensity", "")
        original_text = (target_memory.get("text") or "")[:120]
        original_narrative = (target_memory.get("narrative") or "")[:300]
        if lenient:
            # 演示/路演模式：允许 LLM 主动找一处可以更贴的细节做修正，避免每次都返回 false 看不出效果
            judgement_rule = (
                "(1) 这是回看模式：请仔细读那段话，**主动找一处可以说得更贴的地方**——"
                "    可能是某个词用得偏重/偏轻、某种感受没接到、或者节奏太快没给那位旅人时间。"
                "    设 needed=true 并给出修正。仅当那段话已经几乎完美时才返回 needed=false；"
            )
        else:
            judgement_rule = (
                "(1) 大多数情况下你不需要修正——绝大多数温柔的话即便不完美也不应被自责改写，"
                "    所以默认 needed=false；只有它**明显说重了/明显说浅了/明显跑题**时才 needed=true，避免讨好型自责；"
            )
        system = (
            "你是《心屿》里的岛屿。下面给你看你之前对一位旅人说过的一段话——"
            "现在请你以「今天的自己」回看它。"
            "硬约束："
            + judgement_rule +
            "(2) 如果需要修正：写 60-100 字第二人称中文，先承认\"那时我说得不太对\"（不要鸡汤、不要道歉过度），"
            "    然后用更贴的语言重新说一遍。kind ∈ {too_heavy, too_light, off_topic}；"
            "(3) 绝不诊断、不医疗建议、不出现\"症状/治疗/服药\"等词；"
            '(4) 只输出 JSON：{"needed": bool, "kind": "too_heavy|too_light|off_topic|", "revision": "修正文本，needed=false 时为空字符串"}。'
        )
        user = (
            f"那位旅人当时说：{original_text}\n"
            f"你之前对他说的（情绪={emo_zh}，强度={intensity}）：\n{original_narrative}\n\n"
            "请判断：今天的你，对这段话是否真的需要补一句修正？"
        )
        try:
            data = self._chat_json(system, user, timeout=config.LLM_FAST_TIMEOUT)
            needed = bool(data.get("needed"))
            kind = str(data.get("kind", "") or "")
            revision = str(data.get("revision", "") or "").strip()
            if needed and len(revision) < 30:
                # 不达字数兜底不算
                needed = False
                revision = ""
            return {"needed": needed, "kind": kind, "revision": revision}
        except Exception as e:
            logger.warning("OpenAI 岛屿修正失败，降级到 Mock: %s", e)
            return self._mock.generate_revision(target_memory, lenient=lenient)

    def read_glyph(self, char: str, dynamics: Dict[str, Any], prior_emotion: str) -> Dict[str, Any]:
        allowed = ", ".join(EMOTION_ZH.keys())
        # 把动力学翻译成人话喂给纯文本模型——无需多模态，字本身已知
        jitter = float(dynamics.get("jitter", 0) or 0)
        speed = float(dynamics.get("avg_speed", 0) or 0)
        pauses = int(dynamics.get("pause_count", 0) or 0)
        dyn_desc_parts = []
        dyn_desc_parts.append("写得很慢" if (speed and speed < 60) else ("写得很快" if speed > 220 else "写得不快不慢"))
        if jitter > 0.45:
            dyn_desc_parts.append("笔迹明显在抖")
        elif jitter > 0.25:
            dyn_desc_parts.append("笔迹有一点抖")
        if pauses >= 2:
            dyn_desc_parts.append(f"中途停顿了 {pauses} 次")
        dyn_desc = "，".join(dyn_desc_parts)
        system = (
            "你是《心屿》的岛屿。一位旅人没有用文字倾诉，而是手写了一个汉字来表达此刻的心境。"
            "这个字是确定的（不用你识别），同时附上他书写时的动作特征。"
            "请结合『这个字的含义』与『他书写的样子』，读出他此刻的情绪。"
            "硬约束：(1) emotion 必须是下列之一：" + allowed + "；"
            "(2) intensity 是 0-1 浮点；(3) reading 是一句 15-24 字的中文，温柔地读懂他写这个字时的心情，"
            "不提身体症状、不诊断、不给建议、不用问号；"
            '(4) 只输出 JSON：{"emotion":"...","intensity":0.x,"reading":"..."}。'
        )
        user = f"他手写的字：「{char}」\n书写的样子：{dyn_desc or '平稳地写下'}\n字的情绪倾向参考：{EMOTION_ZH.get(prior_emotion, '平静')}"
        try:
            data = self._chat_json(system, user, timeout=config.LLM_FAST_TIMEOUT)
            emo = str(data.get("emotion", prior_emotion)).lower()
            if emo not in EMOTION_ZH:
                emo = prior_emotion if prior_emotion in EMOTION_ZH else "calm"
            intensity = _clamp(float(data.get("intensity", 0.55)))
            reading = str(data.get("reading", "") or "").strip()
            if len(reading) < 6:
                raise ValueError("reading too short")
            if len(reading) > 40:
                reading = reading[:40]
            return {"emotion": emo, "intensity": round(intensity, 2), "reading": reading}
        except Exception as e:
            logger.warning("OpenAI 手写读心失败，降级到 Mock: %s", e)
            return self._mock.read_glyph(char, dynamics, prior_emotion)

    def generate_companion_reply(
        self,
        message: str,
        companion: Dict[str, Any],
        emotion: str,
        recent_memories: List[Dict[str, Any]],
        island_state: Dict[str, Any],
    ) -> Dict[str, Any]:
        name = str(companion.get("name") or "微光")[:8]
        memory_lines = []
        for item in recent_memories[:4]:
            memory_lines.append(
                f"- {EMOTION_ZH.get(item.get('emotion',''), item.get('emotion',''))}/"
                f"{item.get('intensity','')}：{(item.get('summary') or item.get('text') or '')[:36]}"
            )
        state_line = ""
        if island_state:
            state_line = (
                f"岛屿状态：成长 {island_state.get('growth_level','')} 级，"
                f"趋势 {island_state.get('trend','')}，"
                f"天气记忆 {island_state.get('weather_memory','')}。"
            )
        user = (
            f"精灵名字：{name}\n"
            f"亲密度：{companion.get('affinity', 0)}/100；投喂 {companion.get('feed_count', 0)} 次；"
            f"对话 {companion.get('talk_count', 0)} 次；已解锁彩蛋：{', '.join(companion.get('unlocked_secrets') or []) or '无'}。\n"
            f"玩家当前情绪参考：{emotion}\n{state_line}\n"
            f"最近记忆摘要：\n{chr(10).join(memory_lines) if memory_lines else '暂无'}\n\n"
            f"玩家刚刚对{name}说：{message}"
        )
        try:
            data = self._chat_json(COMPANION_SYSTEM_PROMPT.replace("「微光」", f"「{name}」"), user, timeout=config.LLM_FAST_TIMEOUT)
            reply = str(data.get("reply", "") or "").strip()
            if not reply:
                raise ValueError("empty companion reply")
            emo = str(data.get("emotion", emotion) or emotion).lower()
            if emo not in EMOTION_ZH:
                emo = emotion if emotion in EMOTION_ZH else "calm"
            animation = str(data.get("animation", "BondGlow") or "BondGlow")
            if animation not in COMPANION_ALLOWED_ANIMATIONS:
                animation = "TalkListen" if emo in {"sad", "anxious", "lonely", "helpless"} else "BondGlow"
            return {"reply": reply[:120], "emotion": emo, "animation": animation}
        except Exception as e:
            logger.warning("OpenAI 专属精灵对话失败，降级到 Mock: %s", e)
            return self._mock.generate_companion_reply(message, companion, emotion, recent_memories, island_state)


def get_provider() -> LLMProvider:
    """根据配置返回 Provider。openai 且配置了 Key 时用真实模型，否则 Mock。"""
    if config.LLM_PROVIDER == "openai" and config.OPENAI_API_KEY:
        logger.info("使用 OpenAI 兼容 Provider: model=%s", config.OPENAI_MODEL)
        return OpenAIProvider()
    logger.info("使用 Mock Provider（离线模式）")
    return MockProvider()
