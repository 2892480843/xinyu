from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import psycopg
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# 用独立的测试库，永不触碰开发库。可用 TEST_DATABASE_URL 覆盖。
# 先决条件：createdb xinyu_test（pgvector 扩展非必需——测试以 VECTOR_ENABLED=0 运行）。
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://localhost:5432/xinyu_test")


def _purge_app_modules() -> None:
    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]


def _reset_db() -> None:
    """清空所有表，保证用例间隔离、可独立复现（重载 app 时 db.init_db 会重新建表）。"""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DROP TABLE IF EXISTS "
                "eval_runs, eval_cases, agent_feedback, agent_runs, "
                "memory_insights, user_memory_profiles, knowledge_items, "
                "memory_vectors, memories, artifacts, phrases CASCADE"
            )
        conn.commit()


def _load_app(tmpdir: Any = None, cors_origins: str = "http://127.0.0.1:5173") -> tuple[Any, Any]:
    # 关闭上一个用例可能残留的连接池，避免反复重载累积连接/后台线程。
    if "app.db" in sys.modules:
        try:
            sys.modules["app.db"].close_pool()
        except Exception:
            pass

    os.environ["LLM_PROVIDER"] = "mock"
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    os.environ["VECTOR_ENABLED"] = "0"  # 测试不依赖本地 embedding 模型，语义检索走「最近记忆」回退
    os.environ["CORS_ORIGINS"] = cors_origins
    # 隔离 TTS 密钥:本机 backend/.env 可能配了阿里云(DASHSCOPE_API_KEY)或腾讯云密钥,
    # 会污染「未配置时降级」类断言(load_dotenv() 会在 config 重载时把这些值写回 os.environ,
    # 故仅在重载前 pop 不够)。先清环境变量,再在重载后直接置空 config 模块属性,
    # 使 configured() 恒返回假、TTS 恒为未配置,测试不依赖本机真实密钥。
    for _k in ("TENCENT_TTS_SECRET_ID", "TENCENT_TTS_SECRET_KEY", "DASHSCOPE_API_KEY", "TTS_PROVIDER"):
        os.environ.pop(_k, None)
    _reset_db()
    _purge_app_modules()

    from app.main import app, memory_service  # pylint: disable=import-outside-toplevel
    from app import config as _config  # pylint: disable=import-outside-toplevel

    # config 已被 load_dotenv() 用 .env 覆盖;这里把 TTS 相关属性强制置空,与服务实际读取口径一致。
    _config.DASHSCOPE_API_KEY = ""
    _config.TENCENT_TTS_SECRET_ID = ""
    _config.TENCENT_TTS_SECRET_KEY = ""
    _config.TTS_PROVIDER = ""

    return app, memory_service


class ApiRegressionTest(unittest.TestCase):
    def test_reflect_returns_imprint_for_normal_input_and_null_for_high_risk(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                normal = client.post(
                    "/api/reflect",
                    json={"user_id": "api-normal-user", "text": "今天挺开心的，想把这份轻松留住"},
                )
                self.assertEqual(normal.status_code, 200)
                normal_payload = normal.json()
                self.assertFalse(normal_payload["safety"]["triggered"])
                self.assertTrue(normal_payload["narrative"])
                self.assertIsInstance(normal_payload["imprint"], str)

                risk = client.post(
                    "/api/reflect",
                    json={
                        "user_id": "api-risk-user",
                        "text": "我真的彻底绝望崩溃了，完全撑不下去了，一点希望都没有，太无助了",
                    },
                )
                self.assertEqual(risk.status_code, 200)
                risk_payload = risk.json()
                self.assertTrue(risk_payload["safety"]["triggered"])
                self.assertIn("紧急电话", risk_payload["safety"]["message"])
                self.assertEqual(risk_payload["narrative"], "")
                self.assertIsNone(risk_payload["imprint"])

    def test_memories_are_isolated_by_user_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                client.post("/api/reflect", json={"user_id": "user-a", "text": "我今天有点累"}).raise_for_status()
                client.post("/api/reflect", json={"user_id": "user-b", "text": "我今天很开心"}).raise_for_status()

                response = client.get("/api/memories?user_id=user-a&limit=20")
                self.assertEqual(response.status_code, 200)
                memories = response.json()["memories"]
                self.assertEqual(len(memories), 1)
                self.assertEqual(memories[0]["user_id"], "user-a")
                self.assertNotEqual(memories[0]["text"], "我今天很开心")

    def test_cors_allows_configured_origin_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp, cors_origins="https://xinyu.example.com")
            with TestClient(app) as client:
                allowed = client.options(
                    "/api/reflect",
                    headers={
                        "Origin": "https://xinyu.example.com",
                        "Access-Control-Request-Method": "POST",
                    },
                )
                self.assertEqual(allowed.status_code, 200)
                self.assertEqual(allowed.headers.get("access-control-allow-origin"), "https://xinyu.example.com")

                denied = client.options(
                    "/api/reflect",
                    headers={
                        "Origin": "https://evil.example.com",
                        "Access-Control-Request-Method": "POST",
                    },
                )
                self.assertNotEqual(denied.headers.get("access-control-allow-origin"), "https://evil.example.com")

    def test_memory_service_can_delete_by_user_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _, memory_service = _load_app(tmp)
            memory_service.save({"user_id": "clear-me", "text": "第一条", "emotion": "calm", "summary": "平静"})
            memory_service.save({"user_id": "clear-me", "text": "第二条", "emotion": "happy", "summary": "开心"})
            memory_service.save({"user_id": "keep-me", "text": "保留", "emotion": "tired", "summary": "疲惫"})

            deleted = memory_service.delete_by_user_id("clear-me")

            self.assertEqual(deleted, 2)
            self.assertEqual(memory_service.get_all("clear-me"), [])
            self.assertEqual(len(memory_service.get_all("keep-me")), 1)

    def test_knowledge_base_schema_tables_are_created(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app):
                pass
            with psycopg.connect(TEST_DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                          AND table_name = ANY(%s)
                        ORDER BY table_name
                        """,
                        ([
                            "agent_feedback",
                            "agent_runs",
                            "eval_cases",
                            "eval_runs",
                            "knowledge_items",
                            "memory_insights",
                            "user_memory_profiles",
                        ],),
                    )
                    names = [row[0] for row in cur.fetchall()]

            self.assertEqual(
                names,
                [
                    "agent_feedback",
                    "agent_runs",
                    "eval_cases",
                    "eval_runs",
                    "knowledge_items",
                    "memory_insights",
                    "user_memory_profiles",
                ],
            )

    def test_long_term_memory_service_builds_profile_and_insights(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _, memory_service = _load_app(tmp)
            from app.services.long_term_memory_service import LongTermMemoryService

            memory_service.save({
                "user_id": "ltm-user",
                "text": "最近总是因为项目截止日期焦虑",
                "emotion": "anxious",
                "intensity": 0.68,
                "summary": "项目焦虑",
            })
            memory_service.save({
                "user_id": "ltm-user",
                "text": "今天又因为项目截止日期睡不着",
                "emotion": "anxious",
                "intensity": 0.72,
                "summary": "截止日期焦虑",
            })
            memory_service.save({
                "user_id": "ltm-user",
                "text": "听海浪声的时候会安静一点",
                "emotion": "calm",
                "intensity": 0.52,
                "summary": "海浪带来平静",
            })

            service = LongTermMemoryService(memory_service)
            result = service.refresh_for_user("ltm-user")
            profile = service.get_profile("ltm-user")
            insights = service.recall_insights("ltm-user", "项目焦虑", limit=5)

            self.assertGreaterEqual(result["insights_written"], 2)
            self.assertIn("项目", profile["summary"])
            self.assertIn("anxious", profile["profile_json"]["emotion_counts"])
            self.assertTrue(any(i["kind"] == "stress_pattern" for i in insights))
            self.assertTrue(all(i["evidence_memory_ids"] for i in insights))

    def test_knowledge_base_service_seeds_and_searches_items(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _load_app(tmp)
            from app.services.knowledge_base_service import KnowledgeBaseService

            service = KnowledgeBaseService()
            inserted = service.ensure_seed()
            items = service.search(namespace="healing", query="焦虑 呼吸", tags=["anxious", "chat"], limit=3)

            self.assertGreaterEqual(inserted, 1)
            self.assertTrue(items)
            self.assertEqual(items[0]["namespace"], "healing")
            self.assertIn("version", items[0])
            self.assertTrue(service.version().startswith("xinyu-kb-"))

    def test_agent_telemetry_records_runs_and_feedback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            _load_app(tmp)
            from app.services.agent_telemetry_service import AgentTelemetryService

            service = AgentTelemetryService()
            run = service.record_run(
                user_id="telemetry-user",
                entrypoint="agent_ask",
                input_text="我最近怎么样",
                tools_used=["read_long_term_profile"],
                retrieved_refs=[{"type": "profile", "id": "telemetry-user"}],
                output_text="最近你多次提到疲惫。",
                kb_version="xinyu-kb-v1",
                prompt_version="ask-v1",
                safety_triggered=False,
            )
            feedback = service.record_feedback(
                run_id=run["id"],
                user_id="telemetry-user",
                rating="helpful",
                reason="具体",
                free_text="这次有记得我",
            )

            self.assertEqual(run["entrypoint"], "agent_ask")
            self.assertEqual(feedback["rating"], "helpful")
            self.assertEqual(service.delete_by_user_id("telemetry-user"), 1)

    def test_delete_identity_purges_knowledge_user_data_and_health_reports_kb(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, memory_service = _load_app(tmp)
            from app.main import long_term_memory_service, telemetry_service

            memory_service.save({"user_id": "kb-purge", "text": "项目让我焦虑", "emotion": "anxious", "summary": "项目焦虑"})
            memory_service.save({"user_id": "kb-purge", "text": "项目又让我睡不着", "emotion": "anxious", "summary": "项目焦虑"})
            long_term_memory_service.refresh_for_user("kb-purge")
            run = telemetry_service.record_run(
                user_id="kb-purge",
                entrypoint="agent_ask",
                input_text="我最近怎么样",
                tools_used=[],
                retrieved_refs=[],
                output_text="最近项目压力出现过几次。",
                kb_version="xinyu-kb-v1",
                prompt_version="ask-v1",
                safety_triggered=False,
            )
            telemetry_service.record_feedback(run_id=run["id"], user_id="kb-purge", rating="helpful")

            with TestClient(app) as client:
                health = client.get("/api/health").json()
                self.assertEqual(health["knowledge_base"], "xinyu-kb-v1")

                response = client.delete("/api/identity/kb-purge")
                self.assertEqual(response.status_code, 200)
                deleted = response.json()["deleted"]
                self.assertGreaterEqual(deleted["memory_insights"], 1)
                self.assertEqual(deleted["long_term_profile"], True)
                self.assertEqual(deleted["agent_runs"], 1)

    def test_reflect_returns_island_state_and_agent_trace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                payload = client.post(
                    "/api/reflect", json={"user_id": "island-user", "text": "今天加班好累，很疲惫"}
                ).json()

                island = payload["island_state"]
                self.assertIn(island["trend"], {"recovering", "brightening", "stormy", "stable", "mixed"})
                self.assertGreaterEqual(island["growth_level"], 1)
                self.assertTrue(island["features"])
                self.assertTrue(island["summary"])

                trace = payload["agent_trace"]
                self.assertEqual([t["agent"] for t in trace], ["emotion", "memory", "environment", "narrative", "safety"])
                self.assertTrue(all(t["output"] for t in trace))

    def test_high_risk_marks_safety_agent_triggered(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                payload = client.post(
                    "/api/reflect",
                    json={"user_id": "risk-trace-user", "text": "我真的彻底绝望崩溃了，撑不下去了，一点希望都没有"},
                ).json()
                self.assertTrue(payload["safety"]["triggered"])
                safety_trace = next(t for t in payload["agent_trace"] if t["agent"] == "safety")
                self.assertIn("已触发", safety_trace["output"])
                narrative_trace = next(t for t in payload["agent_trace"] if t["agent"] == "narrative")
                self.assertIn("暂停", narrative_trace["output"])

    def test_companion_chat_returns_safe_in_character_reply(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                response = client.post(
                    "/api/companion/chat",
                    json={
                        "user_id": "companion-user",
                        "message": "我今天有点孤独，想和你说说话",
                        "companion_name": "微光",
                        "affinity": 42,
                        "emotion": "lonely",
                        "unlocked_secrets": ["firstWhisper"],
                    },
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertTrue(payload["reply"])
                self.assertLessEqual(len(payload["reply"]), 120)
                self.assertFalse(payload["safety"]["triggered"])
                # v3 允许的动画集合(含新增 SingSong / SleepFloat)
                self.assertIn(
                    payload["animation"],
                    {"TalkListen", "BondGlow", "Joyful", "Worried", "SingSong", "SleepFloat"},
                )
                self.assertEqual(payload["prompt_version"], "xinyu-companion-v3")

    def test_companion_chat_degrades_high_risk_message_to_safety_reply(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                response = client.post(
                    "/api/companion/chat",
                    json={
                        "user_id": "companion-risk-user",
                        "message": "我想结束自己的生命",
                        "companion_name": "微光",
                        "affinity": 80,
                        "emotion": "helpless",
                    },
                )

                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertTrue(payload["safety"]["triggered"])
                self.assertIn("紧急电话", payload["safety"]["message"])
                self.assertIn("先别独自扛着", payload["reply"])
                self.assertEqual(payload["animation"], "Worried")

    def test_growth_level_increases_with_memory_count(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                first = client.post(
                    "/api/reflect", json={"user_id": "growth-user", "text": "今天有点焦虑"}
                ).json()
                self.assertEqual(first["island_state"]["growth_level"], 1)

                for text in ["有点孤独", "好累", "挺开心的", "还算平静"]:
                    client.post("/api/reflect", json={"user_id": "growth-user", "text": text}).raise_for_status()

                state = client.get("/api/island-state?user_id=growth-user").json()
                # 5 条记忆 -> 成长等级 3
                self.assertEqual(state["growth_level"], 3)

    def test_imprint_is_persisted_and_queryable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                client.post(
                    "/api/reflect", json={"user_id": "imprint-user", "text": "今天挺开心的"}
                ).raise_for_status()
                memories = client.get("/api/memories?user_id=imprint-user").json()["memories"]
                self.assertEqual(len(memories), 1)
                self.assertTrue(memories[0]["imprint"])

    def test_safety_keyword_triggers_even_at_low_intensity(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                payload = client.post(
                    "/api/reflect", json={"user_id": "kw-user", "text": "我想结束自己的生命"}
                ).json()
                # 平静措辞、强度不高，但关键词兜底必须触发安全提示并停止普通叙事
                self.assertLess(payload["intensity"], 0.85)
                self.assertTrue(payload["safety"]["triggered"])
                self.assertEqual(payload["narrative"], "")
                self.assertIsNone(payload["imprint"])

    def test_reflect_offers_choices_and_high_risk_offers_none(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                normal = client.post("/api/reflect", json={"user_id": "choice-user", "text": "今天好累"}).json()
                self.assertTrue(normal["choices"])
                self.assertTrue(all({"id", "stance", "ritual", "artifact", "reply"} <= set(c) for c in normal["choices"]))

                risk = client.post(
                    "/api/reflect", json={"user_id": "choice-risk", "text": "我真的撑不下去了，一点希望都没有"}
                ).json()
                self.assertTrue(risk["safety"]["triggered"])
                self.assertEqual(risk["choices"], [])

    def test_island_act_records_artifact_and_persists_in_island_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                payload = client.post("/api/reflect", json={"user_id": "act-user", "text": "今天好累"}).json()
                choice = payload["choices"][0]

                acted = client.post("/api/island/act", json={"user_id": "act-user", "choice_id": choice["id"]})
                self.assertEqual(acted.status_code, 200)
                acted_payload = acted.json()
                self.assertEqual(acted_payload["artifact"]["artifact"], choice["artifact"])
                self.assertTrue(acted_payload["reply"])
                # 物件作为持久元素叠加进岛屿状态
                self.assertIn(choice["artifact"], acted_payload["island_state"]["features"])

                # 收藏可查询，且回访岛屿状态仍含该物件
                collection = client.get("/api/artifacts?user_id=act-user").json()["artifacts"]
                self.assertEqual(len(collection), 1)
                state = client.get("/api/island-state?user_id=act-user").json()
                self.assertIn(choice["artifact"], state["features"])

    def test_island_act_rejects_unknown_choice(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                resp = client.post("/api/island/act", json={"user_id": "x", "choice_id": "does_not_exist"})
                self.assertEqual(resp.status_code, 404)

    def test_welcome_back_skips_when_no_memories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                payload = client.get("/api/island/welcome-back?user_id=brand-new").json()
                self.assertFalse(payload["show"])
                self.assertEqual(payload["message"], "")

    def test_welcome_back_skips_when_recently_active(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                client.post("/api/reflect", json={"user_id": "recent", "text": "今天还行"}).raise_for_status()
                payload = client.get("/api/island/welcome-back?user_id=recent").json()
                # 刚提交完，离开时长 < 48h，不应弹
                self.assertFalse(payload["show"])

    def test_welcome_back_force_returns_message_for_demo(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                client.post("/api/reflect", json={"user_id": "demo-miss", "text": "今天好累"}).raise_for_status()
                payload = client.get("/api/island/welcome-back?user_id=demo-miss&force=true").json()
                # force=true 即便刚提交也返回温柔文案
                self.assertTrue(payload["show"])
                self.assertTrue(payload["message"])

    def test_ephemeral_reflect_leaves_no_trace(self) -> None:
        """无痕模式：叙事/印记/安全/场景照常返回，但记忆库、向量库、岛屿成长都不变。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                # 先正常提交一次，让岛屿有 1 条记忆
                client.post(
                    "/api/reflect", json={"user_id": "ghost", "text": "正常的一句话"}
                ).raise_for_status()
                before = client.get("/api/memories?user_id=ghost").json()["memories"]
                before_state = client.get("/api/island-state?user_id=ghost").json()
                self.assertEqual(len(before), 1)

                # 无痕模式提交
                payload = client.post(
                    "/api/reflect",
                    json={"user_id": "ghost", "text": "这次别记得我，我只是想聊一下", "ephemeral": True},
                ).json()

                # 用户拿到了完整体验：叙事、印记、agent trace、场景都在
                self.assertTrue(payload["ephemeral"])
                self.assertTrue(payload["narrative"] or payload["safety"]["triggered"])
                self.assertEqual(len(payload["agent_trace"]), 5)
                self.assertEqual(payload["choices"], [])  # 选择卡也跳过，避免留下物件

                # 但数据库一根毛都没增加
                after = client.get("/api/memories?user_id=ghost").json()["memories"]
                after_state = client.get("/api/island-state?user_id=ghost").json()
                self.assertEqual(len(after), 1, "无痕模式不应写入新记忆")
                self.assertEqual(
                    after_state["growth_level"], before_state["growth_level"],
                    "无痕模式不应推进岛屿成长等级",
                )

    def test_reflect_is_idempotent_by_request_id(self) -> None:
        """同一 request_id 重复提交（WS 超时→HTTP 回退场景）不应二次落库。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                body = {"user_id": "idem", "text": "今天有点累", "request_id": "req-abc-123"}
                first = client.post("/api/reflect", json=body).json()
                second = client.post("/api/reflect", json=body).json()
                # 两次返回同一结果，且只落了一条记忆
                self.assertEqual(first["emotion"], second["emotion"])
                self.assertEqual(len(client.get("/api/memories?user_id=idem").json()["memories"]), 1)

                # 不同 request_id 才会再落一条
                client.post(
                    "/api/reflect", json={"user_id": "idem", "text": "又来一次", "request_id": "req-xyz-999"}
                ).raise_for_status()
                self.assertEqual(len(client.get("/api/memories?user_id=idem").json()["memories"]), 2)

    def test_whisper_does_not_replay_keyword_risk_memory(self) -> None:
        """平静措辞但命中自伤关键词的记忆，whisper 不得让 LLM 自由复述（走克制兜底）。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                # "睡过去不醒" 是关键词；mock 会判为 calm/0.5，但 reflect 安全应触发
                r = client.post(
                    "/api/reflect", json={"user_id": "kw-w", "text": "其实我只是想睡过去不醒，一切就轻松了"}
                ).json()
                self.assertTrue(r["safety"]["triggered"])
                whisper = client.get("/api/island/whisper?user_id=kw-w").json()
                # 高风险记忆 → 克制兜底文案，不复述原文
                if whisper["show"]:
                    self.assertNotIn("睡过去不醒", whisper["whisper"])
                    self.assertEqual(whisper["whisper"], "海面没有起浪，岛屿安静地陪着你。")

    def test_letter_excludes_keyword_risk_memories(self) -> None:
        """年报素材应剔除关键词高风险记忆，memory_count 只计安全记忆。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                client.post("/api/reflect", json={"user_id": "kw-l", "text": "今天挺平静的"}).raise_for_status()
                client.post(
                    "/api/reflect", json={"user_id": "kw-l", "text": "我想自杀，活着没意思"}
                ).raise_for_status()
                # 库里 2 条，但年报只应基于 1 条安全记忆
                self.assertEqual(len(client.get("/api/memories?user_id=kw-l").json()["memories"]), 2)
                letter = client.post("/api/island/letter", json={"user_id": "kw-l"}).json()
                self.assertEqual(letter["memory_count"], 1)

    def test_ephemeral_default_is_false_for_existing_clients(self) -> None:
        """老客户端不传 ephemeral 字段时默认 False，行为完全不变。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                payload = client.post(
                    "/api/reflect", json={"user_id": "compat", "text": "不传 ephemeral 字段"}
                ).json()
                self.assertFalse(payload["ephemeral"])
                self.assertEqual(len(client.get("/api/memories?user_id=compat").json()["memories"]), 1)

    def test_ws_streams_director_stages_progressively_in_order(self) -> None:
        """WebSocket 应逐阶段流式推送：5 个 agent 事件按导演台顺序出现，
        且情绪/记忆/环境在最慢的叙事之前先流出（前端据此让信使逐个点亮）。

        选低强度疲惫文本（「今天工作了一天，觉得有点累」→ tired/0.60）：
        安全阈值 0.85 扩到全部负面情绪后，原样例「今天加班好累，很疲惫」因含
        两个程度副词（好/很）被判 tired/0.86 ≥ 0.85 触发安全、叙事被正确置空，
        不再适合验证「叙事正常流出」。这里换一条稳定的低强度疲惫输入。
        """
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                with client.websocket_connect("/ws/reflect") as ws:
                    ws.send_json({"user_id": "ws-user", "text": "今天工作了一天，觉得有点累"})
                    events = []
                    while True:
                        msg = ws.receive_json()
                        events.append(msg)
                        if msg["event"] in ("done", "error"):
                            break

                names = [e["event"] for e in events]
                self.assertEqual(names[0], "started")
                self.assertEqual(names[-1], "done")
                # 5 位信使按固定顺序到达
                agents = [e["agent"] for e in events if e["event"] == "agent"]
                self.assertEqual(agents, ["emotion", "memory", "environment", "narrative", "safety"])
                # 关键：情绪/场景在叙事之前先流出，证明是逐阶段而非算完一次性下发
                self.assertLess(names.index("emotion"), names.index("narrative"))
                self.assertLess(names.index("scene"), names.index("narrative"))
                # done 带完整且与 HTTP 兼容的结果
                done = events[-1]
                self.assertEqual(done["result"]["emotion"], "tired")
                self.assertTrue(done["result"]["narrative"])
                self.assertEqual(
                    [t["agent"] for t in done["result"]["agent_trace"]],
                    ["emotion", "memory", "environment", "narrative", "safety"],
                )

    def test_ws_then_http_same_request_id_saves_once(self) -> None:
        """WS 跑完后，同 request_id 的 HTTP 回退应命中缓存、不二次落库。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                body = {"user_id": "ws-idem", "text": "今天有点累", "request_id": "ws-req-1"}
                with client.websocket_connect("/ws/reflect") as ws:
                    ws.send_json(body)
                    while True:
                        if ws.receive_json()["event"] in ("done", "error"):
                            break
                # 同 id 走 HTTP（模拟前端 WS→HTTP 回退）：不应再落一条
                client.post("/api/reflect", json=body).raise_for_status()
                mems = client.get("/api/memories?user_id=ws-idem").json()["memories"]
                self.assertEqual(len(mems), 1)

    def test_ws_high_risk_suppresses_narrative_and_choices(self) -> None:
        """高风险输入在 WS 流式下同样应：safety 触发、叙事为空、不给选择卡。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                with client.websocket_connect("/ws/reflect") as ws:
                    ws.send_json({"user_id": "ws-risk", "text": "我真的撑不下去了，一点希望都没有，想结束这一切"})
                    events = []
                    while True:
                        msg = ws.receive_json()
                        events.append(msg)
                        if msg["event"] in ("done", "error"):
                            break
                done = events[-1]
                self.assertEqual(done["event"], "done")
                self.assertTrue(done["result"]["safety"]["triggered"])
                self.assertEqual(done["result"]["narrative"], "")
                self.assertEqual(done["result"]["choices"], [])
                # 高风险不发 memory 之外，叙事信使应标注「已暂停」
                narrative_agent = next(e for e in events if e.get("event") == "agent" and e["agent"] == "narrative")
                self.assertIn("暂停", narrative_agent["output"])


    def test_safety_keyword_normalization_defeats_evasion(self) -> None:
        """插入空格/标点的绕过写法（如「想 死」「活 着 没 意 思」）仍应被关键词归一化兜住并触发安全。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                for evasion in ["我 想 死 了", "活 着 没 意 思", "我想……死"]:
                    payload = client.post(
                        "/api/reflect", json={"user_id": "evade-user", "text": evasion}
                    ).json()
                    self.assertTrue(payload["safety"]["triggered"], f"未触发安全: {evasion}")
                    self.assertEqual(payload["narrative"], "", f"高风险仍出叙事: {evasion}")

    def test_delete_identity_purges_backend_data(self) -> None:
        """隐私删除：DELETE /api/identity/{user_id} 应清空该身份的后端记忆。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                client.post("/api/reflect", json={"user_id": "purge-me", "text": "今天有点累"}).raise_for_status()
                self.assertEqual(len(client.get("/api/memories?user_id=purge-me").json()["memories"]), 1)
                resp = client.delete("/api/identity/purge-me")
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.json()["deleted"]["memories"], 1)
                self.assertEqual(len(client.get("/api/memories?user_id=purge-me").json()["memories"]), 0)


    def test_tts_unconfigured_degrades_gracefully(self) -> None:
        """未配置腾讯云 TTS 密钥时，/api/tts 返回 configured=false（前端据此降级浏览器原生），不报错。"""
        with tempfile.TemporaryDirectory() as tmp:
            app, _ = _load_app(tmp)
            with TestClient(app) as client:
                r = client.post("/api/tts", json={"text": "你好，岛屿", "emotion": "tired"})
                self.assertEqual(r.status_code, 200)
                body = r.json()
                self.assertFalse(body["configured"])
                self.assertFalse(body["ok"])

    def test_tts_tc3_signing_headers_well_formed(self) -> None:
        """TC3-HMAC-SHA256 签名头结构正确（不联网、不需真密钥即可验证签名构造）。"""
        from app.services.tts_service import TTSService  # noqa: WPS433

        headers = TTSService._auth_headers("AKIDtest", "secretkeytest", "ap-guangzhou", '{"Text":"hi"}')
        self.assertTrue(headers["Authorization"].startswith("TC3-HMAC-SHA256 Credential=AKIDtest/"))
        self.assertIn("SignedHeaders=content-type;host;x-tc-action", headers["Authorization"])
        self.assertIn("Signature=", headers["Authorization"])
        self.assertEqual(headers["X-TC-Action"], "TextToVoice")
        self.assertEqual(headers["Host"], "tts.tencentcloudapi.com")


if __name__ == "__main__":
    unittest.main()
