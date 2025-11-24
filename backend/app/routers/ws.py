from fastapi import APIRouter, WebSocket
import os
from ..services.openai_proxy import proxy_websocket

router = APIRouter()

@router.websocket("/realtime")
async def realtime_proxy(client_ws: WebSocket):
    # If API key is not set, raise an exception so tests that expect failure behave correctly.
    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAPI_KEY")
    if not key:
        raise Exception("OPENAI_API_KEY is not set")

    await client_ws.accept()
    await proxy_websocket(client_ws)
