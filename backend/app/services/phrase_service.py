"""私房安慰话：用户把"从小到大谁对自己说过最有效的安慰"教给岛屿（PostgreSQL）。

破圈点：现有所有安慰话术都是 LLM 生成的"泛温柔"。这条让 AI 退到搬运工位置——
最有力的安慰其实来自重要他人，AI 只是替你保管。同类情绪再次出现时，
narrative 末尾会以加引号 + 归因的形式自然附上一句。

设计原则：
- 每条 phrase 必属于一种情绪类别（让附议精准命中）
- 附议加引号 + 归因（"你说妈妈对你这么说过"），AI 退场
- 不写入向量库、不进入 LLM prompt——它就是用户自己的话，不该被 AI 改写
"""

import random
from datetime import datetime
from typing import Any, Dict, List, Optional

from app import db


class PhraseService:
    def __init__(self) -> None:
        db.init_db()

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
        with db.connection() as conn:
            row = conn.execute(
                "INSERT INTO phrases (user_id, emotion, content, attribution, created_at) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING *",
                (user_id, emotion, content, attribution, created_at),
            ).fetchone()
        return self._row_to_dict(row)

    def get_all(self, user_id: str) -> List[Dict[str, Any]]:
        with db.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM phrases WHERE user_id = %s AND is_active = 1 ORDER BY id DESC",
                (user_id,),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def delete(self, user_id: str, phrase_id: int) -> bool:
        """硬删——兑现「收回」语义。没有恢复入口，软删只会让死行无限堆积(#14)。"""
        with db.connection() as conn:
            cur = conn.execute(
                "DELETE FROM phrases WHERE id = %s AND user_id = %s",
                (phrase_id, user_id),
            )
            return int(cur.rowcount or 0) > 0

    def delete_by_user_id(self, user_id: str) -> int:
        """硬删该用户全部私房话——供「删除我的全部记忆」隐私入口调用。返回删除条数。"""
        clean = (user_id or "").strip()
        if not clean:
            return 0
        with db.connection() as conn:
            cur = conn.execute("DELETE FROM phrases WHERE user_id = %s", (clean,))
            return int(cur.rowcount if cur.rowcount is not None else 0)

    def pick_for(self, user_id: str, emotion: str) -> Optional[Dict[str, Any]]:
        """挑一条匹配情绪的私房安慰话——多条则随机，让回应有惊喜感。"""
        with db.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM phrases WHERE user_id = %s AND emotion = %s AND is_active = 1",
                (user_id, emotion),
            ).fetchall()
        if not rows:
            return None
        return self._row_to_dict(random.choice(rows))

    @staticmethod
    def _row_to_dict(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not row:
            return {}
        return {
            "id": int(row["id"]),
            "user_id": row["user_id"],
            "emotion": row["emotion"],
            "content": row["content"],
            "attribution": row["attribution"],
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
        }
