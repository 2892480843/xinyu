#!/usr/bin/env python3
"""心屿音频素材抓取脚本。

从 Wikimedia Commons 按给定「目标文件名 -> 本地命名」清单批量下载原始音频，
并用 macOS afconvert 转码为 AAC 128k .m4a，同时落盘一份元数据 JSON
(作者 / 授权 / 来源页 / 直链)，供 CREDITS.md 与代码集成使用。

用法:
  python3 fetch_assets.py <清单条目...>
条目格式: "Commons文件名(不含File:前缀)|本地命名"
  例: "Oceanwavescrushing.ogg|ocean_waves"

依赖: curl, afconvert (macOS 自带)。
所有原始文件存 raw/，转码存 m4a/，元数据汇总到 meta.json。
"""
from __future__ import annotations
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = "XinyuBot/1.0 (audio asset fetch for the Xinyu project; contact: dev)"
BASE = Path(__file__).resolve().parent
# raw 源料已移出 public(避免被 vite 原样打进 dist) → frontend/_audio_raw；m4a 产物仍写回 public/audio/。
RAW_DIR = BASE.parent.parent / "_audio_raw"
META_PATH = BASE / "meta.json"


def api_get(params: dict) -> dict:
    # 对每个值单独 percent-encode（safe='' 强制全编码，避免 urllib 默认 latin-1）。
    qs = "&".join(
        f"{k}={urllib.parse.quote(str(v), safe='')}" for k, v in params.items()
    )
    url = f"{API}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    # Wikimedia 限流：API 调用之间留间隔，避免 429。
    time.sleep(1.0)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def resolve_file(file_name: str) -> dict:
    """查单个文件的真实直链 + 授权元数据。"""
    d = api_get({
        "action": "query", "titles": f"File:{file_name}",
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "format": "json",
    })
    page = list(d["query"]["pages"].values())[0]
    info = page["imageinfo"][0]
    meta = info.get("extmetadata", {})
    import re
    def strip(t: str | None) -> str | None:
        return re.sub("<[^>]+>", "", t).strip() if t else None
    return {
        "url": info["url"],
        "mime": info.get("mime"),
        "size": info.get("size"),
        "artist": strip(meta.get("Artist", {}).get("value")),
        "license": meta.get("LicenseShortName", {}).get("value"),
        "license_url": meta.get("LicenseUrl", {}).get("value"),
        "desc_url": info.get("descriptionurl"),
        "description": strip(meta.get("ImageDescription", {}).get("value")),
    }


def load_meta() -> dict:
    if META_PATH.exists():
        return json.loads(META_PATH.read_text("utf-8"))
    return {"assets": {}}


def save_meta(meta: dict) -> None:
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")


def download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["curl", "-sL", "--max-time", "120", "-A", UA, "-o", str(dest), url],
        capture_output=True,
    )
    return dest.exists() and dest.stat().st_size > 1000


def transcode(src: Path, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["afconvert", "-f", "m4af", "-d", "aac", "-b", "128000", str(src), str(dest)],
        capture_output=True,
    )
    return dest.exists() and dest.stat().st_size > 1000


def main(entries: list[str]) -> int:
    meta = load_meta()
    fail = 0
    for entry in entries:
        if "|" not in entry:
            print(f"!! 跳过(格式错误): {entry}")
            fail += 1
            continue
        file_name, local = entry.split("|", 1)
        sub = local.rsplit("/", 1)
        local_name = sub[-1]
        print(f"\n=== {file_name}  ->  {local} ===")
        try:
            info = resolve_file(file_name)
        except Exception as e:
            print(f"!! 解析失败: {e}")
            fail += 1
            continue
        print(f"   {info['license']}  by {info['artist']}  ({info['size']} bytes)")
        raw = RAW_DIR / f"{local_name}{Path(file_name).suffix}"
        if not download(info["url"], raw):
            print(f"!! 下载失败: {info['url']}")
            fail += 1
            continue
        m4a = BASE / "m4a" / f"{Path(local_name).stem}.m4a"
        if not transcode(raw, m4a):
            print(f"!! 转码失败: {raw}")
            fail += 1
            continue
        print(f"   OK  raw={raw.stat().st_size}  m4a={m4a.stat().st_size}")
        meta["assets"][local] = {
            "source_file": file_name, "raw": str(raw.relative_to(BASE)),
            "m4a": str(m4a.relative_to(BASE)),
            **info,
        }
        save_meta(meta)
    print(f"\n完成。失败 {fail} 个。元数据见 {META_PATH}")
    return fail


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
