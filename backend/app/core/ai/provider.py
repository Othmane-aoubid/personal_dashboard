"""
Multi-provider AI router.
Selects the correct client based on the requested provider string,
decrypts the user's stored API key, and returns a normalized response.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, List
import json

from app.config import settings
from app.core.encryption import decrypt


@dataclass
class AIMessage:
    role: str  # 'user' | 'assistant'
    content: str


@dataclass
class AIResponse:
    content: str
    model: str
    provider: str
    tokens_used: int = 0


def _resolve_key(provider: str, user_ai_providers: Optional[dict]) -> str:
    """Get the API key: prefer user's stored key, fall back to env var."""
    if user_ai_providers:
        encrypted = user_ai_providers.get(provider)
        if encrypted:
            try:
                return decrypt(encrypted)
            except Exception:
                pass
    # Fallback to environment variable
    env_map = {
        "gemini": settings.GEMINI_API_KEY,
        "openai": settings.OPENAI_API_KEY,
        "anthropic": settings.ANTHROPIC_API_KEY,
    }
    return env_map.get(provider, "")


async def chat(
    messages: List[AIMessage],
    provider: str = "gemini",
    model: Optional[str] = None,
    user_ai_providers: Optional[dict] = None,
    system_prompt: Optional[str] = None,
) -> AIResponse:
    key = _resolve_key(provider, user_ai_providers)
    if not key:
        raise ValueError(f"No API key configured for provider: {provider}")

    if provider == "gemini":
        return await _gemini_chat(messages, model or "gemini-2.0-flash", key, system_prompt)
    elif provider == "openai":
        return await _openai_chat(messages, model or "gpt-4o", key, system_prompt)
    elif provider == "anthropic":
        return await _anthropic_chat(messages, model or "claude-3-5-sonnet-20241022", key, system_prompt)
    else:
        raise ValueError(f"Unknown provider: {provider}")


async def generate_image(
    prompt: str,
    provider: str = "openai",
    style: str = "natural",
    size: str = "1024x1024",
    user_ai_providers: Optional[dict] = None,
) -> str:
    """Returns a URL or base64 data URI of the generated image."""
    key = _resolve_key(provider, user_ai_providers)
    if not key:
        raise ValueError(f"No API key configured for provider: {provider}")

    if provider == "openai":
        return await _openai_image(prompt, style, size, key)
    elif provider == "gemini":
        return await _gemini_image(prompt, key)
    else:
        raise ValueError(f"Image generation not supported for provider: {provider}")


# ── Provider implementations ──────────────────────────────────────────────────

async def _gemini_chat(messages, model, key, system_prompt) -> AIResponse:
    import google.generativeai as genai
    genai.configure(api_key=key)
    client = genai.GenerativeModel(
        model_name=model,
        system_instruction=system_prompt or "You are a helpful personal assistant.",
    )
    history = [
        {"role": m.role if m.role != "assistant" else "model", "parts": [m.content]}
        for m in messages[:-1]
    ]
    chat_session = client.start_chat(history=history)
    response = chat_session.send_message(messages[-1].content)
    return AIResponse(
        content=response.text,
        model=model,
        provider="gemini",
        tokens_used=response.usage_metadata.total_token_count if hasattr(response, "usage_metadata") else 0,
    )


async def _openai_chat(messages, model, key, system_prompt) -> AIResponse:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=key)
    oai_messages = []
    if system_prompt:
        oai_messages.append({"role": "system", "content": system_prompt})
    oai_messages += [{"role": m.role, "content": m.content} for m in messages]
    response = await client.chat.completions.create(model=model, messages=oai_messages)
    return AIResponse(
        content=response.choices[0].message.content,
        model=model,
        provider="openai",
        tokens_used=response.usage.total_tokens,
    )


async def _anthropic_chat(messages, model, key, system_prompt) -> AIResponse:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=key)
    anth_messages = [{"role": m.role, "content": m.content} for m in messages]
    response = await client.messages.create(
        model=model,
        max_tokens=4096,
        system=system_prompt or "You are a helpful personal assistant.",
        messages=anth_messages,
    )
    return AIResponse(
        content=response.content[0].text,
        model=model,
        provider="anthropic",
        tokens_used=response.usage.input_tokens + response.usage.output_tokens,
    )


async def _openai_image(prompt, style, size, key) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=key)
    response = await client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size=size,
        style=style,
        n=1,
        response_format="url",
    )
    return response.data[0].url


async def _gemini_image(prompt, key) -> str:
    # Gemini Imagen — returns base64
    import google.generativeai as genai
    genai.configure(api_key=key)
    model = genai.ImageGenerationModel("imagen-3.0-generate-001")
    result = model.generate_images(prompt=prompt, number_of_images=1)
    img = result.images[0]
    import base64
    b64 = base64.b64encode(img._image_bytes).decode()
    return f"data:image/png;base64,{b64}"
