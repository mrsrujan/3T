from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import get_db
from app.services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    market: str = "IN"
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = []


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
    if not settings.anthropic_api_key and not settings.groq_api_key and not settings.kimchi_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI not configured. Set STOCKS_GROQ_API_KEY (free) or STOCKS_ANTHROPIC_API_KEY in your .env.",
        )
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    try:
        result = ai_service.chat(
            db=db,
            market=request.market,
            message=request.message,
            history=[h.model_dump() for h in request.history],
        )
        return ChatResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI error: {exc}")
