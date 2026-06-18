"""私房安慰话：用户把"从小到大谁对自己说过最有效的安慰"教给岛屿。

破圈点：现有所有安慰话术都是 LLM 生成的"泛温柔"。这条让 AI 退到搬运工位置——
最有力的安慰其实来自重要他人，AI 只是替你保管。同类情绪再次出现时，
narrative 末尾会以加引号 + 归因的形式自然附上一句。

设计原则：
- 每条 phrase 必属于一种情绪类别（让附议精准命中）
- 附议加引号 + 归因（"你说妈妈对你这么说过"），AI 退场
- 不写入向量库、不进入 LLM prompt——它就是用户自己的话，不该被 AI 改写
"""

import os
import random
import sqlite3
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

from app import config


class PhraseService:
    def __init__(self) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(config.MEMORY_DB)), exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(config.MEMORY_DB, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS phrases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    emotion TEXT NOT NULL,
                    content TEXT NOT NULL,
                    attribution TEXT NOT NULL DEFAULT '',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    # 与 8 类情绪白名单一致——service 层也校验，避免任何调用方绕过路由写入 pick_for 永不命中的脏 emotion(#18)
    _EMOTIONS = {"sad", "anxious", "tired", "lonely", "calm", "happy", "angry", "helpless"}

    def add(
        self, user_id: str, emotion: str, content: str, attribution: str = ""
    ) -> Dict[str, Any]:
        user_id = (user_id or "").strip() or "demo-user"
        emotion = (emotion or "").strip().lower()
        content = (content or "").strip()[:120]
        attribution = (attribution or "").strip()[:24]
        if not content:
            raise ValueError("content 不能为空")
        if emotion not in self._EMOTIONS:
            raise ValueError("emotion 不在白名单内")
        created_at = datetime.utcnow().isoformat() + "Z"
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO phrases (user_id, emotion, content, attribution, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, emotion, content, attribution, created_at),
            )
            conn.commit()
            row = self._row_to_dict(
                conn.execute("SELECT * FROM phrases WHERE id = ?", (cur.lastrowid,)).fetchone()
            )
        return row

    def get_all(self, user_id: str) -> List[Dict[str, Any]]:
        with self._lock, self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM phrases WHERE user_id = ? AND is_active = 1 ORDER BY id DESC",
                (user_id,),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def delete(self, user_id: str, phrase_id: int) -> bool:
        """硬删——兑现「收回」语义。没有恢复入口，软删只会让死行无限堆积(#14)。"""
        with self._lock, self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM phrases WHERE id = ? AND user_id = ?",
                (phrase_id, user_id),
            )
            conn.commit()
            return cur.rowcount > 0

    def delete_by_user_id(self, user_id: str) -> int:
        """硬删该用户全部私房话——供「删除我的全部记忆」隐私入口调用。返回删除条数。"""
        clean = (user_id or "").strip()
        if not clean:
            return 0
        with self._lock, self._conn() as conn:
            cur = conn.execute("DELETE FROM phrases WHERE user_id = ?", (clean,))
            conn.commit()
            return int(cur.rowcount if cur.rowcount is not None else 0)

    def pick_for(self, user_id: str, emotion: str) -> Optional[Dict[str, Any]]:
        """挑一条匹配情绪的私房安慰话——多条则随机，让回应有惊喜感。"""
        with self._lock, self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM phrases WHERE user_id = ? AND emotion = ? AND is_active = 1",
                (user_id, emotion),
            ).fetchall()
        if not rows:
            return None
        return self._row_to_dict(random.choice(rows))

    @staticmethod
    def _row_to_dict(row: Optional[sqlite3.Row]) -> Dict[str, Any]:
        if row is None:
            return {}
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "emotion": row["emotion"],
            "content": row["content"],
            "attribution": row["attribution"],
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
        }
