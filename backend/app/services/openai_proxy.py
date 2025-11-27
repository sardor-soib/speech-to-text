import asyncio
import inspect
import logging
import os
from typing import Any, Dict

import websockets
from fastapi import WebSocketDisconnect
from websockets.exceptions import WebSocketException

from ..config import OPENAI_API_KEY, OPENAI_REALTIME_URL, OPENAI_REALTIME_MODEL

logger = logging.getLogger(__name__)


async def proxy_websocket(client_ws):
    # Read API key from system environment variables first, then fall back to config
    api_key = os.getenv("OPENAI_API_KEY") or OPENAI_API_KEY

    if not api_key:
        logger.error("OPENAI_API_KEY is not set in system environment or .env file")
        try:
            await client_ws.send_json(
                {"type": "error", "error": {"message": "Server configuration error: API key not set"}})
            await client_ws.close(code=1008, reason="API key not configured")
        except Exception:
            pass
        return

    logger.info(f"Using API key: {api_key[:10]}...{api_key[-4:]}")  # Log partial key for debugging

    try:
        logger.info(f"Connecting to OpenAI Realtime API: {OPENAI_REALTIME_URL} (model={OPENAI_REALTIME_MODEL})")

        # Build headers as a list of (name, value) tuples which is widely supported
        headers = [("Authorization", f"Bearer {api_key}"), ("OpenAI-Beta", "realtime=v1")]

        # Choose a compatible keyword for passing headers to websockets.connect
        connect_kwargs: Dict[str, Any] = dict(
            open_timeout=30,  # increase timeout
            ping_interval=20,
            ping_timeout=10,
            close_timeout=10,
        )

        sig = inspect.signature(websockets.connect)
        if 'extra_headers' in sig.parameters:
            connect_kwargs['extra_headers'] = headers
        elif 'additional_headers' in sig.parameters:
            connect_kwargs['additional_headers'] = headers
        elif 'headers' in sig.parameters:
            connect_kwargs['headers'] = headers
        else:
            # last resort: pass as extra via kwargs (some versions accept any mapping)
            connect_kwargs['extra_headers'] = headers

        async with websockets.connect(OPENAI_REALTIME_URL, **connect_kwargs) as openai_ws:
            logger.info("Successfully connected to OpenAI Realtime API")

            async def forward_client_to_openai():
                try:
                    while True:
                        msg = await client_ws.receive()
                        msg_type = msg.get("type")
                        if msg_type == "websocket.receive":
                            if 'text' in msg and msg['text'] is not None:
                                text = msg['text']
                                logger.info(f"Client -> OpenAI (text): {text[:100]}...")
                                await openai_ws.send(text)
                            elif 'bytes' in msg and msg['bytes'] is not None:
                                data_bytes = msg['bytes']
                                logger.info(f"Client -> OpenAI (bytes): {len(data_bytes)} bytes")
                                await openai_ws.send(data_bytes)
                        elif msg_type == 'websocket.disconnect':
                            logger.info("Client requested disconnect")
                            break
                except WebSocketDisconnect:
                    logger.info("Client disconnected (WebSocketDisconnect)")
                except Exception as e:
                    logger.exception(f"Error forwarding client to OpenAI: {e}")

            async def forward_openai_to_client():
                try:
                    async for message in openai_ws:
                        if client_ws.application_state == "DISCONNECTED":
                            logger.warning("Client WebSocket is disconnected. Stopping message forwarding.")
                            break

                        # websockets yields str for text frames and bytes for binary frames
                        if isinstance(message, (bytes, bytearray)):
                            logger.info(f"OpenAI -> Client (bytes): {len(message)} bytes")
                            await client_ws.send_bytes(message)
                        else:
                            # message is str (text)
                            logger.info(f"OpenAI -> Client (text): {str(message)[:100]}...")
                            await client_ws.send_text(message)
                except Exception as e:
                    if client_ws.application_state != "DISCONNECTED":
                        logger.exception(f"Error forwarding OpenAI to client: {e}")
                    else:
                        logger.info("Error occurred after client WebSocket was disconnected. Ignoring.")

            await asyncio.gather(
                forward_client_to_openai(),
                forward_openai_to_client(),
                return_exceptions=True
            )

    except asyncio.TimeoutError:
        error_msg = "Connection to OpenAI timed out. Please check your internet connection and API key."
        logger.error(error_msg)
        try:
            await client_ws.send_json({"type": "error", "error": {"message": error_msg}})
        except Exception:
            pass
        try:
            await client_ws.close(code=1008, reason="OpenAI connection timeout")
        except Exception:
            pass
    except WebSocketException as e:
        error_msg = f"WebSocket error: {str(e)}"
        logger.error(f"{error_msg} - Check your API key and Realtime API access (model={OPENAI_REALTIME_MODEL})")
        try:
            await client_ws.send_json({"type": "error", "error": {
                "message": f"{error_msg}. Verify model '{OPENAI_REALTIME_MODEL}' exists and your key has access."}})
        except Exception:
            pass
        try:
            await client_ws.close(code=1011, reason=f"OpenAI WebSocket error")
        except Exception:
            pass
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.exception(error_msg)
        try:
            await client_ws.send_json({"type": "error", "error": {"message": error_msg}})
        except Exception:
            pass
        try:
            await client_ws.close(code=1011, reason="Internal server error")
        except Exception:
            pass
    finally:
        logger.info("Closing proxy connection")
