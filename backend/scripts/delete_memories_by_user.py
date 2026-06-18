"""Delete local memories for one user_id.

SQLite is the source of truth. ChromaDB cleanup is best-effort so this script
still works when vector memory is disabled or unavailable.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.memory_service import MemoryService  # noqa: E402
from app.services.vector_memory_service import VectorMemoryService  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Delete Xinyu memories by user_id.")
    parser.add_argument("--user-id", required=True, help="The local user_id to delete, for example local-...")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete records. Without this flag the script only prints a dry-run summary.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    user_id = args.user_id.strip()
    if not user_id:
        raise SystemExit("--user-id cannot be empty")

    memory_service = MemoryService()
    memories = memory_service.get_all(user_id)

    if not args.confirm:
        print(f"dry-run: user_id={user_id} sqlite_records={len(memories)}")
        print("add --confirm to delete these SQLite records and best-effort ChromaDB vectors")
        return

    deleted = memory_service.delete_by_user_id(user_id)
    vector_deleted = VectorMemoryService().delete_by_user_id(user_id)
    print(f"deleted: user_id={user_id} sqlite_records={deleted} chroma_deleted={vector_deleted}")


if __name__ == "__main__":
    main()
