"""
PRISM Analyst — Gemini Embedding Pipeline (Multi-Key Rotation)
================================================================
Generates 768-dimensional embeddings using Google Gemini gemini-embedding-001.

Features:
  - Multi-API-key rotation: alternates between keys to avoid rate limits
  - Fully resumable: safe to stop and restart at any time
  - Automatic retry with exponential backoff on 429/503 errors
  - Progress tracking with ETA

Usage:
    python database/embedder.py

Environment (.env):
    GEMINI_API_KEY=key1
    GEMINI_API_KEY_2=key2  (optional backup key)
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import socket

# Prevent hanging at the OS level on silently dropped connections
socket.setdefaulttimeout(30)

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import DB_CONFIG

from dotenv import load_dotenv
load_dotenv()

# Collect all available API keys
GEMINI_KEYS = []
key1 = os.getenv("GEMINI_API_KEY")
key2 = os.getenv("GEMINI_API_KEY_2")
if key1:
    GEMINI_KEYS.append(key1)
if key2:
    GEMINI_KEYS.append(key2)

GEMINI_MODEL = "gemini-embedding-001"
GEMINI_DIMENSIONS = 768
DB_COMMIT_BATCH = 50
DELAY_BETWEEN_CALLS = 0.05  # 50ms between calls (with 2 keys = effectively 100ms per key)


class GeminiEmbedder:
    """Handles embedding with automatic key rotation and retry logic."""

    def __init__(self, api_keys: list[str]):
        self.keys = api_keys
        self.current_key_index = 0
        self.total_calls = 0
        print(f"  🔑 Loaded {len(self.keys)} API key(s) for rotation")

    def _get_key(self) -> str:
        """Get the next API key using round-robin rotation."""
        key = self.keys[self.current_key_index % len(self.keys)]
        self.current_key_index += 1
        return key

    def embed(self, text: str) -> list[float]:
        """Embed a single text with automatic key rotation and retry."""
        truncated = text[:32000] if len(text) > 32000 else text

        max_retries = len(self.keys) * 3  # Try each key multiple times
        for attempt in range(max_retries):
            api_key = self._get_key()

            url = (f"https://generativelanguage.googleapis.com/v1beta/"
                   f"models/{GEMINI_MODEL}:embedContent?key={api_key}")

            payload = json.dumps({
                "model": f"models/{GEMINI_MODEL}",
                "content": {"parts": [{"text": truncated}]},
                "outputDimensionality": GEMINI_DIMENSIONS,
            }).encode("utf-8")

            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )

            try:
                with urllib.request.urlopen(req, timeout=30) as response:
                    result = json.loads(response.read().decode("utf-8"))

                values = result.get("embedding", {}).get("values", [])
                if len(values) != GEMINI_DIMENSIONS:
                    raise ValueError(f"Expected {GEMINI_DIMENSIONS} dims, got {len(values)}")
                self.total_calls += 1
                return values

            except urllib.error.HTTPError as e:
                error_body = ""
                try:
                    error_body = e.read().decode("utf-8")
                except:
                    pass

                if e.code == 429:
                    # Rate limited on this key — try next key immediately
                    if attempt < max_retries - 1:
                        wait = min(2 ** (attempt // len(self.keys)), 30)
                        if attempt % len(self.keys) == len(self.keys) - 1:
                            # All keys rate limited, wait before retrying cycle
                            print(f"  ⏳ All keys rate-limited, cooling down {wait}s...")
                            time.sleep(wait)
                        continue
                elif e.code == 503:
                    time.sleep(2)
                    continue
                else:
                    print(f"  ❌ API error {e.code}: {error_body[:200]}")
                    raise

            except urllib.error.URLError as e:
                if attempt < max_retries - 1:
                    time.sleep(2)
                    continue
                raise

        raise RuntimeError("All API keys exhausted after retries")


def run_embedding():
    """Run the Gemini embedding pipeline with multi-key rotation."""
    start_time = time.time()

    if not GEMINI_KEYS:
        print("❌ No GEMINI_API_KEY found in .env file!")
        sys.exit(1)

    print(f"╔{'═'*58}╗")
    print(f"║  PRISM ANALYST — Gemini Embedding Pipeline               ║")
    print(f"║  Model: {GEMINI_MODEL:<20s} Dims: {GEMINI_DIMENSIONS}              ║")
    print(f"║  Keys: {len(GEMINI_KEYS):<2d} | Multi-key rotation enabled           ║")
    print(f"╚{'═'*58}╝")

    embedder = GeminiEmbedder(GEMINI_KEYS)

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    cur = conn.cursor()

    # Count chunks
    cur.execute("SELECT COUNT(*) FROM document_chunks")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM document_chunks WHERE embedding IS NULL")
    pending = cur.fetchone()[0]
    already_done = total - pending

    print(f"\n📊 Total chunks: {total}")
    print(f"   Already embedded: {already_done}")
    print(f"   Pending: {pending}")

    if pending == 0:
        print("\n✅ All chunks already have embeddings!")
        conn.close()
        return

    # Fetch all pending chunks
    cur.execute("""
        SELECT chunk_id, embedding_text
        FROM document_chunks
        WHERE embedding IS NULL
        ORDER BY chunk_id
    """)
    all_pending = cur.fetchall()

    embedded_count = 0
    consecutive_errors = 0

    for i, (chunk_id, text) in enumerate(all_pending):
        try:
            embedding = embedder.embed(text)

            embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"
            cur.execute("""
                UPDATE document_chunks
                SET embedding = %s::vector, embedded_at = CURRENT_TIMESTAMP
                WHERE chunk_id = %s
            """, (embedding_str, chunk_id))

            embedded_count += 1
            consecutive_errors = 0

            # Commit and report progress
            if embedded_count % DB_COMMIT_BATCH == 0:
                conn.commit()
                progress = ((already_done + embedded_count) / total) * 100
                elapsed = time.time() - start_time
                rate = embedded_count / elapsed if elapsed > 0 else 0
                remaining = (pending - embedded_count) / rate if rate > 0 else 0
                print(f"  ✅ {already_done + embedded_count}/{total} ({progress:.1f}%) "
                      f"| {rate:.1f}/sec | ETA: {remaining:.0f}s")

            time.sleep(DELAY_BETWEEN_CALLS)

        except Exception as e:
            consecutive_errors += 1
            print(f"  ⚠️ Error on chunk {chunk_id}: {e}")
            if consecutive_errors >= 5:
                print(f"\n❌ Too many consecutive errors. Saving progress...")
                break
            time.sleep(5)
            continue

    # Final commit
    conn.commit()

    # Summary
    cur.execute("SELECT * FROM v_chunk_stats")
    cols = [desc[0] for desc in cur.description]
    print(f"\n{'='*60}")
    print(f"📊 EMBEDDING SUMMARY")
    print(f"{'='*60}")
    for row in cur.fetchall():
        data = dict(zip(cols, row))
        print(f"\n  🏢 {data['nse_code']}:")
        print(f"     Chunks: {data['total_chunks']} | "
              f"Embedded: {data['embedded_count']} | "
              f"Pending: {data['pending_embedding']}")

    conn.close()
    elapsed = time.time() - start_time
    print(f"\n⏱️  {elapsed:.1f}s — {embedded_count} new embeddings")
    if embedded_count >= pending:
        print(f"✅ ALL CHUNKS EMBEDDED SUCCESSFULLY!")
    else:
        print(f"⚠️ {pending - embedded_count} pending. Re-run to continue (resumable).")


if __name__ == "__main__":
    run_embedding()
