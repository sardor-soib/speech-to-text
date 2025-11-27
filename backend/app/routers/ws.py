import logging
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from ..services.openai_proxy import proxy_websocket

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/realtime")
async def realtime_proxy(client_ws: WebSocket):
    try:
        await client_ws.accept()
        logger.info(f"WebSocket connection accepted from client")

        key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAPI_KEY")
        if not key:
            logger.error("OPENAI_API_KEY is not set")
            await client_ws.send_json({"error": "Server configuration error: API key not set"})
            await client_ws.close(code=1008, reason="API key not configured")
            return

        await proxy_websocket(client_ws)

    except WebSocketDisconnect:
        logger.info("Client disconnected normally")
    except Exception as e:
        logger.exception(f"Error in WebSocket endpoint: {e}")
        if client_ws.client_state == WebSocketState.CONNECTED:
            try:
                await client_ws.close(code=1011, reason=f"Internal server error: {str(e)[:100]}")
            except Exception:
                pass
    finally:
        if client_ws.client_state == WebSocketState.CONNECTED:
            try:
                await client_ws.close()
            except Exception:
                pass
        logger.info("WebSocket connection closed")
