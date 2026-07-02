from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _purge_app_modules() -> None:
    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]


class StaticAssetsTest(unittest.TestCase):
    def test_backend_serves_frontend_models_from_configured_dist(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp)
            models = dist / "models"
            models.mkdir()
            (dist / "index.html").write_text("<main id=\"root\">心屿</main>", encoding="utf-8")
            (models / "xy_probe.glb").write_bytes(b"glTF\x02\x00\x00\x00")

            os.environ["FRONTEND_DIST_DIR"] = str(dist)
            _purge_app_modules()

            from app.main import app  # pylint: disable=import-outside-toplevel

            client = TestClient(app)
            model_response = client.get("/models/xy_probe.glb")
            self.assertEqual(model_response.status_code, 200)
            self.assertEqual(model_response.content[:4], b"glTF")

            page_response = client.get("/explore")
            self.assertEqual(page_response.status_code, 200)
            self.assertIn("心屿", page_response.text)

            api_response = client.get("/api/not-a-real-route")
            self.assertEqual(api_response.status_code, 404)

