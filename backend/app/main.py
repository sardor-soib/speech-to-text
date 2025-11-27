import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers.ws import router as ws_router

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):

    key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAPI_KEY")
    if not key:
        logging.error("OPENAI_API_KEY is not set (checked OPENAI_API_KEY and OPENAPI_KEY)")
    else:
        logging.info("OPENAI_API_KEY found in environment. OpenAI Realtime proxy will use it on demand.")

    try:
        yield
    finally:
        logging.info("Shutting down application")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router, tags=["websocket"])

@app.get("/")
async def root():
    return {"status": "ok", "message": "Speech-to-Text Backend API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}


