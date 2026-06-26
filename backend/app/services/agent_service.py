"""真·工具型 Agent（P1）。

用 OpenAI 兼容的 function-calling 让模型**自主决定**调用哪些工具
（反思 agent 走 config.OPENAI_*／可指向混元；对话 agent 走 config.CHAT_*／DeepSeek）：
- recall_memories：语义检索这位用户的过往心情（pgvector）
- read_island：读取 ta 的心象岛屿当前状态
然后调用 compose_reflection 产出最终反思。

替换原先写死的「情绪→记忆→叙事」三段固定 LLM 调用：现在是一条真实的工具循环，
每一步工具调用都会被 yield 出去（供导演台显示真实推理链）。模型不支持/网络异常时
逐层降级，保证不挂死。
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

import httpx

from app import config
from app.services.healing_kb import compose_system_prompt

logger = logging.getLogger("xinyu.agent")

EMOTIONS = ["sad", "anxious", "tired", "lonely", "calm", "happy", "angry", "helpless"]

# 共用一个模块级 httpx.Client：AgentReflectionService / ToolChatAgent 每请求都新建实例，
# 若各自 new client，则每个 /api/reflect|chat|agent/ask 都对 LLM API 重做 TCP+TLS 握手、且从不 close
# → 连接泄漏 + 每请求多花 ~100-300ms 握手。共用单例 → 连接池跨请求 keep-alive 复用。
# httpx.Client 线程安全，适配 FastAPI 同步端点的线程池并发；连接池按 host 分键，可同时服务
# dashscope(reflect) 与 deepseek(chat) 两条通道。
_shared_client: Optional[httpx.Client] = None


def _get_client() -> httpx.Client:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.Client(
            timeout=config.LLM_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=64),
        )
    return _shared_client

TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "recall_memories",
            "description": (
                "语义检索这位用户过往的心情记忆。当用户此刻的话可能呼应过去经历、"
                "或你想给出『岛屿还记得你上次…』式回应时调用。第一次相遇可以不调。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "概括用户当下心情的检索词，如『工作压力 焦虑』"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_island",
            "description": (
                "读取这位用户的心象岛屿当前状态：成长等级、情绪趋势、主导情绪、已长出的元素。"
                "当你想在叙事里呼应岛屿环境或成长时调用。"
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compose_reflection",
            "description": (
                "在你已经理解了情绪、并按需查过记忆/读过岛屿之后，产出最终回应。"
                "这是结束动作，调用即代表流程完成。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "emotion": {"type": "string", "enum": EMOTIONS, "description": "八种情绪之一"},
                    "intensity": {"type": "number", "description": "0.0 到 1.0 的浮点，情绪强度"},
                    "summary": {"type": "string", "description": "不超过 12 字的中文情绪概括"},
                    "narrative": {
                        "type": "string",
                        "description": (
                            "50-120 字温柔治愈叙事，有画面感（海、雾、灯塔、潮汐…），克制；"
                            "绝不说教、不承诺『一定会好』、不做诊断或医疗建议。"
                        ),
                    },
                    "imprint": {"type": "string", "description": "20 字以内一句『心灵印记』，可留空"},
                },
                "required": ["emotion", "intensity", "summary", "narrative"],
            },
        },
    },
]

REFLECT_PERSONA = (
    "你是《心屿》——一座会回应用户心情的岛屿的意识。用户刚刚对你说了一段心情。\n"
    "你有两个工具可按需调用：recall_memories（查 ta 的过往心情）、read_island（读 ta 的心象岛屿状态）。\n"
    "像一个体贴克制的倾听者那样思考：先判断要不要查记忆 / 读岛屿（不是每次都需要，"
    "第一次相遇或闲谈可以不查），拿到需要的信息后，再调用 compose_reflection 给出最终回应。\n"
    "compose_reflection 的 narrative：50-120 字，温柔、有画面感；若查到过往记忆可自然呼应"
    "（如「你上次也提过…」），但不要硬塞。"
)

# 由治愈知识库统一组装：人设 + 岛屿语气 + 倾听原则 + 八情绪侧重 + 硬边界（单一可信源）
SYSTEM_PROMPT = compose_system_prompt(REFLECT_PERSONA, playbook=True)


class AgentReflectionService:
    """工具型反思 agent。

    tools_impl: {"recall_memories": fn(query: str) -> Any, "read_island": fn() -> Any}
    run() 是生成器，yield：
      ("tool", {"name", "args", "result"})         —— 一次工具调用 + 真实结果
      ("final", {"emotion","intensity","summary","narrative","imprint","steps"})  —— 最终反思
    """

    def __init__(self, tools_impl: Dict[str, Callable[..., Any]]):
        self._tools = tools_impl
        self._client = _get_client()  # 共用模块级单例,跨请求复用连接(见 _get_client)

    @property
    def available(self) -> bool:
        return config.LLM_PROVIDER == "openai" and bool(config.OPENAI_API_KEY)

    def run(self, text: str, recent_hint: str = "") -> Iterator[Tuple[str, Dict[str, Any]]]:
        """异常安全包装：内部任何环节出错都降级为一条 fallback final，绝不向上抛、绝不挂死流。"""
        try:
            yield from self._run(text, recent_hint)
        except Exception as exc:
            logger.warning("agent run failed, fallback: %s", exc)
            yield ("final", {**self._fallback(""), "steps": 0})

    def _run(self, text: str, recent_hint: str = "") -> Iterator[Tuple[str, Dict[str, Any]]]:
        user = text if not recent_hint else f"{text}\n\n（背景：{recent_hint}）"
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ]
        steps = 0
        max_steps = max(2, int(getattr(config, "AGENT_MAX_STEPS", 6)))
        deadline = time.monotonic() + float(getattr(config, "AGENT_TIME_BUDGET", 45))
        for _ in range(max_steps):
            if time.monotonic() > deadline:
                # 时间预算耗尽 → 强制结构化收尾，避免单请求长时间占用同步线程池 worker
                composed = self._force_compose(messages, fallback_text="")
                yield ("final", {**composed, "steps": steps})
                return
            msg = self._chat(messages, force_compose=False)
            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                # 模型直接回了文本而没调工具 → 再强制要一次结构化 compose
                composed = self._force_compose(messages, fallback_text=msg.get("content", ""))
                yield ("final", {**composed, "steps": steps})
                return
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tool_calls})
            for tc in tool_calls:
                name = tc.get("function", {}).get("name", "")
                try:
                    args = json.loads(tc.get("function", {}).get("arguments") or "{}")
                except Exception:
                    args = {}
                if name == "compose_reflection":
                    yield ("final", {**self._normalize(args), "steps": steps})
                    return
                impl = self._tools.get(name)
                try:
                    result = impl(**args) if impl else {"error": f"unknown tool {name}"}
                except Exception as exc:  # 工具自身异常不该让 agent 挂死
                    logger.warning("agent tool %s failed: %s", name, exc)
                    result = {"error": str(exc)}
                steps += 1
                yield ("tool", {"name": name, "args": args, "result": result})
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False)[:2400],
                    }
                )
        # 步数耗尽 → 强制结束
        composed = self._force_compose(messages, fallback_text="")
        yield ("final", {**composed, "steps": steps})

    # ── 内部 ──
    def _chat(self, messages: List[Dict[str, Any]], force_compose: bool) -> Dict[str, Any]:
        payload = {
            "model": config.OPENAI_MODEL,
            "messages": messages,
            "tools": TOOLS,
            "tool_choice": (
                {"type": "function", "function": {"name": "compose_reflection"}} if force_compose else "auto"
            ),
            "temperature": 0.7,
        }
        headers = {"Authorization": f"Bearer {config.OPENAI_API_KEY}"}
        url = config.OPENAI_BASE_URL.rstrip("/") + "/chat/completions"
        resp = self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]

    def _force_compose(self, messages: List[Dict[str, Any]], fallback_text: str) -> Dict[str, Any]:
        try:
            forced = self._chat(
                messages + [{"role": "user", "content": "请现在调用 compose_reflection 给出结构化的最终回应。"}],
                force_compose=True,
            )
            for tc in forced.get("tool_calls") or []:
                if tc.get("function", {}).get("name") == "compose_reflection":
                    return self._normalize(json.loads(tc["function"]["arguments"] or "{}"))
        except Exception as exc:
            logger.warning("agent force_compose failed: %s", exc)
        return self._fallback(fallback_text)

    def _normalize(self, args: Dict[str, Any]) -> Dict[str, Any]:
        emo = str(args.get("emotion", "calm")).strip().lower()
        if emo not in EMOTIONS:
            emo = "calm"
        try:
            inten = float(args.get("intensity", 0.5))
        except Exception:
            inten = 0.5
        if inten > 1.0:  # 容错：模型偶尔给 0-10
            inten = inten / 10.0
        inten = max(0.0, min(1.0, inten))
        imprint = args.get("imprint")
        imprint = str(imprint).strip() if imprint else ""
        return {
            "emotion": emo,
            "intensity": round(inten, 2),
            "summary": str(args.get("summary") or "心情有了波动")[:40],
            "narrative": str(args.get("narrative") or "").strip(),
            "imprint": imprint or None,
        }

    def _fallback(self, content: str) -> Dict[str, Any]:
        narrative = (content or "").strip() or "此刻就让岛屿静静陪着你，不必急着把现在拼成一个名字。"
        return {
            "emotion": "calm",
            "intensity": 0.5,
            "summary": "心情有了波动",
            "narrative": narrative[:220],
            "imprint": None,
        }


# ── P2 多轮对话 / P3 常驻助手 共用的工具型对话 agent ──

CHAT_TOOLS = TOOLS[:2]  # recall_memories + read_island（去掉 compose）

LIST_RECENT_TOOL = {
    "type": "function",
    "function": {
        "name": "list_recent_memories",
        "description": "按时间倒序列出这位用户最近的若干条心情记录（情绪 + 概括 + 时间）。回顾『最近 / 这周怎么样』时调用。",
        "parameters": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "description": "取几条，默认 8"}},
        },
    },
}

CHAT_PERSONA = (
    "你是《心屿》——一座会回应用户心情的岛屿，与岛上那只温柔小精灵的合体意识，正在和用户多轮聊天。\n"
    "可调用 recall_memories 查 ta 的过往心情、read_island 读 ta 的岛屿状态，让回应更贴近 ta（不必每轮都查）。\n"
    "每次回复 1-3 句，口语、自然，像一个真正在听的朋友。\n"
    "若 ta 透露强烈的自伤 / 危机念头，温柔引导 ta 联系专业帮助（如心理援助热线），不展开其它话题。"
)
CHAT_SYSTEM = compose_system_prompt(CHAT_PERSONA, playbook=True)

ASK_PERSONA = (
    "你是《心屿》的岛屿助手。用户会问关于 ta 自己状态的问题（如「我最近怎么样」「帮我回顾这周」「我焦虑的时候多吗」）。\n"
    "请调用 list_recent_memories / recall_memories / read_island 获取 ta 的**真实数据**，再据实、温柔地回答——"
    "基于数据，不编造；若没有记录就如实说还没有。\n"
    "回答 2-4 句，温柔、具体（可点出情绪倾向、岛屿成长）。"
)
# 助手以「据实回顾」为主，保持轻量：注入语气与边界，省去成段倾听原则，控 token
ASK_SYSTEM = compose_system_prompt(ASK_PERSONA, principles=False)


class ToolChatAgent:
    """通用工具型对话 agent：跑工具循环，最后返回纯文本回复 + 实际用过的工具名。
    P2 多轮对话伙伴与 P3 常驻助手共用（传不同 system / tools_spec）。异常安全：失败返回空串。"""

    def __init__(self, tools_impl: Dict[str, Callable[..., Any]], tools_spec: Optional[List[Dict[str, Any]]] = None):
        self._tools = tools_impl
        self._spec = tools_spec or CHAT_TOOLS
        self._client = _get_client()  # 共用模块级单例,跨请求复用连接(见 _get_client)

    @property
    def available(self) -> bool:
        # 对话走独立的 DeepSeek 通道（config.CHAT_*，未配 DeepSeek 时回落 OPENAI_*）。
        return bool(config.CHAT_API_KEY)

    def run(self, system: str, messages: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
        used: List[str] = []
        # provider 不可用（LLM_PROVIDER != openai 或无 API key）时直接返回空串——
        # 不发起注定失败的 HTTP 请求（Bearer 头非法会抛 Illegal header value）。
        # 调用方据此走 Mock/兜底回复，保证离线模式也能有入戏陪伴，而非静默空串。
        if not self.available:
            return "", used
        msgs: List[Dict[str, Any]] = [{"role": "system", "content": system}] + list(messages)
        max_steps = max(2, int(getattr(config, "AGENT_MAX_STEPS", 6)))
        deadline = time.monotonic() + float(getattr(config, "AGENT_TIME_BUDGET", 45))
        try:
            for _ in range(max_steps):
                if time.monotonic() > deadline:
                    break  # 时间预算耗尽 → 跳出，由下方「强制纯文本收尾」结束
                m = self._chat(msgs, with_tools=True)
                tcs = m.get("tool_calls") or []
                if not tcs:
                    return (m.get("content") or "").strip(), used
                msgs.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": tcs})
                for tc in tcs:
                    name = tc.get("function", {}).get("name", "")
                    try:
                        args = json.loads(tc.get("function", {}).get("arguments") or "{}")
                    except Exception:
                        args = {}
                    used.append(name)
                    impl = self._tools.get(name)
                    try:
                        result = impl(**args) if impl else {"error": f"unknown {name}"}
                    except Exception as exc:
                        logger.warning("chat tool %s failed: %s", name, exc)
                        result = {"error": str(exc)}
                    msgs.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False)[:2400],
                    })
            # 步数耗尽：强制无工具纯文本收尾
            m = self._chat(msgs + [{"role": "user", "content": "（请直接用一两句话回应，不再调用工具）"}], with_tools=False)
            return (m.get("content") or "").strip(), used
        except Exception as exc:
            logger.warning("ToolChatAgent run failed: %s", exc)
            return "", used

    def _chat(self, messages: List[Dict[str, Any]], with_tools: bool) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"model": config.CHAT_MODEL, "messages": messages, "temperature": 0.8}
        if with_tools:
            payload["tools"] = self._spec
            payload["tool_choice"] = "auto"
        headers = {"Authorization": f"Bearer {config.CHAT_API_KEY}"}
        url = config.CHAT_BASE_URL.rstrip("/") + "/chat/completions"
        resp = self._client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]
