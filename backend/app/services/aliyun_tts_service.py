"""阿里云 CosyVoice 语音合成（DashScope 非实时 HTTP API）——与腾讯云并存的第二个 TTS provider。

设计原则（与 tts_service.py 对齐）：
- 可选增强：未配置 DASHSCOPE_API_KEY 或调用失败时返回 None，由前端无缝降级到浏览器原生合成。
- 同样的契约：synthesize(text, emotion, voice) -> Optional[bytes]，voice 为字符串音色 id（如 "longanrou"）。
- 用 httpx 同步调用 DashScope 非实时语音合成接口，取 output.audio(base64) 解码成 mp3 bytes。

接入参考：阿里云「语音合成（CosyVoice）」非实时 HTTP API。
- 端点: POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer
- 鉴权: Authorization: Bearer <api_key>
- Body: {"model": "cosyvoice-v2", "input": {"text": ...}, "parameters": {"voice": ..., "format": "mp3", "sample_rate": 16000}}
- 仅中国内地（北京）部署可用。
"""

import base64
import logging
from typing import Optional

import httpx

from app import config

logger = logging.getLogger("xinyu.aliyun_tts")

_HOST = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"
_MODEL = "cosyvoice-v2"  # 音色丰富、稳定；社交陪伴/有声书/语音助手/童声均有

# 精选音色：从 cosyvoice-v2 系统音色里挑贴合「小精灵陪伴」调性的一批。
# 每款含 id(voice 参数取值) / label / desc / gender；default=True 的在用户未选时使用。
# 精灵向（灵动 / 轻盈 / 俏皮的童声）排在最前并设为默认——成熟客服女声平读太「人机」，
# 童声音色本身就带起伏，更像一个会陪你说话的小精灵；温柔成熟向保留在后供切换。
# 下面这批均已实测在 cosyvoice-v2 + 当前 key 下可用。
ALIYUN_TTS_VOICES = [
    # —— 精灵向：灵动轻盈俏皮，最贴「小精灵」 ——
    {"id": "longke_v2", "label": "龙可", "desc": "软糯乖巧·治愈", "gender": "female", "default": True},
    {"id": "longpaopao", "label": "龙泡泡", "desc": "气泡音·轻灵小精灵", "gender": "female"},
    {"id": "longxian_v2", "label": "龙仙", "desc": "灵气可爱·元气", "gender": "female"},
    {"id": "longling_v2", "label": "龙玲", "desc": "孩子气·淡淡冷面萌", "gender": "female"},
    {"id": "longjielidou_v2", "label": "龙杰力豆", "desc": "阳光调皮·男孩", "gender": "male"},
    {"id": "longhuhu", "label": "龙虎虎", "desc": "天真活泼女童", "gender": "female"},
    # —— 温柔成熟向：想要沉稳陪伴感时切换 ——
    {"id": "longanrou", "label": "龙安柔", "desc": "温柔闺蜜女", "gender": "female"},
    {"id": "longyuan_v2", "label": "龙媛", "desc": "温暖治愈女", "gender": "female"},
    {"id": "longxing_v2", "label": "龙星", "desc": "温婉邻家女", "gender": "female"},
    {"id": "longwanjun", "label": "龙婉君", "desc": "细腻柔声女", "gender": "female"},
    {"id": "longfeifei_v2", "label": "龙菲菲", "desc": "甜美娇气女", "gender": "female"},
    {"id": "longxiaocheng_v2", "label": "龙小诚", "desc": "磁性低音男", "gender": "male"},
    {"id": "longzhe_v2", "label": "龙哲", "desc": "大暖男", "gender": "male"},
]

# 情绪 → 韵律（语速 rate / 音高 pitch）。cosyvoice-v2 非 Instruct 音色也支持这两个参数，
# 用它给「平读」加一层情绪起伏：疲惫难过更慢更低、愉悦更快更扬，安抚类（焦虑/愤怒）平稳偏慢。
# 取值范围约 [0.5, 2.0]，1.0 为常态；童声音高本就偏高，pitch 整体克制以免发尖。
_EMOTION_PROSODY = {
    "tired": (0.85, 0.96),
    "sad": (0.86, 0.96),
    "lonely": (0.90, 0.98),
    "helpless": (0.85, 0.95),
    "anxious": (0.92, 1.00),
    "calm": (0.96, 1.00),
    "happy": (1.08, 1.05),
    "angry": (0.92, 0.99),
}
_DEFAULT_PROSODY = (0.96, 1.0)


def aliyun_voice_options() -> list:
    """返回可选音色清单（深拷贝，避免外部误改模块常量）。"""
    return [dict(v) for v in ALIYUN_TTS_VOICES]


def default_aliyun_voice() -> str:
    """返回默认音色 id（标记 default 的那个，回落到第一个）。"""
    for v in ALIYUN_TTS_VOICES:
        if v.get("default"):
            return str(v["id"])
    return str(ALIYUN_TTS_VOICES[0]["id"])


class AliyunTTSService:
    """阿里云 CosyVoice 封装。configured() 为假时整体降级（前端走浏览器原生）。"""

    def __init__(self) -> None:
        self._client = httpx.Client(timeout=config.TENCENT_TTS_TIMEOUT)

    def configured(self) -> bool:
        return bool(config.DASHSCOPE_API_KEY)

    def synthesize(self, text: str, emotion: str = "calm", voice: Optional[str] = None) -> Optional[bytes]:
        """合成音频字节（mp3）。未配置或任何失败均返回 None，交由前端降级。

        voice: cosyvoice-v2 系统音色 id（字符串，如 "longpaopao"）；为 None 用默认音色。
        emotion: 映射到语速/音高（见 _EMOTION_PROSODY），让朗读随情绪起伏、少些「人机」平读感。
        """
        if not self.configured() or not (text or "").strip():
            return None
        try:
            return self._call(text.strip()[:500], emotion, voice)
        except Exception as e:  # 任何异常都降级，绝不影响主体验
            logger.warning("阿里云 CosyVoice 调用失败，降级浏览器原生: %s", e)
            return None

    def _call(self, text: str, emotion: str, voice: Optional[str]) -> Optional[bytes]:
        api_key = config.DASHSCOPE_API_KEY
        voice_id = voice if voice else default_aliyun_voice()
        rate, pitch = _EMOTION_PROSODY.get(emotion, _DEFAULT_PROSODY)
        payload = {
            "model": _MODEL,
            "input": {"text": text},
            "parameters": {
                "voice": voice_id,
                "format": "mp3",
                "sample_rate": 16000,
                "rate": rate,
                "pitch": pitch,
            },
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        resp = self._client.post(_HOST, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        # 失败时 DashScope 返回 code/message 而非 output.audio
        if data.get("code"):
            logger.warning("阿里云 CosyVoice 返回错误: %s %s", data.get("code"), data.get("message"))
            return None
        audio = (data.get("output") or {}).get("audio")
        if not audio:
            return None
        # DashScope 多模态返回格式：audio 是 {data, url, id, expires_at}。
        # data 为内联 base64（非空时直接用）；为空则落到临时 url 下载二进制。
        if isinstance(audio, dict):
            audio_b64 = (audio.get("data") or "").strip()
            if audio_b64:
                return base64.b64decode(audio_b64)
            url = (audio.get("url") or "").strip()
            if not url:
                return None
            dl = self._client.get(url)
            dl.raise_for_status()
            return dl.content
        if isinstance(audio, str) and audio.strip():
            return base64.b64decode(audio.strip())
        return None
