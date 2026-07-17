from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.core.ai.provider import chat, generate_image, AIMessage
from app.database import get_db
from app.models.user import User, UserSettings
from app.models.activity import AIPrompt

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _get_user_providers(user_id, db: Session) -> dict:
    us = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    return us.ai_providers if us else {}


def _log_prompt(user_id, provider, feature, prompt, output, model, tokens, db: Session):
    p = AIPrompt(
        user_id=user_id, provider=provider, feature=feature,
        prompt=prompt[:2000], output=(output or "")[:5000],
        model=model, tokens_used=str(tokens),
    )
    db.add(p)
    db.commit()


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    provider: str = "gemini"
    system_prompt: Optional[str] = None


@router.post("/chat")
async def ai_chat(body: ChatRequest, current_user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    messages = [AIMessage(role=m.role, content=m.content) for m in body.history]
    messages.append(AIMessage(role="user", content=body.message))

    user_providers = _get_user_providers(current_user.id, db)
    try:
        response = await chat(
            messages, provider=body.provider,
            user_ai_providers=user_providers,
            system_prompt=body.system_prompt or "You are a helpful personal assistant.",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="AI request failed — check your API key")

    _log_prompt(current_user.id, body.provider, "chat", body.message,
                response.content, response.model, response.tokens_used, db)
    return {"content": response.content, "provider": response.provider, "model": response.model}


# ── Text generation ───────────────────────────────────────────────────────────

class GenerateTextRequest(BaseModel):
    prompt: str
    tone: str = "professional"  # professional | casual | technical | creative
    length: str = "medium"      # short | medium | long
    provider: str = "anthropic"
    format: str = "text"        # text | markdown | html


@router.post("/generate/text")
async def generate_text(body: GenerateTextRequest, current_user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    length_map = {"short": "~150 words", "medium": "~400 words", "long": "~800 words"}
    system = (
        f"You are a professional writer. Write in a {body.tone} tone. "
        f"Target length: {length_map.get(body.length, '~400 words')}. "
        f"Output format: {body.format}."
    )
    messages = [AIMessage(role="user", content=body.prompt)]
    user_providers = _get_user_providers(current_user.id, db)

    try:
        response = await chat(messages, provider=body.provider, user_ai_providers=user_providers,
                              system_prompt=system)
    except Exception:
        raise HTTPException(status_code=500, detail="Text generation failed — check your API key")

    _log_prompt(current_user.id, body.provider, "generation", body.prompt,
                response.content, response.model, response.tokens_used, db)
    return {"content": response.content, "provider": response.provider}


# ── Image generation ──────────────────────────────────────────────────────────

class GenerateImageRequest(BaseModel):
    prompt: str
    style: str = "natural"   # natural | vivid (OpenAI) | photorealistic | illustration
    size: str = "1024x1024"
    provider: str = "openai"


@router.post("/generate/image")
async def gen_image(body: GenerateImageRequest, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    user_providers = _get_user_providers(current_user.id, db)
    try:
        url = await generate_image(
            body.prompt, provider=body.provider, style=body.style,
            size=body.size, user_ai_providers=user_providers,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Image generation failed — check your API key")

    _log_prompt(current_user.id, body.provider, "image", body.prompt, url,
                "dall-e-3" if body.provider == "openai" else "imagen", 0, db)
    return {"url": url, "provider": body.provider}


# ── Document analysis ─────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    content: str      # extracted text from file (handled by /files/analyze)
    question: Optional[str] = None
    provider: str = "gemini"


@router.post("/analyze")
async def analyze(body: AnalyzeRequest, current_user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    system = "You are an expert document analyst. Be concise, precise, and cite the document."
    prompt = body.question or "Summarize this document and extract the 5 most important points."
    messages = [AIMessage(role="user", content=f"Content:\n\n{body.content[:12000]}\n\n---\n{prompt}")]
    user_providers = _get_user_providers(current_user.id, db)

    try:
        response = await chat(messages, provider=body.provider, user_ai_providers=user_providers,
                              system_prompt=system)
    except Exception:
        raise HTTPException(status_code=500, detail="Analysis failed")

    return {"analysis": response.content, "provider": response.provider}


# ── Video generation (async job) ──────────────────────────────────────────────

class VideoRequest(BaseModel):
    prompt: str
    duration: int = 5  # seconds


@router.post("/generate/video")
async def gen_video(body: VideoRequest, current_user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    # Runway ML integration — async job pattern
    from app.config import settings
    import httpx

    if not settings.RUNWAY_API_KEY:
        raise HTTPException(status_code=400, detail="RUNWAY_API_KEY not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.dev.runwayml.com/v1/image_to_video",
            headers={"Authorization": f"Bearer {settings.RUNWAY_API_KEY}",
                     "X-Runway-Version": "2024-11-06"},
            json={"promptText": body.prompt, "duration": body.duration, "model": "gen4_turbo"},
            timeout=30,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Video generation request failed")

    data = resp.json()
    return {"job_id": data.get("id"), "status": "pending",
            "message": "Video generation started — poll /api/v1/ai/jobs/{job_id} for status"}


@router.get("/jobs/{job_id}")
async def poll_job(job_id: str, current_user: User = Depends(get_current_user)):
    from app.config import settings
    import httpx

    if not settings.RUNWAY_API_KEY:
        raise HTTPException(status_code=400, detail="RUNWAY_API_KEY not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.dev.runwayml.com/v1/tasks/{job_id}",
            headers={"Authorization": f"Bearer {settings.RUNWAY_API_KEY}",
                     "X-Runway-Version": "2024-11-06"},
        )
    return resp.json()


# ── Prompt history ────────────────────────────────────────────────────────────

@router.get("/history")
def prompt_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prompts = db.query(AIPrompt).filter(AIPrompt.user_id == current_user.id).order_by(
        AIPrompt.created_at.desc()
    ).limit(100).all()
    return [{"id": str(p.id), "provider": p.provider, "feature": p.feature,
             "prompt": p.prompt[:200], "model": p.model,
             "created_at": p.created_at.isoformat()} for p in prompts]
