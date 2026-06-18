import os
from typing import List

from dotenv import load_dotenv

load_dotenv()


def _csv_env(name: str, default: str) -> List[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


# mock(无需 Key，关键词驱动) | openai(OpenAI 兼容接口)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "mock").strip().lower()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "30"))
# 锦上添花型调用（岛屿低语 / 手写读心 / 修正信）的短超时：
# 网络抖动时快速降级到模板，避免把界面挂死 30 秒。核心 reflect 仍用 LLM_TIMEOUT。
LLM_FAST_TIMEOUT = float(os.getenv("LLM_FAST_TIMEOUT", "8"))

CORS_ORIGINS = _csv_env("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")

# 腾讯云情感语音合成 TTS（可选）。配置 SecretId/Key 后，「朗读叙事」升级为云端情感音色；
# 未配置或调用失败时，前端自动降级为浏览器原生合成（断网/无密钥也能读）。
TENCENT_TTS_SECRET_ID = os.getenv("TENCENT_TTS_SECRET_ID", "").strip()
TENCENT_TTS_SECRET_KEY = os.getenv("TENCENT_TTS_SECRET_KEY", "").strip()
TENCENT_TTS_REGION = os.getenv("TENCENT_TTS_REGION", "ap-guangzhou").strip()
TENCENT_TTS_VOICE_TYPE = int(os.getenv("TENCENT_TTS_VOICE_TYPE", "101016"))  # 默认温柔女声，可按需替换
TENCENT_TTS_TIMEOUT = float(os.getenv("TENCENT_TTS_TIMEOUT", "8"))

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
MEMORY_DB = os.getenv("MEMORY_DB", os.path.join(DATA_DIR, "memories.db"))
MEMORY_JSON = os.getenv("MEMORY_JSON", os.path.join(DATA_DIR, "memories.json"))

CHROMA_ENABLED = os.getenv("CHROMA_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
CHROMA_DB_DIR = os.getenv("CHROMA_DB_DIR", os.path.join(DATA_DIR, "chroma"))
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "xinyu_emotional_memories").strip()
VECTOR_MEMORY_RESULTS = int(os.getenv("VECTOR_MEMORY_RESULTS", "3"))

# 风险阈值: 这几类负面情绪且强度达到阈值时触发安全提示。
# 把 anxious 也纳入：急性焦虑/惊恐高强度发作同样是高自伤风险情境。
SAFETY_EMOTIONS = {"sad", "angry", "helpless", "anxious"}
SAFETY_INTENSITY_THRESHOLD = 0.85

# 高风险关键词兜底：命中任意一条即触发安全提示，
# 不依赖情绪强度——修复「平静措辞的自伤表达因强度低而漏过」的安全漏洞。
# 中英双语 + 常见委婉/网络黑话，避免单一语言的字面词漏报。
SAFETY_KEYWORDS = [
    # —— 中文字面 ——
    "不想活", "不想活了", "活不下去", "活着没意思", "活着没有意义", "不如死",
    "想死", "去死", "自杀", "结束自己", "结束生命", "结束这一切",
    "伤害自己", "自残", "自伤", "割腕", "跳楼", "轻生",
    "撑不下去", "坚持不下去", "撑不住了", "彻底绝望", "没有希望", "一了百了",
    "想消失", "消失算了", "不想醒来", "解脱",
    "伤害别人", "想报复", "同归于尽",
    # —— 中文委婉 / 网络黑话 ——
    "约死", "不活了", "睡过去不醒", "不想再撑", "不想再坚持",
    "活够了", "活腻了", "走了下线",
    # —— 英文（已 text.lower() 后子串匹配） ——
    "kill myself", "killing myself", "want to die", "wanna die", "wanting to die",
    "end my life", "end it all", "ending it all", "end it",
    "suicide", "suicidal", "self harm", "self-harm", "hurt myself", "harm myself",
    "no reason to live", "no point in living", "can't go on", "cant go on",
    "give up on life", "take my own life",
]
