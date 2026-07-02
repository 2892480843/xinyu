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
# 工具型 agent 单次反思的最大工具循环步数（防止无限调用工具）。
AGENT_MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "6"))
# agent 工具循环的总时长预算（秒）：超过则强制结构化收尾，避免慢/卡的模型把多步循环
# 跑满（最坏 AGENT_MAX_STEPS × LLM_TIMEOUT）从而长时间占用同步线程池、拖垮其它请求。
AGENT_TIME_BUDGET = float(os.getenv("AGENT_TIME_BUDGET", "45"))

# —— 对话陪伴 agent 通道（说给岛屿 / 常驻助手 / 陪伴精灵）——
# 与反思主链路的 OPENAI_*（可指向腾讯混元）分开：对话走 DeepSeek function-calling。
# DEEPSEEK_API_KEY 留空时自动回落到 OPENAI_*，保证只配一个 key 也能聊天。
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").strip()
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip()
# 对话通道的有效配置：配了 DeepSeek 就用 DeepSeek，否则回落到反思用的 OPENAI_*。
CHAT_API_KEY = DEEPSEEK_API_KEY or OPENAI_API_KEY
CHAT_BASE_URL = DEEPSEEK_BASE_URL if DEEPSEEK_API_KEY else OPENAI_BASE_URL
CHAT_MODEL = DEEPSEEK_MODEL if DEEPSEEK_API_KEY else OPENAI_MODEL

_DEFAULT_DEV_CORS_ORIGINS = ",".join(
    f"http://{host}:{port}"
    for port in range(5173, 5186)
    for host in ("127.0.0.1", "localhost")
)
CORS_ORIGINS = _csv_env("CORS_ORIGINS", _DEFAULT_DEV_CORS_ORIGINS)

# —— 观测 / 日志 ——
# LOG_FORMAT=json 输出结构化 JSON 行日志（生产接入集中式日志友好）；默认 console 为人类可读。
# LOG_LEVEL 控制全局日志级别。结构化访问日志（含 request_id/耗时/状态码）始终开启。
LOG_FORMAT = os.getenv("LOG_FORMAT", "console").strip().lower()  # console | json
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").strip().upper()

# 腾讯云情感语音合成 TTS（可选）。配置 SecretId/Key 后，「朗读叙事」升级为云端情感音色；
# 未配置或调用失败时，前端自动降级为浏览器原生合成（断网/无密钥也能读）。
TENCENT_TTS_SECRET_ID = os.getenv("TENCENT_TTS_SECRET_ID", "").strip()
TENCENT_TTS_SECRET_KEY = os.getenv("TENCENT_TTS_SECRET_KEY", "").strip()
TENCENT_TTS_APP_ID = os.getenv("TENCENT_TTS_APP_ID", "").strip()
TENCENT_TTS_REGION = os.getenv("TENCENT_TTS_REGION", "ap-guangzhou").strip()
TENCENT_TTS_VOICE_TYPE = int(os.getenv("TENCENT_TTS_VOICE_TYPE", "101016"))  # 默认温柔女声，可按需替换
TENCENT_TTS_TIMEOUT = float(os.getenv("TENCENT_TTS_TIMEOUT", "8"))

# 阿里云 CosyVoice 语音合成（DashScope HTTP + WebSocket 流式）。与腾讯云并存，
# 用 TTS_PROVIDER 选择走哪个；留空时自动挑配了密钥的那一个（都配了优先 aliyun）。
# 密钥请写进 backend/.env（已被 .gitignore 忽略），不要进代码 / git。
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
DASHSCOPE_WORKSPACE_ID = os.getenv("DASHSCOPE_WORKSPACE_ID", "").strip()
DASHSCOPE_TTS_WS_URL = os.getenv("DASHSCOPE_TTS_WS_URL", "").strip()
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "").strip().lower()  # "" | "tencent" | "aliyun"

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# —— 前端静态资源托管（可选）——
# 当前后端可作为纯 API 部署；若同一服务需要同时托管前端生产包，则构建 frontend 后保留 dist，
# FastAPI 会从该目录暴露 /models、/assets、/audio、/scenes 等静态资源与 SPA 入口。
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REPO_ROOT = os.path.dirname(_BACKEND_DIR)
FRONTEND_DIST_DIR = os.getenv("FRONTEND_DIST_DIR", os.path.join(_REPO_ROOT, "frontend", "dist")).strip()

# —— PostgreSQL 持久化 ——
# memories / artifacts / phrases 三张关系表 + pgvector 语义索引的唯一 source of truth。
# DATABASE_URL 为标准 libpq 连接串；本地 Homebrew Postgres 默认 trust 鉴权、无需密码。
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/xinyu").strip()
PG_POOL_MIN = int(os.getenv("PG_POOL_MIN", "1"))
PG_POOL_MAX = int(os.getenv("PG_POOL_MAX", "10"))

# —— 语义记忆（pgvector + 本地 fastembed embedding）——
# 关系表始终是基础持久化；向量检索只增强「找回相关旧记忆」。embedding 走本地 ONNX
# 模型（首次下载后缓存、可离线、无需 API Key），不可用时自动降级为「最近记忆」，
# 绝不阻塞 reflect 主流程。EMBEDDING_DIM 必须与所选模型输出维度一致（建表用）。
VECTOR_ENABLED = os.getenv("VECTOR_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5").strip()
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "512"))
VECTOR_MEMORY_RESULTS = int(os.getenv("VECTOR_MEMORY_RESULTS", "3"))

# 风险阈值: 负面情绪且强度达到阈值时触发安全提示。
# 覆盖全部 6 类负面情绪（含 tired/lonely）——修复「高强度绝望被模型分类为疲惫/孤独/平静
# 而漏过阈值」的安全缺口。正面情绪(calm/happy)不在此列，避免高强度喜悦被误触发；
# 平静措辞、或被误分类为低风险情绪的危机表达，由下方 SAFETY_KEYWORDS 关键词黑名单兜底
# （完全不依赖情绪与强度）。
SAFETY_EMOTIONS = {"sad", "angry", "helpless", "anxious", "tired", "lonely"}
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
    # —— 中文：平静措辞的无望 / 被动自杀意念（不依赖情绪强度的兜底）——
    "看不到希望", "看不见希望", "看不到未来", "没有未来", "没有明天",
    "熬不下去", "熬不住了", "扛不下去", "扛不住了", "撑到头了",
    "活着好累", "活着太累", "活着是煎熬", "每天都是煎熬", "活着是一种折磨",
    "我是累赘", "我是个累赘", "成为累赘", "拖累所有人", "拖累家人", "我是负担",
    "没人在乎我", "没人需要我", "没有我会更好", "没有我大家会更好",
    "不想再醒来", "睡着就别醒", "一睡不醒", "不想存在",
    # —— 英文（已 text.lower() 后子串匹配） ——
    "kill myself", "killing myself", "want to die", "wanna die", "wanting to die",
    "end my life", "end it all", "ending it all", "end it",
    "suicide", "suicidal", "self harm", "self-harm", "hurt myself", "harm myself",
    "no reason to live", "no point in living", "can't go on", "cant go on",
    "give up on life", "take my own life",
    # —— 英文：无望 / 被动意念 ——
    "better off without me", "better off dead", "no reason to go on",
    "dont want to be here", "don't want to be here", "no future for me",
    "tired of living", "cant take it anymore", "can't take it anymore",
    "what's the point of living", "whats the point of living",
]
