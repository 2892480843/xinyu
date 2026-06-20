"""《心屿》后端入口。

核心接口 POST /api/reflect 串联：情绪分析 -> 风险检测 -> 场景映射 -> 叙事生成 -> 记忆保存。
"""

import asyncio
import base64
import logging
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app import config, db
from app.schemas import (
    AgentAskRequest,
    AgentAskResponse,
    AgentTraceItem,
    ArtifactItem,
    AddPhraseRequest,
    EchoPhrase,
    CompanionChatRequest,
    CompanionChatResponse,
    IslandChatRequest,
    IslandChatResponse,
    Safety,
    GlyphReadRequest,
    GlyphResponse,
    IslandActResponse,
    IslandChoice,
    IslandState,
    LetterResponse,
    MemoryItem,
    MemoryListResponse,
    PhraseItem,
    PhraseListResponse,
    ReflectRequest,
    ReflectResponse,
    RevisionResponse,
    WelcomeBackResponse,
    WhisperResponse,
)
from app.services.artifact_service import ArtifactService
from app.services.emotion_service import EmotionService
from app.services.island_ritual_service import IslandRitualService, GLYPH_CHARS
from app.services.island_state_service import EMOTION_ZH, IslandStateService
from app.services.llm_provider import get_provider
from app.services.agent_service import (
    AgentReflectionService,
    ToolChatAgent,
    CHAT_SYSTEM,
    ASK_SYSTEM,
    CHAT_TOOLS,
    LIST_RECENT_TOOL,
)
from app.services.embedding_service import EmbeddingService
from app.services.memory_service import MemoryService
from app.services.narrative_service import NarrativeService
from app.services.safety_service import SafetyService, SAFETY_MESSAGE
from app.services.vector_memory_service import VectorMemoryService
from app.services.welcome_back_service import WelcomeBackService
from app.services.revision_service import RevisionService
from app.services.phrase_service import PhraseService
from app.services.tts_service import TTSService, tts_voice_options
from app.services.aliyun_tts_service import AliyunTTSService, aliyun_voice_options
from app.services import scene_map
from app.services.companion_prompt import COMPANION_PROMPT_VERSION
from app.services.healing_kb import KB_VERSION

from pydantic import BaseModel

from app.observability import AccessLogMiddleware, configure_logging

# 结构化日志 + request_id（替代 basicConfig）。LOG_FORMAT=json 时输出 JSON 行日志。
configure_logging()
logger = logging.getLogger("xinyu")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动即确保 Postgres 连接池/ schema 就绪并注入种子；关停时归还连接池。
    # DB 暂时不可达时只记录告警、不阻断启动——后续请求会经 db.connection() 惰性重连，
    # DB 恢复后自动可用（避免「部署瞬间 DB 抖动 → 整个服务起不来」）。
    try:
        db.init_db()
        memory_service.ensure_demo_seed()
    except Exception as e:
        logger.warning("启动时 DB 初始化失败，将在首次请求时重试：%s", e)
    yield
    db.close_pool()


app = FastAPI(title="心屿 Xinyu API", version="1.0.0", lifespan=lifespan)

# 访问日志 / request_id / 异常兜底中间件。先加 → 处于 CORS 内层，
# 这样它兜底返回的 500 仍会被外层 CORS 补上跨域响应头，浏览器才能读到错误体。
app.add_middleware(AccessLogMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# 组装服务（单例）
provider = get_provider()
emotion_service = EmotionService(provider)
narrative_service = NarrativeService(provider)
safety_service = SafetyService()
memory_service = MemoryService()
embedding_service = EmbeddingService()
vector_memory_service = VectorMemoryService(embedding_service)
island_state_service = IslandStateService()
ritual_service = IslandRitualService()
artifact_service = ArtifactService()
welcome_back_service = WelcomeBackService()
revision_service = RevisionService()
phrase_service = PhraseService()
tts_service = TTSService()
aliyun_tts_service = AliyunTTSService()


def resolve_tts_provider() -> Optional[str]:
    """返回当前生效的 TTS provider：'aliyun' / 'tencent' / None（都未配置）。
    优先用 TTS_PROVIDER 显式指定；未指定时按密钥自动挑（都配了优先 aliyun）。"""
    pref = config.TTS_PROVIDER
    if pref in {"aliyun", "tencent"}:
        if pref == "aliyun" and aliyun_tts_service.configured():
            return "aliyun"
        if pref == "tencent" and tts_service.configured():
            return "tencent"
        # 显式指定但密钥没配 → 落到自动
    if aliyun_tts_service.configured():
        return "aliyun"
    if tts_service.configured():
        return "tencent"
    return None
WS_STAGE_PAUSE_SECONDS = 0.12

# 岛屿低语去重缓冲：每 user 保留最近 5 条已说过的话，传给 LLM 让它避免雷同
_recent_whispers: Dict[str, List[str]] = {}
_WHISPER_MEMORY_LIMIT = 5

# reflect 幂等缓存：按 request_id 缓存 (events, response, saved)，让 WS 超时→HTTP 回退不重复执行/落库。
# 配 per-id 锁处理「回退时 WS 线程仍在跑」的重叠竞态：第二个调用会阻塞到第一个完成后取缓存。
_reflect_cache: "OrderedDict[str, tuple]" = OrderedDict()
_REFLECT_CACHE_MAX = 256
_reflect_cache_lock = threading.Lock()
_reflect_inflight: Dict[str, threading.Lock] = {}


def _run_reflect_idempotent(
    user_id: str, text: str, ephemeral: bool, request_id: Optional[str]
) -> tuple:
    """带 request_id 幂等保护地运行 reflect 管道。无 request_id 时退化为直接执行。"""
    if not request_id:
        return _run_reflect(user_id, text, ephemeral=ephemeral)
    with _reflect_cache_lock:
        if request_id in _reflect_cache:
            return _reflect_cache[request_id]
        lock = _reflect_inflight.setdefault(request_id, threading.Lock())
    try:
        with lock:
            with _reflect_cache_lock:
                if request_id in _reflect_cache:
                    return _reflect_cache[request_id]
            result = _run_reflect(user_id, text, ephemeral=ephemeral)
            with _reflect_cache_lock:
                _reflect_cache[request_id] = result
                while len(_reflect_cache) > _REFLECT_CACHE_MAX:
                    _reflect_cache.popitem(last=False)
            return result
    finally:
        # 无论成功或异常都清理 inflight 锁条目，避免 _run_reflect 抛错时永久残留（缓慢泄漏）。
        with _reflect_cache_lock:
            _reflect_inflight.pop(request_id, None)


class IslandActRequest(BaseModel):
    user_id: str = "demo-user"
    choice_id: str


class SeedIdentityRequest(BaseModel):
    user_id: str = "demo-user"


class InscribeRequest(BaseModel):
    user_id: str = "demo-user"
    text: str


class SilentCompanionRequest(BaseModel):
    user_id: str = "demo-user"
    duration_seconds: int = 30  # 玩家实际静默时长，仅用于在 inscription 上做温柔标记


def _origin_allowed(origin: Optional[str]) -> bool:
    """WebSocket Origin 校验。CORSMiddleware 只对 HTTP 生效，
    WS 握手必须在 accept 前自行校验，否则任意网站可跨站连接。
    无 Origin 头（非浏览器客户端，如本地脚本/测试）放行；有 Origin 则必须命中白名单。"""
    if not origin:
        return True
    return origin in config.CORS_ORIGINS

_TIME_ZH = {"dawn": "清晨", "day": "白天", "dusk": "黄昏", "night": "夜晚", "evening": "傍晚"}
_WEATHER_ZH = {"clear": "晴", "light_rain": "小雨", "rain": "雨", "fog": "雾", "storm": "风暴"}


def _validate_reflect_request(req: ReflectRequest) -> tuple[str, str, bool]:
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text 不能为空")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text 过长（上限 2000 字）")
    user_id = req.user_id or "demo-user"
    return user_id, text, bool(req.ephemeral)


def _scrub_generated(text: Optional[str], fallback: str = "") -> str:
    """输出端安全网：万一 LLM 生成的文本意外命中高风险关键词，降级为安全文案，
    闭合「输入安全 + 输出安全」两端。确定性规则，绝不让 AI 介入危机处置。"""
    if text and safety_service.has_risk_keyword(text):
        logger.warning("output safety scrub triggered: generated text degraded")
        return fallback
    return text or ""


def _classic_reflect_pipeline(user_id: str, text: str, ephemeral: bool = False):
    """多智能体反思管道（生成器）。

    按导演台展示顺序逐阶段计算并 `yield (event_name, payload)`，让 WebSocket 能在
    最慢的叙事生成之前就把情绪/记忆/环境阶段推给前端——真正的「信使逐个抵达」，
    而不是算完一次性闪过。最后 `yield ("__final__", {"response", "saved"})`。

    HTTP 走 `_run_reflect` 把全部事件收集成列表；WebSocket 走 `_stream_reflect` 边算边推。
    两条路径共用同一段计算，避免重复逻辑。
    """
    recent_for_island = memory_service.get_recent(user_id, 10)
    recent_history = recent_for_island[:3]

    # —— 情绪分析 Agent ——
    emo = emotion_service.analyze(text, recent_history)
    emotion = emo["emotion"]
    intensity = emo["intensity"]
    summary = emo["summary"]
    zh = EMOTION_ZH.get(emotion, emotion)
    emotion_trace = AgentTraceItem(
        agent="emotion", label="情绪分析 Agent", output=f"识别为{zh}，强度 {intensity:.2f}"
    )

    # —— 安全边界 Agent（先判定，决定是否生成普通叙事；卡片按展示顺序最后给出）——
    safety = safety_service.check(emotion, intensity, text)

    yield ("agent", emotion_trace.model_dump())
    yield ("emotion", {"emotion": emotion, "intensity": intensity, "summary": summary, "safety": safety.model_dump()})

    # —— 记忆检索 Agent ——
    narrative_history = _get_narrative_history(user_id, text, emotion, summary, recent_history)
    total_count = memory_service.count_by_user(user_id)
    related = sum(1 for m in narrative_history if m.get("emotion") == emotion)
    if narrative_history:
        memory_output = f"检索到 {len(narrative_history)} 条相关记忆，其中 {related} 条与{zh}有关"
    else:
        memory_output = "这是岛屿与你的第一次相遇，还没有更早的记忆"
    if ephemeral:
        memory_output = "本次为无痕陪伴，记忆不会留下"
    memory_trace = AgentTraceItem(agent="memory", label="记忆检索 Agent", output=memory_output)
    yield ("agent", memory_trace.model_dump())

    # —— 环境推理 Agent（场景 + 岛屿状态，叠加玩家留下的物件）——
    # 无痕模式下岛屿「当下」仍随本次情绪呼应（dominant/trend/weather 反映这次），
    # 但不推进成长等级（total_count 不 +1），做到"陪你但不留痕"(#10)。
    scene = scene_map.get_scene(emotion, intensity)
    artifact_keys = artifact_service.distinct_keys(user_id)
    island_state = island_state_service.compute(
        recent_for_island,
        total_count if ephemeral else total_count + 1,
        current={"emotion": emotion, "intensity": intensity},
        artifacts=artifact_keys,
    )
    scene_zh = f"{_TIME_ZH.get(scene['time'], scene['time'])}·{_WEATHER_ZH.get(scene['weather'], scene['weather'])}"
    environment_trace = AgentTraceItem(
        agent="environment",
        label="环境推理 Agent",
        output=f"{scene_zh}场景，岛屿成长至第 {island_state.growth_level} 级",
    )
    yield ("agent", environment_trace.model_dump())
    yield ("scene", {"scene": scene})
    yield ("island_state", {"island_state": island_state.model_dump()})

    # —— 叙事表达 Agent（最慢的一步；前面几位信使已先点亮）——
    if safety.triggered:
        narrative = ""
        imprint: Optional[str] = None
        memory_hint: Optional[str] = None
        narrative_output = "检测到高风险，已暂停普通叙事"
    else:
        narr = narrative_service.generate(emotion, intensity, summary, scene["imagery"], narrative_history)
        narrative = narr.get("narrative", "")
        imprint = narr.get("imprint")
        memory_hint = narr.get("memory_hint")
        # 输出端安全网：生成内容意外命中风险词时降级为最克制的陪伴句（确定性兜底）
        narrative = _scrub_generated(narrative, "此刻就让岛屿静静陪着你，不必急着说什么。")
        narrative_output = f"已生成 {len(narrative)} 字治愈叙事与心灵印记"
    narrative_trace = AgentTraceItem(agent="narrative", label="叙事表达 Agent", output=narrative_output)
    yield ("agent", narrative_trace.model_dump())
    yield ("narrative", {"narrative": narrative, "imprint": imprint, "memory_hint": memory_hint})

    # —— 安全边界 Agent 卡片 ——
    safety_trace = AgentTraceItem(
        agent="safety",
        label="安全边界 Agent",
        output="已触发安全边界，引导寻求帮助" if safety.triggered else "未发现高风险，正常陪伴",
    )
    yield ("agent", safety_trace.model_dump())

    agent_trace = [emotion_trace, memory_trace, environment_trace, narrative_trace, safety_trace]

    # —— 私房安慰话回响：用户教过的同情绪 phrase，在叙事后加引号附议 ——
    # 高风险时不回响（避免引用之外的话与安全引导冲突）；
    # 无痕模式也不回响——「岛屿不会记得这次」的承诺下不应主动复述用户教过的私房话(#15)。
    echo_phrase: Optional[EchoPhrase] = None
    if not safety.triggered and not ephemeral:
        picked = phrase_service.pick_for(user_id, emotion)
        if picked:
            echo_phrase = EchoPhrase(
                content=picked["content"],
                attribution=picked.get("attribution", ""),
                emotion=emotion,
            )

    # —— 岛屿回应选择卡 ——
    # 高风险时不给普通选择；无痕模式下也不给（选择会生成持久物件，与"不留痕"承诺冲突）
    if safety.triggered or ephemeral:
        choices = []
    else:
        choices = [IslandChoice(**c) for c in ritual_service.get_choices(emotion, island_state.trend)]

    # —— 保存记忆（无痕模式下完全跳过，连向量库都不写）——
    # 持久化失败不该让用户丢失已生成的叙事：降级为「本次不落库」，response 仍正常返回。
    saved_memory: Dict[str, Any] = {}
    persisted = False
    if not ephemeral:
        try:
            saved_memory = memory_service.save(
                {
                    "user_id": user_id,
                    "text": text,
                    "emotion": emotion,
                    "intensity": intensity,
                    "summary": summary,
                    "narrative": narrative,
                    "imprint": imprint,
                }
            )
            _try_add_vector_memory(saved_memory)
            persisted = True
        except Exception as exc:
            logger.error("reflect 持久化失败，本次降级为不落库（仍返回叙事）：%s", exc)
            saved_memory = {}

    logger.info(
        "reflect user=%s emotion=%s intensity=%.2f safety=%s growth=%s ephemeral=%s",
        user_id, emotion, intensity, safety.triggered, island_state.growth_level, ephemeral,
    )

    response = ReflectResponse(
        emotion=emotion,
        intensity=intensity,
        summary=summary,
        scene=scene,
        island_state=island_state,
        agent_trace=agent_trace,
        choices=choices,
        narrative=narrative,
        imprint=imprint,
        memory_hint=memory_hint,
        safety=safety,
        ephemeral=ephemeral,
        echo_phrase=echo_phrase,
    )

    # __final__ 先于 memory 事件 yield：此刻 save 已完成，让调用方立刻落缓存，
    # 这样即便随后推送 memory/done 失败（客户端断开），HTTP 回退命中缓存也不会二次落库。
    yield ("__final__", {"response": response, "saved": saved_memory})
    # 无痕模式（或持久化失败降级）下不发 memory 事件（无记忆可言）
    if not ephemeral and persisted:
        yield ("memory", {"memory": saved_memory})


def _agent_reflect_pipeline(user_id: str, text: str, ephemeral: bool = False):
    """工具型 Agent 反思管道（P1）。

    用 AgentReflectionService（DeepSeek function-calling）让模型**自主**决定调用
    recall_memories / read_island，再 compose 出叙事——真实的工具循环，导演台显示的
    是 agent 实际做了什么（查了哪些记忆、读没读岛屿），而非写死的固定文案。
    事件类型与 ReflectResponse 结构与 classic 完全一致，前端无需改动即可工作。
    安全：关键词高风险已在 dispatcher 前置拦截走 classic；这里只做强度阈值兜底。
    """
    recent_for_island = memory_service.get_recent(user_id, 10)
    recent_history = recent_for_island[:3]
    total_count = memory_service.count_by_user(user_id)
    artifact_keys = artifact_service.distinct_keys(user_id)
    captured: Dict[str, Any] = {"recall": None, "island": None}

    def _tool_recall(query: str) -> List[Dict[str, Any]]:
        hist = _get_narrative_history(user_id, query, "", "", recent_history)
        captured["recall"] = {"query": query, "count": len(hist)}
        return [
            {
                "emotion": EMOTION_ZH.get(m.get("emotion", ""), m.get("emotion", "")),
                "summary": m.get("summary", ""),
                "said": (m.get("text", "") or "")[:50],
            }
            for m in hist[:3]
        ]

    def _tool_island() -> Dict[str, Any]:
        st = island_state_service.compute(recent_for_island, total_count, current=None, artifacts=artifact_keys)
        captured["island"] = st
        return {
            "growth_level": st.growth_level,
            "trend": st.trend,
            "dominant_emotion": EMOTION_ZH.get(st.dominant_emotion, st.dominant_emotion),
            "features": st.features,
            "summary": st.summary,
        }

    agent = AgentReflectionService({"recall_memories": _tool_recall, "read_island": _tool_island})
    hint = f"ta 最近一次心情是「{EMOTION_ZH.get(recent_history[0].get('emotion', ''), '平静')}」" if recent_history else ""

    composed: Optional[Dict[str, Any]] = None
    for ev, data in agent.run(text, recent_hint=hint):
        if ev == "final":
            composed = data
    composed = composed or {"emotion": "calm", "intensity": 0.5, "summary": "心情有了波动", "narrative": "", "imprint": None, "steps": 0}

    emotion = composed["emotion"]
    intensity = composed["intensity"]
    summary = composed["summary"]
    narrative = composed.get("narrative") or ""
    imprint = composed.get("imprint")
    memory_hint: Optional[str] = None
    zh = EMOTION_ZH.get(emotion, emotion)
    safety = safety_service.check(emotion, intensity, text)

    # 以与 classic 一致的顺序发事件（WS 会逐个带停顿推送，保留「信使逐个抵达」），内容由 agent 实际行为决定
    emotion_trace = AgentTraceItem(agent="emotion", label="情绪分析 Agent", output=f"agent 判定为{zh}，强度 {intensity:.2f}")
    yield ("agent", emotion_trace.model_dump())
    yield ("emotion", {"emotion": emotion, "intensity": intensity, "summary": summary, "safety": safety.model_dump()})

    if captured["recall"] is not None:
        c = captured["recall"]
        mem_out = (f"agent 主动检索「{c['query']}」→ 找到 {c['count']} 条相关旧事" if c["count"]
                   else f"agent 检索「{c['query']}」→ 暂无相关旧事")
    elif ephemeral:
        mem_out = "本次为无痕陪伴，记忆不会留下"
    else:
        mem_out = "岛屿与你的第一次相遇，还没有更早的记忆" if not total_count else "agent 判断此刻无需回溯旧记忆"
    memory_trace = AgentTraceItem(agent="memory", label="记忆检索 Agent", output=mem_out)
    yield ("agent", memory_trace.model_dump())

    scene = scene_map.get_scene(emotion, intensity)
    island_state = island_state_service.compute(
        recent_for_island, total_count if ephemeral else total_count + 1,
        current={"emotion": emotion, "intensity": intensity}, artifacts=artifact_keys,
    )
    env_out = (f"agent 读取岛屿：第 {island_state.growth_level} 级 · 趋势 {island_state.trend}"
               if captured["island"] is not None else f"环境推理：岛屿成长至第 {island_state.growth_level} 级")
    environment_trace = AgentTraceItem(agent="environment", label="环境推理 Agent", output=env_out)
    yield ("agent", environment_trace.model_dump())
    yield ("scene", {"scene": scene})
    yield ("island_state", {"island_state": island_state.model_dump()})

    if safety.triggered:
        narrative = ""
        imprint = None
        narr_out = "检测到高风险，已暂停普通叙事"
    else:
        narrative = _scrub_generated(narrative, "此刻就让岛屿静静陪着你，不必急着说什么。")
        narr_out = f"agent 经 {composed.get('steps', 0)} 步工具调用，写下 {len(narrative)} 字治愈叙事"
    narrative_trace = AgentTraceItem(agent="narrative", label="叙事表达 Agent", output=narr_out)
    yield ("agent", narrative_trace.model_dump())
    yield ("narrative", {"narrative": narrative, "imprint": imprint, "memory_hint": memory_hint})

    safety_trace = AgentTraceItem(agent="safety", label="安全边界 Agent", output="已触发安全边界，引导寻求帮助" if safety.triggered else "未发现高风险，正常陪伴")
    yield ("agent", safety_trace.model_dump())
    agent_trace = [emotion_trace, memory_trace, environment_trace, narrative_trace, safety_trace]

    echo_phrase: Optional[EchoPhrase] = None
    if not safety.triggered and not ephemeral:
        picked = phrase_service.pick_for(user_id, emotion)
        if picked:
            echo_phrase = EchoPhrase(content=picked["content"], attribution=picked.get("attribution", ""), emotion=emotion)

    choices = [] if (safety.triggered or ephemeral) else [IslandChoice(**c) for c in ritual_service.get_choices(emotion, island_state.trend)]

    saved_memory: Dict[str, Any] = {}
    persisted = False
    if not ephemeral:
        try:
            saved_memory = memory_service.save({
                "user_id": user_id, "text": text, "emotion": emotion, "intensity": intensity,
                "summary": summary, "narrative": narrative, "imprint": imprint,
            })
            _try_add_vector_memory(saved_memory)
            persisted = True
        except Exception as exc:
            logger.error("reflect[agent] 持久化失败，本次降级为不落库（仍返回叙事）：%s", exc)
            saved_memory = {}

    logger.info("reflect[agent] user=%s emotion=%s intensity=%.2f safety=%s growth=%s steps=%s ephemeral=%s",
                user_id, emotion, intensity, safety.triggered, island_state.growth_level, composed.get("steps", 0), ephemeral)

    response = ReflectResponse(
        emotion=emotion, intensity=intensity, summary=summary, scene=scene, island_state=island_state,
        agent_trace=agent_trace, choices=choices, narrative=narrative, imprint=imprint,
        memory_hint=memory_hint, safety=safety, ephemeral=ephemeral, echo_phrase=echo_phrase,
    )
    yield ("__final__", {"response": response, "saved": saved_memory})
    if not ephemeral and persisted:
        yield ("memory", {"memory": saved_memory})


def _reflect_pipeline(user_id: str, text: str, ephemeral: bool = False):
    """调度：能用真 agent（OpenAI 兼容 + 文本无关键词高风险）就走工具型 agent，否则走经典管线。
    两条路径事件类型与 ReflectResponse 结构一致，HTTP / WS 调用方无需区分。"""
    use_agent = (
        config.LLM_PROVIDER == "openai"
        and bool(config.OPENAI_API_KEY)
        and not safety_service.has_risk_keyword(text)
    )
    if use_agent:
        yield from _agent_reflect_pipeline(user_id, text, ephemeral)
    else:
        yield from _classic_reflect_pipeline(user_id, text, ephemeral)


def _run_reflect(
    user_id: str, text: str, ephemeral: bool = False,
) -> tuple[List[tuple[str, Dict[str, Any]]], ReflectResponse, Dict[str, Any]]:
    """同步收集整条管道（供 HTTP）。返回 (events, response, saved_memory)，
    events 顺序与含义与改造前完全一致。"""
    events: List[tuple[str, Dict[str, Any]]] = []
    response: Optional[ReflectResponse] = None
    saved_memory: Dict[str, Any] = {}
    for event_name, payload in _reflect_pipeline(user_id, text, ephemeral=ephemeral):
        if event_name == "__final__":
            response = payload["response"]
            saved_memory = payload["saved"]
        else:
            events.append((event_name, payload))
    if response is None:  # 生成器必产出 __final__，理论上不会发生
        raise RuntimeError("reflect pipeline did not finalize")
    return events, response, saved_memory


def _get_narrative_history(
    user_id: str, text: str, emotion: str, summary: str, fallback: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    query_text = vector_memory_service.build_query_text(text, emotion, summary)
    try:
        matches = vector_memory_service.search(user_id, query_text, config.VECTOR_MEMORY_RESULTS)
    except Exception as e:
        logger.warning("vector memory search failed unexpectedly, falling back to SQLite recent memories: %s", e)
        return fallback
    if not matches:
        return fallback

    memory_ids = [int(m["memory_id"]) for m in matches if "memory_id" in m]
    by_id = {int(item["id"]): item for item in memory_service.get_by_ids(user_id, memory_ids)}
    history = [by_id[int(m["memory_id"])] for m in matches if "memory_id" in m and int(m["memory_id"]) in by_id]
    return history or fallback


def _try_add_vector_memory(saved_memory: Dict[str, Any]) -> None:
    try:
        vector_memory_service.add_memory(saved_memory)
    except Exception as e:
        logger.warning("vector memory write failed unexpectedly, SQLite memory kept: %s", e)


async def _send_ws_event(websocket: WebSocket, event: str, payload: Optional[Dict[str, Any]] = None) -> None:
    data: Dict[str, Any] = {"event": event}
    if payload:
        data.update(payload)
    await websocket.send_json(data)
    if event not in {"done", "error"}:
        await asyncio.sleep(WS_STAGE_PAUSE_SECONDS)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "provider": config.LLM_PROVIDER,
        "model": config.OPENAI_MODEL if config.LLM_PROVIDER == "openai" else "mock",
        "emotions": scene_map.list_emotions(),
        "healing_kb": KB_VERSION,
    }


@app.get("/api/memories")
def list_memories(user_id: str = "demo-user", limit: int = 20) -> MemoryListResponse:
    limit = max(1, min(limit, 100))
    rows = memory_service.get_all(user_id)[:limit]
    return MemoryListResponse(memories=[MemoryItem(**r) for r in rows])


@app.get("/api/island-state", response_model=IslandState)
def get_island_state(user_id: str = "demo-user") -> IslandState:
    """首次进入未提交新心情时，也能看到当前岛屿状态（基于历史记忆与已留下的物件）。"""
    recent = memory_service.get_recent(user_id, 10)
    total = memory_service.count_by_user(user_id)
    artifacts = artifact_service.distinct_keys(user_id)
    return island_state_service.compute(recent, total, current=None, artifacts=artifacts)


DEMO_TIMELINE_USER = "demo-timeline"


class TimelineSeedRequest(BaseModel):
    user_id: str = DEMO_TIMELINE_USER


@app.post("/api/demo/timeline-seed")
def demo_timeline_seed(req: TimelineSeedRequest) -> Dict[str, Any]:
    """路演「时光机·一键回望」专用：为演示身份注入一段跨天、有起伏的轨迹（幂等重置）。
    默认写入专用 demo 身份(demo-timeline)，绝不影响真实用户记忆。"""
    user_id = (req.user_id or DEMO_TIMELINE_USER).strip() or DEMO_TIMELINE_USER
    inserted = memory_service.seed_timeline_for_user(user_id, force=True)
    logger.info("timeline_seed user=%s inserted=%s", user_id, inserted)
    return {"user_id": user_id, "inserted": inserted}


@app.get("/api/island/timeline")
def island_timeline(user_id: str = "demo-user") -> Dict[str, Any]:
    """时光机·一键回望：返回该用户「从最早到最新」每一步的岛屿状态快照，
    供前端做"荒岛逐步生长"的延时动画。纯计算、零 LLM、断网可跑。"""
    user_id = (user_id or "demo-user").strip() or "demo-user"
    all_memories = memory_service.get_all(user_id)  # 最新在前
    # 安全：从回望里剔除高风险记忆，绝不在时光机字幕里复述自伤倾诉原文（与 whisper/letter/revision 一致）
    all_memories = [m for m in all_memories if not safety_service.memory_is_high_risk(m)]
    if not all_memories:
        return {"steps": []}
    chronological = list(reversed(all_memories))  # 从最早到最新
    artifacts = artifact_service.distinct_keys(user_id)
    steps: List[Dict[str, Any]] = []
    for i, current in enumerate(chronological):
        prefix_newest_first = list(reversed(chronological[: i + 1]))  # 截至该步、最新在前
        emotion = current.get("emotion", "calm")
        intensity = float(current.get("intensity", 0.5) or 0.5)
        island_state = island_state_service.compute(
            prefix_newest_first, i + 1, current=None, artifacts=artifacts
        )
        scene = scene_map.get_scene(emotion, intensity)
        steps.append(
            {
                "index": i,
                "created_at": current.get("created_at", ""),
                "emotion": emotion,
                "intensity": round(intensity, 2),
                "text": current.get("text", ""),
                "summary": current.get("summary", ""),
                "narrative": (current.get("narrative", "") or "")[:80],
                "scene": scene,
                "island_state": island_state.model_dump(),
            }
        )
    return {"steps": steps}


@app.delete("/api/identity/{user_id}")
def delete_identity(user_id: str) -> Dict[str, Any]:
    """隐私：彻底删除某本地身份在后端的全部痕迹（记忆/物件/私房话/向量）。
    让「匿名身份可删除」的承诺落到代码——这是面向脆弱用户产品的社会价值硬证据。"""
    clean = (user_id or "").strip()
    if not clean:
        raise HTTPException(status_code=400, detail="user_id 不能为空")
    memories = memory_service.delete_by_user_id(clean)
    artifacts = artifact_service.delete_by_user_id(clean)
    phrases = phrase_service.delete_by_user_id(clean)
    vector_ok = False
    try:
        vector_ok = bool(vector_memory_service.delete_by_user_id(clean))
    except Exception as e:
        logger.warning("vector memory delete failed for user=%s: %s", clean, e)
    logger.info(
        "identity_delete user=%s memories=%d artifacts=%d phrases=%d vector=%s",
        clean, memories, artifacts, phrases, vector_ok,
    )
    return {
        "user_id": clean,
        "deleted": {"memories": memories, "artifacts": artifacts, "phrases": phrases, "vector": vector_ok},
    }


class TtsRequest(BaseModel):
    text: str
    emotion: str = "calm"
    voice: Optional[str] = None  # 音色 id（腾讯云数字 / 阿里云字符串）；None 用默认


@app.get("/api/tts/voices")
def list_tts_voices() -> Dict[str, Any]:
    """可选音色清单 + 当前生效 provider + 是否已配置云端 TTS。
    按 provider 返回对应清单（阿里云字符串 id / 腾讯云数字 id）。
    未配置任何密钥时 voices 为空 + configured=false，前端据此显示降级提示。"""
    provider = resolve_tts_provider()
    if provider == "aliyun":
        voices = aliyun_voice_options()
    elif provider == "tencent":
        voices = tts_voice_options()
    else:
        voices = []
    return {"configured": provider is not None, "provider": provider, "voices": voices}


@app.post("/api/tts")
def synthesize_tts(req: TtsRequest) -> Dict[str, Any]:
    """情感语音合成：按当前 provider（阿里云 CosyVoice / 腾讯云）合成 mp3 音频(base64)；
    未配置或调用失败时返回 configured/ok=false，前端据此降级为浏览器原生合成。
    voice 为音色 id；为空则用默认音色（腾讯云传数字、阿里云传字符串，统一经 str 透传）。"""
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text 不能为空")
    text = text[:500]
    provider = resolve_tts_provider()
    if provider is None:
        return {"configured": False, "ok": False, "provider": None}
    if provider == "aliyun":
        audio = aliyun_tts_service.synthesize(text, (req.emotion or "calm"), req.voice)
    else:
        # 腾讯云 VoiceType 是 int：前端统一传 str，这里转回 int
        voice_int = None
        if req.voice:
            try:
                voice_int = int(req.voice)
            except (TypeError, ValueError):
                voice_int = None
        audio = tts_service.synthesize(text, (req.emotion or "calm"), voice_int)
    if not audio:
        return {"configured": True, "ok": False, "provider": provider}
    return {
        "configured": True,
        "ok": True,
        "provider": provider,
        "mime": "audio/mp3",
        "audio_base64": base64.b64encode(audio).decode("ascii"),
    }


@app.get("/api/artifacts")
def list_artifacts(user_id: str = "demo-user") -> Dict[str, Any]:
    """返回玩家在岛上留下的物件收藏。"""
    rows = artifact_service.get_all(user_id)
    return {"artifacts": [ArtifactItem(**r) for r in rows]}


@app.get("/api/island/welcome-back", response_model=WelcomeBackResponse)
def welcome_back(user_id: str = "demo-user", force: bool = False) -> WelcomeBackResponse:
    """离岛信件：用户超过 48 小时没回来时，岛屿给一句温柔的「我替你看着」。
    force=1 是答辩演示开关，不看实际离开时长仍输出文案。"""
    user_id = (user_id or "demo-user").strip() or "demo-user"
    recent = memory_service.get_recent(user_id, 1)
    if not recent:
        return WelcomeBackResponse(show=False)
    last_iso = recent[0].get("created_at", "")
    arts = artifact_service.get_all(user_id)
    latest_artifact = arts[0] if arts else None
    show, message, hours = welcome_back_service.compose(last_iso, latest_artifact, force=force)
    artifact_key = latest_artifact["artifact"] if (show and latest_artifact) else ""
    artifact_label = latest_artifact["label"] if (show and latest_artifact) else ""
    return WelcomeBackResponse(
        show=show,
        message=message,
        hours_away=hours,
        artifact=artifact_key,
        artifact_label=artifact_label,
    )


@app.post("/api/glyph", response_model=GlyphResponse)
def read_glyph(req: GlyphReadRequest) -> GlyphResponse:
    """写一个字给岛屿：用户描红写下一个心境字（字确定，无需 OCR），
    岛屿结合字义 + 书写动力学读出情绪，刻成一块心境石。多块积累成石林。"""
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    char = (req.char or "").strip()[:2]
    if char not in GLYPH_CHARS:
        raise HTTPException(status_code=400, detail="不是可书写的心境字")
    prior = GLYPH_CHARS[char]
    dynamics = req.dynamics.model_dump()
    out = provider.read_glyph(char, dynamics, prior)
    emotion = out.get("emotion", prior)
    intensity = float(out.get("intensity", 0.55))
    reading = out.get("reading", "")
    # 留下一块心境石：label=字本身，inscription=读心，便于石林逐块展示
    saved = artifact_service.save(user_id=user_id, artifact="glyph_stone", label=char, emotion=emotion)
    inscribed = artifact_service.inscribe(user_id, saved["id"], reading)
    if inscribed:
        saved = inscribed
    logger.info("glyph user=%s char=%s emotion=%s intensity=%.2f", user_id, char, emotion, intensity)
    return GlyphResponse(
        char=char,
        emotion=emotion,
        intensity=round(intensity, 2),
        reading=reading,
        artifact=ArtifactItem(**saved),
    )


@app.post("/api/silent/companion", response_model=ArtifactItem)
def silent_companion(req: SilentCompanionRequest) -> ArtifactItem:
    """静默坐岛：用户什么都没说，岛屿陪坐了 N 秒。
    这是公益赛道里"说不出也算说话"的核心入口——承认沉默是合法情绪状态，
    不写记忆库（没倾诉文本），只留下一枚静默贝壳作为"我来过"的证据。"""
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    duration = max(0, min(int(req.duration_seconds or 0), 600))
    label = "静默贝壳"
    saved = artifact_service.save(
        user_id=user_id, artifact="silent_shell", label=label, emotion="calm",
    )
    # 把静默时长温柔地"刻"在贝壳上——为未来某天 whisper 把它还给用户做铺垫
    if duration > 0:
        inscribed = artifact_service.inscribe(
            user_id, saved["id"], f"这一刻我什么也说不出，岛屿陪我坐了 {duration} 秒",
        )
        if inscribed:
            saved = inscribed
    logger.info("silent_companion user=%s duration=%d artifact_id=%s", user_id, duration, saved.get("id"))
    return ArtifactItem(**saved)


@app.post("/api/companion/chat", response_model=CompanionChatResponse)
def companion_chat(req: CompanionChatRequest) -> CompanionChatResponse:
    """专属精灵对话：复用现有 LLM Provider。

    默认 Mock 可离线演示；配置 OpenAI 兼容接口后，精灵会按专属 prompt 生成入戏回应。
    安全风险先由规则层截断，避免模型自由复述高风险内容。
    """
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    text = (req.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="message 不能为空")
    if len(text) > 500:
        raise HTTPException(status_code=400, detail="message 过长（上限 500 字）")
    name = (req.companion_name or "微光").strip()[:8] or "微光"
    recent = memory_service.get_recent(user_id, 5)
    analyzed = emotion_service.analyze(text, recent[:3])
    server_emotion = (analyzed.get("emotion") or "calm").strip().lower()
    intensity = float(analyzed.get("intensity", 0.5) or 0.5)
    # 回复语气可由客户端 emotion 着色，但安全门恒用「服务端分析」的情绪+强度，
    # 绝不被客户端传入的 emotion 绕过（否则可用 emotion="happy" 关掉阈值安全网）。
    emotion = (req.emotion or server_emotion or "calm").strip().lower()
    if emotion not in EMOTION_ZH:
        emotion = server_emotion
    safety = safety_service.check(server_emotion, intensity, text)
    if safety.triggered:
        reply = (
            f"{name}把灯塔光停在你身边：先别独自扛着。"
            "请马上联系身边可信任的人，或拨打当地紧急电话；我会安静陪你等到有人回应。"
        )
        return CompanionChatResponse(
            reply=reply,
            emotion=emotion,
            animation="Worried",
            safety=safety,
            prompt_version=COMPANION_PROMPT_VERSION,
        )

    safe_recent = [m for m in recent if not safety_service.memory_is_high_risk(m)]
    island_state = island_state_service.compute(
        safe_recent,
        memory_service.count_by_user(user_id),
        current=None,
        artifacts=artifact_service.distinct_keys(user_id),
    )
    companion = {
        "name": name,
        "affinity": max(0, min(int(req.affinity or 0), 100)),
        "feed_count": max(0, int(req.feed_count or 0)),
        "talk_count": max(0, int(req.talk_count or 0)),
        "unlocked_secrets": list(req.unlocked_secrets or [])[:8],
    }
    out = provider.generate_companion_reply(text, companion, emotion, safe_recent, island_state.model_dump())
    reply = _scrub_generated(
        out.get("reply", ""),
        f"{name}轻轻靠近你，灯塔光低低亮着：我在这里，陪你把这一刻慢慢放轻。",
    )
    animation = out.get("animation", "BondGlow")
    if animation not in {"TalkListen", "BondGlow", "Joyful", "Worried"}:
        animation = "BondGlow"
    logger.info("companion_chat user=%s emotion=%s animation=%s", user_id, out.get("emotion", emotion), animation)
    return CompanionChatResponse(
        reply=reply[:120],
        emotion=out.get("emotion", emotion),
        animation=animation,
        safety=safety,
        prompt_version=COMPANION_PROMPT_VERSION,
    )


@app.post("/api/artifacts/{artifact_id}/inscribe", response_model=ArtifactItem)
def inscribe_artifact(artifact_id: int, req: InscribeRequest) -> ArtifactItem:
    """给一枚已留下的物件刻一句给未来自己的话（30-80 字内）。"""
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    text = (req.text or "").strip()
    if len(text) > 80:
        raise HTTPException(status_code=400, detail="刻字过长（上限 80 字）")
    row = artifact_service.inscribe(user_id, artifact_id, text)
    if row is None:
        raise HTTPException(status_code=404, detail="没找到这枚物件，或它不属于你")
    logger.info("artifact_inscribe user=%s artifact_id=%s len=%d", user_id, artifact_id, len(text))
    return ArtifactItem(**row)


@app.get("/api/island/whisper", response_model=WhisperResponse)
def island_whisper(user_id: str = "demo-user") -> WhisperResponse:
    """岛屿主动低语：进入岛屿但还没说话时，岛屿用 LLM 主动说一句温柔的话。
    无记忆/安全风险时不弹；最近 5 句去重防雷同。"""
    user_id = (user_id or "demo-user").strip() or "demo-user"
    recent = memory_service.get_recent(user_id, 5)
    if not recent:
        return WhisperResponse(show=False)

    # 安全护栏：最近一条记忆若高风险（情绪+强度阈值 或 关键词命中），
    # 不让 LLM 自由复述——回退为一句最克制的环境化通用文案
    latest = recent[0]
    high_risk = safety_service.memory_is_high_risk(latest)

    arts = artifact_service.get_all(user_id)
    latest_artifact = arts[0] if arts else None
    island_state_obj = island_state_service.compute(
        recent, memory_service.count_by_user(user_id), current=None,
        artifacts=artifact_service.distinct_keys(user_id),
    )
    island_state_dict = island_state_obj.model_dump()

    if high_risk:
        whisper = "海面没有起浪，岛屿安静地陪着你。"
    else:
        # 「时光回信」：用户亲手在某枚物件上刻过给自己的话——岛屿把它带回来给未来的自己。
        # latest_inscribed 已排除系统自动刻字（静默贝壳/心境石），只取用户手写的那句。
        inscribed = artifact_service.latest_inscribed(user_id)
        if inscribed and inscribed.get("inscription"):
            whisper = f"你曾在{inscribed['label']}上写下：「{inscribed['inscription']}」——这句话岛屿一直替你留着。"
            latest_artifact = inscribed
        else:
            avoid = _recent_whispers.get(user_id, [])
            whisper = provider.generate_whisper(recent, island_state_dict, latest_artifact, avoid).strip()
            # 输出端安全网：LLM 低语意外命中风险词时降级为克制兜底句
            whisper = _scrub_generated(whisper, "海面没有起浪，岛屿安静地陪着你。")

    if not whisper:
        return WhisperResponse(show=False)

    # 更新去重缓冲（保留最近 5 条）
    buf = _recent_whispers.setdefault(user_id, [])
    buf.append(whisper)
    if len(buf) > _WHISPER_MEMORY_LIMIT:
        del buf[: -_WHISPER_MEMORY_LIMIT]

    artifact_key = latest_artifact["artifact"] if latest_artifact else ""
    artifact_label = latest_artifact["label"] if latest_artifact else ""
    return WhisperResponse(show=True, whisper=whisper, artifact=artifact_key, artifact_label=artifact_label)


@app.get("/api/phrases", response_model=PhraseListResponse)
def list_phrases(user_id: str = "demo-user") -> PhraseListResponse:
    """用户教过的所有私房安慰话。"""
    rows = phrase_service.get_all((user_id or "demo-user").strip() or "demo-user")
    return PhraseListResponse(phrases=[PhraseItem(**r) for r in rows])


@app.post("/api/phrases", response_model=PhraseItem)
def add_phrase(req: AddPhraseRequest) -> PhraseItem:
    """把一句重要他人的安慰话教给岛屿，绑定到某个情绪类别。"""
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    content = (req.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content 不能为空")
    if len(content) > 120:
        raise HTTPException(status_code=400, detail="content 过长（上限 120 字）")
    emotion = (req.emotion or "").strip().lower()
    if emotion not in EMOTION_ZH:
        raise HTTPException(status_code=400, detail="emotion 不在白名单内")
    attribution = (req.attribution or "").strip()[:24]
    try:
        row = phrase_service.add(user_id, emotion, content, attribution)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    logger.info("phrase add user=%s emotion=%s len=%d", user_id, emotion, len(content))
    return PhraseItem(**row)


@app.delete("/api/phrases/{phrase_id}")
def delete_phrase(phrase_id: int, user_id: str = "demo-user") -> Dict[str, Any]:
    """软删一条私房话——保留行但 is_active=0。"""
    ok = phrase_service.delete((user_id or "demo-user").strip() or "demo-user", phrase_id)
    if not ok:
        raise HTTPException(status_code=404, detail="未找到这条私房话")
    return {"ok": True}


@app.get("/api/island/revision", response_model=RevisionResponse)
def island_revision(user_id: str = "demo-user", force: bool = False) -> RevisionResponse:
    """岛屿修正信：LLM 回看昨日叙事，主动承认「那句说得不准确」。
    force=1 是演示开关，不看时间窗即触发判断。"""
    user_id = (user_id or "demo-user").strip() or "demo-user"
    # 拿最近 20 条找候选。高风险记忆（阈值或关键词命中）在选择前就剔除——
    # 否则一条高风险记忆恰好最接近时间窗会把整个修正信功能关闭(#12)，也避免 LLM 复述自伤原文(#4)
    memories = [m for m in memory_service.get_recent(user_id, 20) if not safety_service.memory_is_high_risk(m)]
    target = revision_service.pick_target(memories, force=force)
    if not target:
        return RevisionResponse(show=False)
    out = provider.generate_revision(target, lenient=force)
    if not out.get("needed"):
        return RevisionResponse(show=False)
    return RevisionResponse(
        show=True,
        kind=out.get("kind", ""),
        revision=out.get("revision", ""),
        target_emotion=target.get("emotion", ""),
        target_intensity=float(target.get("intensity", 0)),
        target_created_at=target.get("created_at", ""),
        target_narrative=target.get("narrative", "")[:240],
    )


class LetterRequest(BaseModel):
    user_id: str = "demo-user"


@app.post("/api/island/letter", response_model=LetterResponse)
def island_letter(req: LetterRequest) -> LetterResponse:
    """岛屿年报：LLM 读全部历史 + 物件，写一封 ~200 字第二人称温柔短信。
    无记忆时返回空。"""
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    memories = memory_service.get_all(user_id)
    if not memories:
        return LetterResponse()
    # 高风险记忆从年报素材里剔除，避免 LLM 把自伤原文写进信里(#4)
    safe_memories = [m for m in memories if not safety_service.memory_is_high_risk(m)]
    if not safe_memories:
        return LetterResponse()
    artifacts = artifact_service.get_all(user_id)
    # 时间倒序传给 LLM（get_all 已是最新在前）
    out = provider.generate_letter(safe_memories, artifacts)
    return LetterResponse(
        letter=out.get("letter", ""),
        observed_pattern=out.get("observed_pattern", ""),
        mentioned_artifacts=list(out.get("mentioned_artifacts", [])),
        memory_count=len(safe_memories),
        artifact_count=len(artifacts),
    )


@app.post("/api/island/act", response_model=IslandActResponse)
def island_act(req: IslandActRequest) -> IslandActResponse:
    """玩家选择一张岛屿回应卡：留下物件、返回反馈与更新后的岛屿状态。"""
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    card = ritual_service.resolve(req.choice_id)
    if not card:
        raise HTTPException(status_code=404, detail="未知的岛屿回应选择")

    saved = artifact_service.save(
        user_id=user_id,
        artifact=card["artifact"],
        label=ritual_service.artifact_label(card["artifact"]),
        emotion=card.get("emotion", ""),
    )

    recent = memory_service.get_recent(user_id, 10)
    total = memory_service.count_by_user(user_id)
    artifacts = artifact_service.distinct_keys(user_id)
    island_state = island_state_service.compute(recent, total, current=None, artifacts=artifacts)

    logger.info("island_act user=%s choice=%s artifact=%s", user_id, req.choice_id, card["artifact"])
    return IslandActResponse(artifact=ArtifactItem(**saved), reply=card["reply"], island_state=island_state)


@app.post("/api/reflect", response_model=ReflectResponse)
def reflect(req: ReflectRequest) -> ReflectResponse:
    user_id, text, ephemeral = _validate_reflect_request(req)
    _, response, _ = _run_reflect_idempotent(user_id, text, ephemeral, req.request_id)
    return response


@app.post("/api/identity/seed")
def seed_identity(req: SeedIdentityRequest) -> Dict[str, Any]:
    """为新身份注入种子记忆，让首访就能体验「岛屿记得你」的连续陪伴。
    幂等：仅当该 user_id 当前无记忆时才注入。"""
    user_id = (req.user_id or "demo-user").strip() or "demo-user"
    inserted = memory_service.seed_for_user(user_id, force=False)
    logger.info("identity_seed user=%s inserted=%s", user_id, inserted)
    return {"user_id": user_id, "inserted": inserted}


# —— WebSocket 流式：逐阶段计算并实时推送，让导演台「信使逐个抵达」——

_PIPELINE_END = object()


def _next_event(gen) -> Any:
    """在线程池里安全地取生成器下一个事件，取尽返回哨兵。"""
    try:
        return next(gen)
    except StopIteration:
        return _PIPELINE_END


def _cache_get(request_id: Optional[str]) -> Optional[tuple]:
    if not request_id:
        return None
    with _reflect_cache_lock:
        return _reflect_cache.get(request_id)


def _cache_put(request_id: str, value: tuple) -> None:
    with _reflect_cache_lock:
        _reflect_cache[request_id] = value
        while len(_reflect_cache) > _REFLECT_CACHE_MAX:
            _reflect_cache.popitem(last=False)


async def _replay_reflect(websocket: WebSocket, cached: tuple) -> None:
    """幂等命中：直接回放缓存事件 + done（不重算、不重新落库）。"""
    events, response, _ = cached
    for event_name, payload in events:
        await _send_ws_event(websocket, event_name, payload)
    await _send_ws_event(websocket, "done", {"result": response.model_dump()})
    await websocket.close()


async def _stream_reflect(
    websocket: WebSocket, user_id: str, text: str, ephemeral: bool, request_id: Optional[str],
) -> ReflectResponse:
    """逐阶段推进管道并实时推送事件。每个阶段（含最慢的叙事 LLM）在线程池里推进，
    阶段之间在事件循环上推送——前端因此看着情绪/记忆/环境先点亮，再等叙事。
    命中 __final__（save 已完成）时立刻落缓存：即便随后推送 memory/done 失败，
    HTTP 回退也能命中缓存而不二次落库。"""
    gen = _reflect_pipeline(user_id, text, ephemeral=ephemeral)
    collected: List[tuple[str, Dict[str, Any]]] = []
    response: Optional[ReflectResponse] = None
    while True:
        item = await asyncio.to_thread(_next_event, gen)
        if item is _PIPELINE_END:
            break
        event_name, payload = item
        if event_name == "__final__":
            response = payload["response"]
            if request_id:
                _cache_put(request_id, (list(collected), response, payload["saved"]))
            continue
        collected.append((event_name, payload))
        await _send_ws_event(websocket, event_name, payload)
    if response is None:  # 生成器必产出 __final__，理论上不会发生
        raise RuntimeError("reflect pipeline did not finalize")
    return response


def _chat_tools_for(user_id: str):
    """构造对话/助手 agent 的工具实现（user-scoped 闭包）。"""
    recent = memory_service.get_recent(user_id, 20)
    artifact_keys = artifact_service.distinct_keys(user_id)
    total = memory_service.count_by_user(user_id)

    def _recall(query: str):
        hist = _get_narrative_history(user_id, query, "", "", recent[:3])
        return [
            {"emotion": EMOTION_ZH.get(m.get("emotion", ""), m.get("emotion", "")),
             "summary": m.get("summary", ""), "said": (m.get("text", "") or "")[:50]}
            for m in hist[:3]
        ]

    def _island():
        st = island_state_service.compute(recent[:10], total, current=None, artifacts=artifact_keys)
        return {"growth_level": st.growth_level, "trend": st.trend,
                "dominant_emotion": EMOTION_ZH.get(st.dominant_emotion, st.dominant_emotion),
                "features": st.features, "summary": st.summary, "total_records": total}

    def _list_recent(limit: int = 8):
        n = max(1, min(20, int(limit or 8)))
        return [
            {"when": m.get("created_at", ""), "emotion": EMOTION_ZH.get(m.get("emotion", ""), m.get("emotion", "")),
             "summary": m.get("summary", "")}
            for m in recent[:n]
        ]

    return {"recall_memories": _recall, "read_island": _island, "list_recent_memories": _list_recent}


@app.post("/api/chat", response_model=IslandChatResponse)
def island_chat(req: IslandChatRequest) -> IslandChatResponse:
    """P2 多轮对话伙伴：带上整段对话历史，岛屿/精灵用工具型 agent 多轮回应。"""
    msgs = [
        {"role": "assistant" if t.role == "assistant" else "user", "content": t.content}
        for t in req.messages if t.content and t.content.strip()
    ][-12:]
    last_user = next((t.content for t in reversed(req.messages) if t.role == "user"), "")
    if not msgs or not last_user.strip():
        return IslandChatResponse(reply="我在这儿，慢慢说。")
    if safety_service.has_risk_keyword(last_user):  # 安全前置
        return IslandChatResponse(reply=SAFETY_MESSAGE, safety=Safety(triggered=True, message=SAFETY_MESSAGE))
    agent = ToolChatAgent(_chat_tools_for(req.user_id))
    reply, used = agent.run(CHAT_SYSTEM, msgs)
    reply = _scrub_generated(reply, "此刻就让岛屿静静陪着你，不必急着说什么。") or "我在听，慢慢说，不急。"
    logger.info("chat user=%s turns=%s tools=%s", req.user_id, len(msgs), used)
    return IslandChatResponse(reply=reply, tools_used=used)


@app.post("/api/agent/ask", response_model=AgentAskResponse)
def agent_ask(req: AgentAskRequest) -> AgentAskResponse:
    """P3 常驻助手：问『我最近怎么样』『回顾这周』，agent 调记忆/统计工具据实回答。"""
    q = (req.question or "").strip()
    if not q:
        return AgentAskResponse(answer="想问我点什么呢？比如『我最近怎么样』。")
    if safety_service.has_risk_keyword(q):
        return AgentAskResponse(answer=SAFETY_MESSAGE, safety=Safety(triggered=True, message=SAFETY_MESSAGE))
    agent = ToolChatAgent(_chat_tools_for(req.user_id), tools_spec=CHAT_TOOLS + [LIST_RECENT_TOOL])
    answer, used = agent.run(ASK_SYSTEM, [{"role": "user", "content": q}])
    answer = _scrub_generated(answer, "我先安静地陪着你。") or "我这会儿没接上信号，但我一直在你这座岛上。"
    logger.info("ask user=%s tools=%s", req.user_id, used)
    return AgentAskResponse(answer=answer, tools_used=used)


@app.websocket("/ws/reflect")
async def reflect_ws(websocket: WebSocket) -> None:
    # 同源校验：CORSMiddleware 不管 WS，必须在 accept 前自行兜底
    if not _origin_allowed(websocket.headers.get("origin")):
        logger.warning("ws origin rejected: %s", websocket.headers.get("origin"))
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        raw = await websocket.receive_json()
        req = ReflectRequest(**raw)
        user_id, text, ephemeral = _validate_reflect_request(req)
        request_id = req.request_id

        await _send_ws_event(websocket, "started", {"message": "岛屿开始聆听"})

        # 幂等命中：直接回放（WS 重连/重复提交，不重算不重新落库）
        cached = _cache_get(request_id)
        if cached is not None:
            await _replay_reflect(websocket, cached)
            return

        if request_id:
            # 取 per-id 锁与 HTTP 回退/重复 WS 串行化，避免重叠时重复落库
            with _reflect_cache_lock:
                inflight = _reflect_inflight.setdefault(request_id, threading.Lock())
            await asyncio.to_thread(inflight.acquire)
            try:
                cached = _cache_get(request_id)
                if cached is not None:
                    await _replay_reflect(websocket, cached)
                    return
                response = await _stream_reflect(websocket, user_id, text, ephemeral, request_id)
            finally:
                inflight.release()
                with _reflect_cache_lock:
                    _reflect_inflight.pop(request_id, None)
        else:
            response = await _stream_reflect(websocket, user_id, text, ephemeral, None)

        await _send_ws_event(websocket, "done", {"result": response.model_dump()})
        await websocket.close()
    except WebSocketDisconnect:
        # 客户端中途断开（如前端 15s 超时主动 close）——属正常路径，静默
        logger.info("reflect websocket disconnected")
    except (HTTPException, ValidationError) as e:
        detail = e.detail if isinstance(e, HTTPException) else "请求格式不正确"
        await _safe_ws_error(websocket, detail, 1008)
    except Exception:
        logger.exception("reflect websocket failed")
        await _safe_ws_error(websocket, "流式回应失败，请稍后重试", 1011)


async def _safe_ws_error(websocket: WebSocket, message: str, code: int) -> None:
    """向可能已关闭的连接发 error+close 时吞掉异常，避免对已断开的 socket 二次发送报栈。"""
    try:
        await _send_ws_event(websocket, "error", {"message": message})
        await websocket.close(code=code)
    except Exception:
        logger.info("reflect websocket already closed when reporting error")
