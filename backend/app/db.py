"""PostgreSQL 连接池 + schema 初始化（含 pgvector）。

全项目唯一的持久化入口：memories / artifacts / phrases 三张关系表，外加
pgvector 的 memory_vectors 语义索引表。psycopg3 连接池本身线程安全，取代了
旧 SQLite 实现里每个 service 各自维护的 threading.Lock + WAL pragma——并发
由 Postgres 负责，原子性由事务（`with db.connection()` 即一个事务）负责。

向量列维度在建表时即固定为 config.EMBEDDING_DIM；若 pgvector 扩展不可用，
关系表照常工作，仅 memory_vectors 不建、VECTOR_AVAILABLE=False，语义检索降级。
"""

import logging
import threading
from contextlib import contextmanager
from typing import Iterator, Optional

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app import config

logger = logging.getLogger("xinyu.db")

# pgvector 扩展是否就绪（建表阶段探测）。向量服务据此判断能否做语义检索。
VECTOR_AVAILABLE = False

_pool: Optional[ConnectionPool] = None
_lock = threading.Lock()


# —— schema DDL（全部 IF NOT EXISTS，可重复执行）——

_RELATIONAL_DDL = (
    """
    CREATE TABLE IF NOT EXISTS memories (
        id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id    TEXT NOT NULL,
        text       TEXT NOT NULL,
        emotion    TEXT NOT NULL,
        intensity  DOUBLE PRECISION NOT NULL,
        summary    TEXT NOT NULL,
        narrative  TEXT NOT NULL DEFAULT '',
        imprint    TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories (user_id, id DESC)",
    """
    CREATE TABLE IF NOT EXISTS artifacts (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id     TEXT NOT NULL,
        artifact    TEXT NOT NULL,
        label       TEXT NOT NULL DEFAULT '',
        emotion     TEXT NOT NULL DEFAULT '',
        inscription TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts (user_id, id DESC)",
    """
    CREATE TABLE IF NOT EXISTS phrases (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id     TEXT NOT NULL,
        emotion     TEXT NOT NULL,
        content     TEXT NOT NULL,
        attribution TEXT NOT NULL DEFAULT '',
        is_active   SMALLINT NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_phrases_user_emotion ON phrases (user_id, emotion) WHERE is_active = 1",
)


def _create_schema(conn: psycopg.Connection) -> None:
    """建关系表与（可用时）pgvector 向量表。在事务内执行。"""
    global VECTOR_AVAILABLE
    with conn.cursor() as cur:
        for ddl in _RELATIONAL_DDL:
            cur.execute(ddl)

        if config.VECTOR_ENABLED:
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
                cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
                VECTOR_AVAILABLE = cur.fetchone() is not None
            except Exception as e:  # 无建扩展权限 / 未安装 pgvector
                logger.warning("pgvector 扩展不可用，语义检索将降级为最近记忆：%s", e)
                VECTOR_AVAILABLE = False

            if VECTOR_AVAILABLE:
                # 向量维度随 embedding 模型固定；HNSW + cosine 用于近邻检索。
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS memory_vectors (
                        memory_id  BIGINT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
                        user_id    TEXT NOT NULL,
                        emotion    TEXT NOT NULL,
                        intensity  DOUBLE PRECISION NOT NULL,
                        created_at TEXT NOT NULL,
                        embedding  vector({int(config.EMBEDDING_DIM)}) NOT NULL
                    )
                    """
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_memory_vectors_user ON memory_vectors (user_id)"
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_memory_vectors_embedding "
                    "ON memory_vectors USING hnsw (embedding vector_cosine_ops)"
                )
        else:
            VECTOR_AVAILABLE = False


def init_db() -> None:
    """幂等初始化：建 schema（一次性连接）后打开连接池。已初始化则直接返回。"""
    global _pool
    if _pool is not None:
        return
    with _lock:
        if _pool is not None:
            return
        # 1) 先用一条临时连接建扩展/表（建表不依赖连接池，避免鸡生蛋问题）。
        with psycopg.connect(config.DATABASE_URL) as conn:
            _create_schema(conn)
            conn.commit()
        # 2) 打开连接池供后续所有读写复用（dict_row 让查询结果即为 dict）。
        pool = ConnectionPool(
            conninfo=config.DATABASE_URL,
            min_size=config.PG_POOL_MIN,
            max_size=config.PG_POOL_MAX,
            kwargs={"row_factory": dict_row},
            name="xinyu-pool",
            open=False,
        )
        pool.open()
        _pool = pool
        logger.info(
            "PostgreSQL 连接池就绪 (min=%s max=%s vector=%s)",
            config.PG_POOL_MIN, config.PG_POOL_MAX, VECTOR_AVAILABLE,
        )


def close_pool() -> None:
    """关闭连接池（FastAPI 关停 / 测试间清理时调用）。"""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    """从连接池借一条连接；with 块即一个事务，正常退出自动提交、异常自动回滚。"""
    if _pool is None:
        init_db()
    assert _pool is not None
    with _pool.connection() as conn:
        yield conn


def advisory_xact_lock(cur: psycopg.Cursor, key: str) -> None:
    """按字符串 key 取事务级建议锁，序列化同一用户的「先删后插」原子重置，
    避免前端 StrictMode 并发双调用把种子轨迹插成两套。"""
    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", (key,))
