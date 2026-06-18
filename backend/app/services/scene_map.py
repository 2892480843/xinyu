"""情绪 -> 岛屿场景映射。纯数据，无外部依赖。"""

from typing import Dict, List


def _scene(time: str, weather: str, palette: str, music: str, imagery: List[str]) -> Dict:
    return {
        "time": time,
        "weather": weather,
        "palette": palette,
        "music": music,
        "imagery": imagery,
    }


# 8 种情绪 x 3 个强度档 = 24 个本地预设场景。
# palette 为前端可识别的场景键；接口字段保持 time/weather/palette/music/imagery 不变。
SCENE_VARIANTS: Dict[str, Dict[str, Dict]] = {
    "sad": {
        "low": _scene("dusk", "light_rain", "sad_low", "soft_piano", ["drizzle", "soft_waves", "lighthouse"]),
        "mid": _scene("dusk", "light_rain", "sad_mid", "soft_piano", ["rain", "waves", "lighthouse"]),
        "high": _scene("night", "rain", "sad_high", "soft_piano", ["rain", "dark_waves", "distant_light"]),
    },
    "anxious": {
        "low": _scene("day", "fog", "anxious_low", "ambient_drone", ["haze", "rocks", "slow_breath"]),
        "mid": _scene("day", "fog", "anxious_mid", "ambient_drone", ["fog", "rocks", "distant_ship"]),
        "high": _scene("dusk", "storm", "anxious_high", "ambient_drone", ["dense_fog", "low_clouds", "pressure"]),
    },
    "tired": {
        "low": _scene("dusk", "clear", "tired_low", "soft_piano", ["evening", "hammock", "quiet_shore"]),
        "mid": _scene("night", "clear", "tired_mid", "soft_piano", ["stars", "hammock", "fireflies"]),
        "high": _scene("night", "fog", "tired_high", "soft_piano", ["stars", "hush", "deep_rest"]),
    },
    "lonely": {
        "low": _scene("dawn", "fog", "lonely_low", "ambient_drone", ["mist", "single_tree", "quiet_shore"]),
        "mid": _scene("dawn", "fog", "lonely_mid", "ambient_drone", ["mist", "single_tree", "quiet_shore"]),
        "high": _scene("night", "clear", "lonely_high", "ambient_drone", ["moon", "single_tree", "empty_shore"]),
    },
    "calm": {
        "low": _scene("dawn", "clear", "calm_low", "lofi", ["gentle_waves", "soft_sun", "sailboat"]),
        "mid": _scene("day", "clear", "calm_mid", "lofi", ["gentle_waves", "sun", "sailboat"]),
        "high": _scene("dusk", "clear", "calm_high", "lofi", ["glass_tide", "reflection", "sailboat"]),
    },
    "happy": {
        "low": _scene("day", "clear", "happy_low", "bright_acoustic", ["morning_light", "flowers", "warm_breeze"]),
        "mid": _scene("day", "clear", "happy_mid", "bright_acoustic", ["sunshine", "flowers", "butterflies"]),
        "high": _scene("dusk", "clear", "happy_high", "bright_acoustic", ["sunburst", "flowers", "butterflies"]),
    },
    "angry": {
        "low": _scene("dusk", "light_rain", "angry_low", "low_strings", ["wind", "cliffs", "restless_waves"]),
        "mid": _scene("dusk", "storm", "angry_mid", "low_strings", ["storm_clouds", "crashing_waves", "cliffs"]),
        "high": _scene("night", "storm", "angry_high", "low_strings", ["lightning", "black_waves", "cliffs"]),
    },
    "helpless": {
        "low": _scene("dusk", "light_rain", "helpless_low", "soft_piano", ["dim_rain", "shore", "faint_light"]),
        "mid": _scene("night", "rain", "helpless_mid", "soft_piano", ["rain", "still_water", "faint_light"]),
        "high": _scene("night", "rain", "helpless_high", "soft_piano", ["heavy_rain", "still_water", "faint_light"]),
    },
}

DEFAULT_SCENE = SCENE_VARIANTS["calm"]["mid"]


def _intensity_band(intensity: float) -> str:
    if intensity < 0.58:
        return "low"
    if intensity < 0.78:
        return "mid"
    return "high"


def get_scene(emotion: str, intensity: float = 0.5) -> Dict:
    """根据情绪与强度返回场景配置。未命中时回退到 calm。"""
    variants = SCENE_VARIANTS.get(emotion)
    if not variants:
        scene = dict(DEFAULT_SCENE)
    else:
        scene = dict(variants[_intensity_band(intensity)])
    return {
        "time": scene["time"],
        "weather": scene["weather"],
        "palette": scene["palette"],
        "music": scene["music"],
        "imagery": list(scene["imagery"]),
    }


def list_emotions() -> List[str]:
    return list(SCENE_VARIANTS.keys())
