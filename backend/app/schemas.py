from typing import List, Optional
from pydantic import BaseModel, Field


class ReflectRequest(BaseModel):
    user_id: str = Field(default="demo-user")
    text: str = Field(max_length=2000)  # 硬上限：防绕过前端直接打 API 造成 LLM 成本爆炸/注入放大
    # 无痕模式：勾选后岛屿不写记忆、不更新岛屿状态、不留物件——情绪陪伴价值 100%，数据价值 0%
    ephemeral: bool = False
    # 幂等键：客户端每次提交生成一个唯一 id；WS 超时回退 HTTP 时带同一个 id，
    # 后端据此去重，避免同一条倾诉被二次执行/重复落库。
    request_id: Optional[str] = None


class Scene(BaseModel):
    time: str
    weather: str
    palette: str
    music: str
    imagery: List[str] = []


class Safety(BaseModel):
    triggered: bool = False
    message: Optional[str] = None


class IslandState(BaseModel):
    """心象岛屿状态：用户情绪历史聚合成的可视化游戏世界状态。"""

    dominant_emotion: str = "calm"
    trend: str = "stable"  # recovering | brightening | stormy | stable | mixed
    growth_level: int = 1  # 1-5，随记忆数量增长
    features: List[str] = []  # 岛屿元素，例如 lighthouse / flowers / stars
    weather_memory: str = "clearing_sky"  # recent_rain | misty | clearing_sky | ...
    summary: str = ""  # 给用户看的岛屿状态一句话
    chapter: str = ""  # 章节导语：岛屿的「去向 / 在等待什么」，描述性、不预测不承诺好转


class AgentTraceItem(BaseModel):
    """多智能体导演台的单个 Agent 处理轨迹。"""

    agent: str  # emotion | memory | environment | narrative | safety
    label: str  # 中文展示名，例如「情绪分析 Agent」
    status: str = "done"  # waiting | running | done
    output: str = ""  # 可读的处理结果摘要


class IslandChoice(BaseModel):
    """岛屿回应选择卡：一种面对情绪的方式 + 对应的岛屿仪式 + 留下的物件。"""

    id: str
    stance: str  # 面对情绪的方式，例如「在吊床上歇下」
    ritual: str  # 岛屿仪式，例如「升起一盏暖灯」
    artifact: str  # 物件 key，例如 lantern
    reply: str  # 选择后的反馈叙事
    rare: bool = False  # 是否「此刻限定」的稀缺仪式（只在特定趋势/章节出现）


class ArtifactItem(BaseModel):
    """玩家在岛上留下的物件（收藏物）。"""

    id: int
    user_id: str
    artifact: str
    label: str
    emotion: str
    created_at: str
    inscription: str = ""  # 玩家在物件上刻下的一句给自己的话，岛屿会在未来还给 ta


class EchoPhrase(BaseModel):
    """私房安慰话回响——当用户教过同类情绪的安慰话时，岛屿在叙事后加引号附议。"""

    content: str
    attribution: str = ""
    emotion: str = ""


class ReflectResponse(BaseModel):
    emotion: str
    intensity: float
    summary: str
    scene: Scene
    island_state: IslandState
    agent_trace: List[AgentTraceItem] = []
    choices: List[IslandChoice] = []  # 岛屿回应选择卡；高风险或无痕模式时为空
    narrative: str = ""
    imprint: Optional[str] = None
    memory_hint: Optional[str] = None
    safety: Safety
    ephemeral: bool = False  # 此次是否走了无痕模式，前端据此显示「岛屿不会记得这次」标记
    echo_phrase: Optional[EchoPhrase] = None  # 用户教过的私房安慰话，按情绪匹配后由岛屿引用


class IslandActResponse(BaseModel):
    """玩家选择岛屿仪式后的返回：留下的物件 + 反馈 + 更新后的岛屿状态。"""

    artifact: ArtifactItem
    reply: str
    island_state: IslandState


class WelcomeBackResponse(BaseModel):
    """离岛信件：用户超过阈值时长没回来时，岛屿给一句温柔的"我替你看着"。"""

    show: bool = False
    message: str = ""
    hours_away: int = 0
    artifact: str = ""  # 物件 key，前端按 FEATURE_META 取图标
    artifact_label: str = ""


class WhisperResponse(BaseModel):
    """岛屿主动低语：进入岛屿但还没说话时，岛屿主动一句话。"""

    show: bool = False
    whisper: str = ""
    artifact: str = ""
    artifact_label: str = ""


class LetterResponse(BaseModel):
    """岛屿年报：LLM 读全部记忆 + 物件后给的一封 180-220 字温柔短信。"""

    letter: str = ""
    observed_pattern: str = ""
    mentioned_artifacts: List[str] = []
    memory_count: int = 0
    artifact_count: int = 0


class PhraseItem(BaseModel):
    id: int
    user_id: str
    emotion: str
    content: str
    attribution: str = ""
    is_active: bool = True
    created_at: str


class PhraseListResponse(BaseModel):
    phrases: List[PhraseItem] = []


class AddPhraseRequest(BaseModel):
    user_id: str = "demo-user"
    emotion: str
    content: str = Field(max_length=500)
    attribution: str = Field(default="", max_length=80)


class GlyphDynamics(BaseModel):
    """书写动力学：前端捕捉的笔速/停顿/抖动。"""

    avg_speed: float = 0.0  # px/s
    duration_ms: int = 0
    stroke_count: int = 0
    pause_count: int = 0
    jitter: float = 0.0  # 0-1 抖动指数


class GlyphReadRequest(BaseModel):
    user_id: str = "demo-user"
    char: str  # 用户描红写下的那个心境字
    dynamics: GlyphDynamics = GlyphDynamics()


class GlyphResponse(BaseModel):
    """手写一字读心：情绪 + 强度 + 读懂这个字时心情的一句话 + 留下的心境石。"""

    char: str
    emotion: str
    intensity: float
    reading: str
    artifact: ArtifactItem


class CompanionChatRequest(BaseModel):
    """专属精灵对话：前端带上本地精灵状态，后端只负责生成安全、入戏的一句回应。"""

    user_id: str = "demo-user"
    message: str = Field(max_length=1000)
    companion_name: str = "微光"
    affinity: int = 0
    emotion: str = "calm"
    feed_count: int = 0
    talk_count: int = 0
    unlocked_secrets: List[str] = Field(default_factory=list)


class CompanionChatResponse(BaseModel):
    """专属精灵大模型回应。prompt_version 便于之后调 prompt 时做回归追踪。"""

    reply: str = ""
    emotion: str = "calm"
    animation: str = "BondGlow"
    safety: Safety = Safety()
    prompt_version: str = "xinyu-companion-v1"


class RevisionResponse(BaseModel):
    """岛屿修正信：LLM 回看昨日叙事，主动承认"我那句说得不准确"。"""

    show: bool = False
    kind: str = ""  # too_heavy | too_light | off_topic
    revision: str = ""
    target_emotion: str = ""
    target_intensity: float = 0.0
    target_created_at: str = ""
    target_narrative: str = ""


class MemoryItem(BaseModel):
    id: int
    user_id: str
    text: str
    emotion: str
    intensity: float
    summary: str
    narrative: str
    imprint: Optional[str] = None
    created_at: str


class MemoryListResponse(BaseModel):
    memories: List[MemoryItem]


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str = Field(max_length=2000)


class IslandChatRequest(BaseModel):
    """主页多轮对话（P2）：带上整段对话历史，岛屿/精灵多轮回应。"""

    user_id: str = "demo-user"
    messages: List[ChatTurn] = Field(default_factory=list, max_length=60)  # 限制历史轮数，防超长上下文


class IslandChatResponse(BaseModel):
    reply: str = ""
    safety: Safety = Safety()
    tools_used: List[str] = Field(default_factory=list)  # 本轮 agent 实际调用过的工具
    run_id: Optional[int] = None


class AgentAskRequest(BaseModel):
    """常驻 AI 助手（P3）：用户随时提问，agent 调记忆/统计工具作答。"""

    user_id: str = "demo-user"
    question: str = Field(max_length=2000)


class AgentAskResponse(BaseModel):
    answer: str = ""
    tools_used: List[str] = Field(default_factory=list)
    safety: Safety = Safety()
    run_id: Optional[int] = None


class AgentFeedbackRequest(BaseModel):
    run_id: int
    user_id: str = "demo-user"
    rating: str
    reason: str = Field(default="", max_length=120)
    free_text: str = Field(default="", max_length=500)


class AgentFeedbackResponse(BaseModel):
    id: int
    run_id: int
    user_id: str
    rating: str
    reason: str = ""
    free_text: str = ""
    created_at: str
