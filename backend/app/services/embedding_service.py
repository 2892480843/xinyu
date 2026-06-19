"""本地文本 embedding（fastembed / ONNX）。

把倾诉文本编码成向量，供 pgvector 做语义检索。完全本地、可离线（模型首次
下载后缓存到本机），无需任何 API Key——契合「断网/无密钥也能 demo」的产品调性。

任何一步不可用（禁用 / 模型加载失败 / 编码失败）都返回 None，让向量检索优雅
降级回「最近记忆」，绝不阻塞 reflect 主流程。模型采用懒加载：仅在首次真正需要
向量时才加载，保证后端启动迅速、且关闭向量时零额外开销。
"""

import logging
import threading
from typing import List, Optional

from app import config

logger = logging.getLogger("xinyu.embedding")


class EmbeddingService:
    def __init__(self) -> None:
        self._model = None
        self._load_attempted = False
        self._lock = threading.Lock()
        self._enabled = config.VECTOR_ENABLED
        if not self._enabled:
            logger.info("向量检索按配置禁用 (VECTOR_ENABLED=0)")

    def _ensure_model(self) -> None:
        """首次需要时加载模型；失败只记一次告警并永久降级。"""
        if not self._enabled or self._model is not None or self._load_attempted:
            return
        with self._lock:
            if self._model is not None or self._load_attempted:
                return
            self._load_attempted = True
            try:
                from fastembed import TextEmbedding  # 延迟导入：禁用向量时不付出导入成本

                self._model = TextEmbedding(model_name=config.EMBEDDING_MODEL)
                logger.info(
                    "embedding 模型就绪：model=%s dim=%s",
                    config.EMBEDDING_MODEL, config.EMBEDDING_DIM,
                )
            except Exception as e:
                logger.warning("embedding 模型加载失败，语义检索降级为最近记忆：%s", e)
                self._model = None

    @property
    def available(self) -> bool:
        if not self._enabled:
            return False
        self._ensure_model()
        return self._model is not None

    def embed(self, text: str) -> Optional[List[float]]:
        """返回文本向量（List[float]，长度 = EMBEDDING_DIM）；不可用或失败时返回 None。"""
        if not self.available:
            return None
        clean = (text or "").strip()
        if not clean:
            return None
        try:
            # fastembed 模型非线程安全，编码串行化；单条文本开销可忽略。
            with self._lock:
                vector = next(iter(self._model.embed([clean])))
            return [float(x) for x in vector]
        except Exception as e:
            logger.warning("embedding 编码失败，本次跳过向量写入/检索：%s", e)
            return None
