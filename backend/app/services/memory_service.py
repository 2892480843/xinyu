"""情绪记忆服务：PostgreSQL 持久化。

并发与原子性交给 Postgres：每个 `with db.connection()` 块即一个事务，连接池本身
线程安全，故不再需要旧 SQLite 实现里的 threading.Lock / WAL。schema 由 app.db
集中建表，本服务只负责读写与种子数据。
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app import db


class MemoryService:
    def __init__(self) -> None:
        # 不在构造（import 时）连库——延迟到 app lifespan startup 显式初始化，
        # 避免部署时 DB 短暂不可达导致模块 import 直接崩溃、整个进程起不来。
        pass

    def ensure_demo_seed(self) -> None:
        """首次启动为 demo-user 注入种子记忆（幂等，仅当全库为空时）。由 app lifespan 调用。"""
        if self._count_all() == 0:
            self._seed()

    def save(self, item: Dict[str, Any]) -> Dict[str, Any]:
        created_at = datetime.utcnow().isoformat() + "Z"
        with db.connection() as conn:
            row = conn.execute(
                "INSERT INTO memories (user_id, text, emotion, intensity, summary, narrative, imprint, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (
                    item.get("user_id", "demo-user"),
                    item.get("text", ""),
                    item.get("emotion", "calm"),
                    float(item.get("intensity", 0.5)),
                    item.get("summary", ""),
                    item.get("narrative", ""),
                    item.get("imprint") or "",
                    created_at,
                ),
            ).fetchone()
        return self._row_to_dict(row)

    def get_recent(self, user_id: str, limit: int = 3) -> List[Dict[str, Any]]:
        with db.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM memories WHERE user_id = %s ORDER BY id DESC LIMIT %s",
                (user_id, limit),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_by_ids(self, user_id: str, ids: List[int]) -> List[Dict[str, Any]]:
        clean_ids = [int(i) for i in ids if i is not None]
        if not clean_ids:
            return []

        with db.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM memories WHERE user_id = %s AND id = ANY(%s)",
                (user_id, clean_ids),
            ).fetchall()
        by_id = {int(row["id"]): self._row_to_dict(row) for row in rows}
        # 保持调用方给定的 id 顺序（向量检索按相关度排序，顺序有意义）
        return [by_id[i] for i in clean_ids if i in by_id]

    def get_all(self, user_id: str) -> List[Dict[str, Any]]:
        with db.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM memories WHERE user_id = %s ORDER BY id DESC",
                (user_id,),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def delete_by_user_id(self, user_id: str) -> int:
        clean_user_id = (user_id or "").strip()
        if not clean_user_id:
            raise ValueError("user_id is required")

        with db.connection() as conn:
            cur = conn.execute("DELETE FROM memories WHERE user_id = %s", (clean_user_id,))
            deleted = int(cur.rowcount if cur.rowcount is not None else 0)
        return deleted

    def _count_all(self) -> int:
        with db.connection() as conn:
            row = conn.execute("SELECT COUNT(*) AS n FROM memories").fetchone()
        return int(row["n"] if row else 0)

    def count_by_user(self, user_id: str) -> int:
        with db.connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM memories WHERE user_id = %s", (user_id,)
            ).fetchone()
        return int(row["n"] if row else 0)

    @staticmethod
    def _row_to_dict(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not row:
            return {}
        return {
            "id": int(row["id"]),
            "user_id": row["user_id"],
            "text": row["text"],
            "emotion": row["emotion"],
            "intensity": float(row["intensity"]),
            "summary": row["summary"],
            "narrative": row["narrative"],
            "imprint": row.get("imprint", "") or "",
            "created_at": row["created_at"],
        }

    _SEED_RECORDS = [
        ("今天面试有点紧张，手心都在出汗。", "anxious", 0.62, "用户感到明显的焦虑", "雾气在海面缓缓散开，礁石安静地待在原地。焦虑像潮水涨了又退，跟着岛屿的呼吸，慢慢数一次浪花。"),
        ("加班到好晚，整个人都累瘫了，什么也不想做。", "tired", 0.7, "用户感到明显的疲惫", "夜深了，岛上的风很轻。你躺在吊床里，星星替你守着今晚。今天已经很努力了，先搁下那些事吧。"),
        ("一个人吃饭，有点想家。", "lonely", 0.55, "用户感到淡淡的孤独", "晨雾里，岸边那棵树静静地站着，等你来。一个人不等于被遗忘，岛屿记得你每一次靠岸。"),
    ]

    def _seed(self) -> None:
        """首次运行为 demo-user 写入若干种子记忆，演示「连续陪伴感」。"""
        self.seed_for_user("demo-user", force=False)

    def seed_for_user(self, user_id: str, force: bool = False) -> int:
        """为指定 user_id 注入种子记忆。
        - force=False：仅当该用户当前无记忆时注入（幂等，避免新身份重复触发）。
        - 返回实际注入的条数。
        建议锁 + 同事务内查重，序列化并发首访，避免重复种子。
        """
        clean = (user_id or "").strip() or "demo-user"
        with db.connection() as conn, conn.cursor() as cur:
            db.advisory_xact_lock(cur, f"seed:{clean}")
            if not force:
                cur.execute("SELECT COUNT(*) AS n FROM memories WHERE user_id = %s", (clean,))
                if int(cur.fetchone()["n"]) > 0:
                    return 0
            for text, emotion, intensity, summary, narrative in self._SEED_RECORDS:
                created_at = datetime.utcnow().isoformat() + "Z"
                cur.execute(
                    "INSERT INTO memories (user_id, text, emotion, intensity, summary, narrative, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (clean, text, emotion, intensity, summary, narrative, created_at),
                )
        return len(self._SEED_RECORDS)

    # 「时光机·一键回望」专用：一段跨约两周、有起有伏的真实感轨迹。
    # 刻意不是"必然变晴的康复奇观"——中途有回落（无助/难过），但都控制在安全阈值内
    # （强度 < 0.85 且无自伤关键词），既真实又不会触发安全拦截而被排除。
    # 字段：(days_ago, text, emotion, intensity, summary, narrative, imprint)
    _TIMELINE_SEED = [
        (14, "刚到新环境，什么都不熟悉，心里一直悬着。", "anxious", 0.70, "用户感到明显的焦虑",
         "雾气在海面缓缓散开，礁石安静地待在原地。陌生的地方会慢慢长出熟悉，先跟着岛屿的呼吸数一次浪。",
         "雾再浓，也会被一步一步的呼吸打开，路不必一次看清。"),
        (12, "连着几天赶东西，累到不想说话。", "tired", 0.72, "用户感到明显的疲惫",
         "夜深了，岛上的风很轻。你躺在吊床里，星星替你守着今晚。做不完的事，先搁在岸边吧。",
         "今晚先把自己交给星光，明天的海会替你重新托起帆。"),
        (11, "和朋友有点别扭，心里闷闷的。", "sad", 0.66, "用户感到明显的难过",
         "岛上落了一阵细雨，海浪一遍遍抚过沙滩。难过不必急着赶走，让雨陪你坐一会儿。",
         "难过不是退潮后的荒凉，而是心在等待一束更柔的光。"),
        (9, "一个人吃饭，有点想家。", "lonely", 0.58, "用户感到淡淡的孤独",
         "晨雾里，岸边那棵树静静地站着，等你来。一个人不等于被遗忘，岛屿记得你每一次靠岸。",
         "即使此刻只有海浪回应你，也有一座岛认真记得你的名字。"),
        (7, "还是会担心，不过好像没那么慌了。", "anxious", 0.52, "用户感到淡淡的焦虑",
         "风穿过薄雾，把翻涌的思绪轻轻抚平。你已经走在让自己慢下来的路上了。",
         "把慌乱交给风，把脚步留给自己，潮水会慢慢退到远处。"),
        (5, "难得睡了个好觉，醒来觉得安静。", "calm", 0.50, "用户感到淡淡的平静",
         "阳光洒在海面，一艘小帆船随波轻轻摇晃。这份平静是你自己走到这里的。",
         "平静不是没有风，而是你终于听见了自己内在的潮汐。"),
        (4, "收到一个好消息，忍不住笑了。", "happy", 0.64, "用户感到明显的愉悦",
         "阳光落在花丛上，蝴蝶绕着光跳舞。你的喜悦让整座岛都亮了起来。",
         "把今天的光折进心里，往后暗下来的夜也会有星星可寻。"),
        (3, "又有点提不起劲，感觉使不上力。", "helpless", 0.66, "用户感到明显的无助",
         "雨落在静水里，远处有一点微光。停下来不是软弱，是你在保护自己，岛屿不催你。",
         "最暗的水面也会藏着微光，先停靠，别急着独自穿过黑夜。"),
        (2, "还是有点沉，但今天来岛上坐了坐。", "sad", 0.56, "用户感到明显的难过",
         "暮色里，远处的灯塔亮起一盏柔光。你愿意把心事说给岛屿听，已经很勇敢了。",
         "雨会停在你愿意抬头的那一刻，岸边的灯一直替你亮着。"),
        (1, "好像慢慢缓过来一点了。", "calm", 0.54, "用户感到淡淡的平静",
         "晴朗的午后，浪花温柔地拍着岸。你愿意慢下来，真好，岛屿把这份安稳替你收好。",
         "愿这片安静在你心里多住一会儿，像海面收好午后的光。"),
        (0, "今天想回来看看岛屿，心里亮了一点。", "happy", 0.60, "用户感到明显的愉悦",
         "海风带着花香，阳光把你的心情照得透亮。这一路你都走过来了，岛屿都看见了。",
         "喜悦是一枚小小的贝壳，愿你在忙碌时还能听见海声。"),
    ]

    def seed_timeline_for_user(self, user_id: str, force: bool = True) -> int:
        """为「时光机·一键回望」注入一段跨天、有起伏的演示轨迹，created_at 倒推回填、含 imprint。
        - force=True（默认）：先清空该 user_id 旧记忆再注入，保证轨迹纯净可复现（仅用于专用 demo 身份）。
        - force=False：仅当该用户当前无记忆时注入。
        返回实际注入条数。
        建议锁让 DELETE + INSERT 在同一事务内串行化：即便前端 StrictMode 并发双调用，
        也只会留下恰好一套 11 条轨迹（否则两次 DELETE/INSERT 交错会插成 22 条）。"""
        clean = (user_id or "").strip() or "demo-timeline"
        now = datetime.utcnow()
        with db.connection() as conn, conn.cursor() as cur:
            db.advisory_xact_lock(cur, f"timeline:{clean}")
            if not force:
                cur.execute("SELECT COUNT(*) AS n FROM memories WHERE user_id = %s", (clean,))
                if int(cur.fetchone()["n"]) > 0:
                    return 0
            if force:
                cur.execute("DELETE FROM memories WHERE user_id = %s", (clean,))
            for days_ago, text, emotion, intensity, summary, narrative, imprint in self._TIMELINE_SEED:
                created_at = (now - timedelta(days=days_ago)).isoformat() + "Z"
                cur.execute(
                    "INSERT INTO memories (user_id, text, emotion, intensity, summary, narrative, imprint, created_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                    (clean, text, emotion, intensity, summary, narrative, imprint, created_at),
                )
        return len(self._TIMELINE_SEED)
