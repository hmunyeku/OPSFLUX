"""
Routes API pour les fonctionnalités IA
"""

from typing import Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.api.deps import CurrentUser, get_db
from app.services.ai_service import ai_service, AIProvider

router = APIRouter()


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: system, user, or assistant")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    provider: AIProvider | None = None
    model: str | None = None
    stream: bool = False
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=1000, ge=1, le=4000)


class ChatResponse(BaseModel):
    message: str
    provider: str


class GenerateTextRequest(BaseModel):
    prompt: str
    context: str | None = None
    provider: AIProvider | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=1000, ge=1, le=4000)


class SuggestCompletionRequest(BaseModel):
    text: str
    field_type: str = "general"
    max_suggestions: int = Field(default=3, ge=1, le=5)


class SummarizeRequest(BaseModel):
    text: str
    max_length: int = Field(default=100, ge=10, le=500)


class TranslateRequest(BaseModel):
    text: str
    target_language: str


@router.get("/status")
async def ai_status(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Vérifie si le service IA est disponible"""
    return {
        "available": ai_service.is_available(),
        "default_provider": ai_service.default_provider if ai_service.is_available() else None,
        "providers": {
            "openai": ai_service.openai_client is not None,
            "anthropic": ai_service.anthropic_client is not None,
        }
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_completion(
    request: ChatRequest,
    current_user: CurrentUser,
) -> ChatResponse:
    """
    Génère une réponse de chat avec l'IA

    Requiert l'authentification. Supporte OpenAI et Anthropic.
    """
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        # Convertir les messages Pydantic en dict
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

        if request.stream:
            # TODO: Implémenter le streaming proprement avec SSE
            raise HTTPException(status_code=400, detail="Streaming not yet implemented")

        response = await ai_service.chat_completion(
            messages=messages,
            provider=request.provider,
            model=request.model,
            stream=False,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        return ChatResponse(
            message=response,
            provider=request.provider or ai_service.default_provider
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/generate")
async def generate_text(
    request: GenerateTextRequest,
    current_user: CurrentUser,
) -> dict[str, str]:
    """
    Génère du texte basé sur un prompt simple
    """
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        response = await ai_service.generate_text(
            prompt=request.prompt,
            context=request.context,
            provider=request.provider,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        return {"text": response}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/suggest-completion")
async def suggest_completion(
    request: SuggestCompletionRequest,
    current_user: CurrentUser,
) -> dict[str, list[str]]:
    """
    Suggère des complétions pour un champ de texte
    """
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        suggestions = await ai_service.suggest_completion(
            text=request.text,
            field_type=request.field_type,
            max_suggestions=request.max_suggestions,
        )

        return {"suggestions": suggestions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/analyze-sentiment")
async def analyze_sentiment(
    text: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Analyse le sentiment d'un texte
    """
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        result = await ai_service.analyze_sentiment(text)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/summarize")
async def summarize_text(
    request: SummarizeRequest,
    current_user: CurrentUser,
) -> dict[str, str]:
    """
    Résume un texte long
    """
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        summary = await ai_service.summarize(
            text=request.text,
            max_length=request.max_length,
        )

        return {"summary": summary}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/translate")
async def translate_text(
    request: TranslateRequest,
    current_user: CurrentUser,
) -> dict[str, str]:
    """
    Traduit un texte dans la langue cible
    """
    if not ai_service.is_available():
        raise HTTPException(status_code=503, detail="AI service not configured")

    try:
        translation = await ai_service.translate(
            text=request.text,
            target_language=request.target_language,
        )

        return {"translation": translation}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")
