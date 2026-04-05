import urllib.request
import json
import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv('GEMINI_API_KEY')

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={key}"
body = json.dumps({
    "model": "models/gemini-embedding-001",
    "content": {"parts": [{"text": "test"}]},
    "outputDimensionality": 768
}).encode("utf-8")

req = urllib.request.Request(
    url, data=body, headers={"Content-Type": "application/json"}, method="POST"
)

try:
    urllib.request.urlopen(req)
    print("✅ 4th Key Works perfectly!")
except urllib.error.HTTPError as e:
    error_body = e.read().decode("utf-8")
    print(f"❌ Failed with HTTP {e.code}\n{error_body}")
except Exception as e:
    print(f"❌ Failed: {e}")
