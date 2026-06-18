"""岛屿仪式系统：把"玩家能动性"加进《心屿》。

每次倾诉后，系统按情绪给出 2-3 张「岛屿回应」选择卡。每张卡同时承载：
- stance：玩家选择如何面对这份情绪（情绪回应分支）；
- ritual + artifact：对应的岛屿仪式，会在岛上留下一个永久物件（收集）。

玩家的选择会持久塑造这座岛——这是《心屿》从"被动观看"走向"游戏"的关键循环。
内容为本地内容，不依赖 LLM，保证演示稳定。
"""

from typing import Dict, List, Optional

# 物件目录：key -> {icon, label}（icon 与前端 ARTIFACT/FEATURE_META 对齐）
ARTIFACTS: Dict[str, Dict[str, str]] = {
    "lantern": {"icon": "🏮", "label": "暖灯"},
    "paper_boat": {"icon": "🛶", "label": "纸船"},
    "night_flower": {"icon": "🌼", "label": "夜来香"},
    "shell": {"icon": "🐚", "label": "贝壳"},
    "star_wish": {"icon": "⭐", "label": "星愿"},
    "river_lamp": {"icon": "🪔", "label": "河灯"},
    "stone_cairn": {"icon": "🪨", "label": "石堆"},
    "kite": {"icon": "🪁", "label": "风筝"},
    "feather": {"icon": "🪶", "label": "羽毛"},
    "candle": {"icon": "🕯️", "label": "烛火"},
    "sail": {"icon": "⛵", "label": "小帆"},
    "leaf_note": {"icon": "🍃", "label": "叶笺"},
    "bonfire": {"icon": "🔥", "label": "篝火"},
    "bloom": {"icon": "🌸", "label": "花"},
    # 静默坐岛：什么都没说的访问留下的「静默贝壳」——承认"说不出"是合法情绪
    "silent_shell": {"icon": "🌑", "label": "静默贝壳"},
    # 写一个字：手写一个心境字刻成的「心境石」，多块积累成石林
    "glyph_stone": {"icon": "🪨", "label": "心境石"},
}

# 可手写的心境字 → 情绪先验。字是确定的（用户从中选一个描红写，无需 OCR）。
GLYPH_CHARS: Dict[str, str] = {
    "累": "tired",
    "沉": "sad",
    "空": "lonely",
    "撑": "helpless",
    "涌": "anxious",
    "稳": "calm",
    "静": "calm",
    "暖": "happy",
}

# 每种情绪 3 张选择卡
CHOICES: Dict[str, List[Dict[str, str]]] = {
    "sad": [
        {"id": "sad_lamp", "stance": "让难过被看见", "ritual": "在岸边点一盏河灯", "artifact": "river_lamp",
         "reply": "河灯顺着水漂远，岛屿替你收下了这份难过。"},
        {"id": "sad_shell", "stance": "把心事先放下", "ritual": "把心事封进一枚贝壳", "artifact": "shell",
         "reply": "贝壳合上了，里面的潮声只有岛屿听得见。"},
        {"id": "sad_candle", "stance": "给自己一点光", "ritual": "在崖边点一支烛火", "artifact": "candle",
         "reply": "烛火很小，却足够照亮你今晚回家的路。"},
    ],
    "anxious": [
        {"id": "anx_kite", "stance": "把慌乱放出去", "ritual": "放飞一只风筝", "artifact": "kite",
         "reply": "风筝把紧绷的线一点点送上天，手心松开了一些。"},
        {"id": "anx_stone", "stance": "让自己稳下来", "ritual": "在礁石上垒一座石堆", "artifact": "stone_cairn",
         "reply": "石头一块块叠稳，像你慢慢找回的重心。"},
        {"id": "anx_leaf", "stance": "理一理思绪", "ritual": "在叶子上写下一件事", "artifact": "leaf_note",
         "reply": "叶笺放进溪里，杂乱的念头先交给水流带走一程。"},
    ],
    "tired": [
        {"id": "tired_lantern", "stance": "在吊床上歇下", "ritual": "升起一盏暖灯", "artifact": "lantern",
         "reply": "暖灯亮了，今晚岛屿替你守着，你只管休息。"},
        {"id": "tired_boat", "stance": "给明天留句话", "ritual": "放一只纸船", "artifact": "paper_boat",
         "reply": "纸船载着你的话，慢慢漂向明天的岸。"},
        {"id": "tired_flower", "stance": "谢谢今天的自己", "ritual": "种一株夜来香", "artifact": "night_flower",
         "reply": "花在夜里悄悄开了，它记得你今天有多努力。"},
    ],
    "lonely": [
        {"id": "lon_lamp", "stance": "给自己作伴", "ritual": "在窗前留一盏灯", "artifact": "lantern",
         "reply": "灯一直亮着，像有人替你留了门。"},
        {"id": "lon_boat", "stance": "向远方招呼", "ritual": "向海面放一只小帆", "artifact": "sail",
         "reply": "小帆驶向远处，岛屿相信会有人朝你这边走来。"},
        {"id": "lon_star", "stance": "许一个小愿", "ritual": "对着夜空许一个星愿", "artifact": "star_wish",
         "reply": "星愿挂上了天，你不是一个人对着夜晚说话。"},
    ],
    "calm": [
        {"id": "calm_sail", "stance": "享受这份平静", "ritual": "扬起一面小帆", "artifact": "sail",
         "reply": "帆轻轻鼓起，你顺着这份安稳，慢慢往前。"},
        {"id": "calm_shell", "stance": "把平静收好", "ritual": "拾一枚海边的贝壳", "artifact": "shell",
         "reply": "贝壳收进口袋，以后慌乱时还能听见今天的海。"},
        {"id": "calm_flower", "stance": "为此刻留念", "ritual": "在岸边种一朵花", "artifact": "bloom",
         "reply": "花开在你停下的地方，标记这一刻的安心。"},
    ],
    "happy": [
        {"id": "hap_bonfire", "stance": "尽情地开心", "ritual": "在沙滩升起一堆篝火", "artifact": "bonfire",
         "reply": "篝火噼啪地烧着，整座岛都跟着你亮了起来。"},
        {"id": "hap_flower", "stance": "把喜悦收藏", "ritual": "种下一片花", "artifact": "bloom",
         "reply": "花一下子开满了岸，这份开心被岛屿好好收下了。"},
        {"id": "hap_star", "stance": "记住这一刻", "ritual": "把今天折成一颗星", "artifact": "star_wish",
         "reply": "星星挂上夜空，往后暗下来的夜也有它可寻。"},
    ],
    "angry": [
        {"id": "ang_kite", "stance": "把火气放出去", "ritual": "迎着风放飞风筝", "artifact": "kite",
         "reply": "风把怒气一点点带远，线还在你手里，你依然稳稳站着。"},
        {"id": "ang_stone", "stance": "为自己撑出边界", "ritual": "在崖边垒一座石堆", "artifact": "stone_cairn",
         "reply": "石堆立住了，那是你为自己划下的、不必退让的界。"},
        {"id": "ang_bonfire", "stance": "让能量烧一会儿", "ritual": "点一堆篝火", "artifact": "bonfire",
         "reply": "篝火替你烧掉一些委屈，等火小了，海会重新平静。"},
    ],
    "helpless": [
        {"id": "help_candle", "stance": "先停下来歇歇", "ritual": "在避风处点一支烛", "artifact": "candle",
         "reply": "烛火护住一小圈光，先别急着独自穿过黑夜。"},
        {"id": "help_lamp", "stance": "留住一点微光", "ritual": "在岸边点一盏河灯", "artifact": "river_lamp",
         "reply": "河灯浮在静水上，微光会一直陪你到天亮。"},
        {"id": "help_feather", "stance": "把重量放轻", "ritual": "拾一片羽毛系在树上", "artifact": "feather",
         "reply": "羽毛在风里轻轻晃，提醒你：撑不住时，停靠也可以。"},
    ],
}

_DEFAULT = CHOICES["calm"]

# 「破晓限定」稀缺仪式：只在岛屿趋势为 recovering / brightening 时出现，替换掉一张常规卡。
# 让此刻的选择「不可复得」——情绪正在转身的窗口里才种得下这朵光，强化「有意义的选择」。
_DAWN_RITUAL = {
    "id": "dawn_light",
    "stance": "把破晓的光留下",
    "ritual": "种下破晓的第一朵花",
    "artifact": "bloom",
    "reply": "破晓的光里，这朵花只在此刻开得出——岛屿替你把这个转身，记成一个节点。",
    "rare": True,
}
_DAWN_TRENDS = {"recovering", "brightening"}


class IslandRitualService:
    def get_choices(self, emotion: str, trend: str = "stable") -> List[Dict]:
        base = list(CHOICES.get(emotion, _DEFAULT))
        # 趋势向好时，把稀缺的「破晓」仪式放在最前，并让出一张常规卡（保持 3 张、不可复得）
        if trend in _DAWN_TRENDS:
            return [dict(_DAWN_RITUAL)] + base[:2]
        return base

    def resolve(self, choice_id: str) -> Optional[Dict]:
        """返回选择卡内容，并附带其所属情绪（emotion）。"""
        if choice_id == _DAWN_RITUAL["id"]:
            return {**_DAWN_RITUAL, "emotion": "happy"}
        for emotion, cards in CHOICES.items():
            for card in cards:
                if card["id"] == choice_id:
                    return {**card, "emotion": emotion}
        return None

    @staticmethod
    def artifact_label(artifact: str) -> str:
        return ARTIFACTS.get(artifact, {}).get("label", artifact)
