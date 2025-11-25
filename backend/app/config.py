import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (two levels up from this file)
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"