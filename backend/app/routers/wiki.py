"""
Personal Wiki router.
"""
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.wiki import WikiPage

router = APIRouter(prefix="/api/v1/wiki", tags=["wiki"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class WikiCreate(BaseModel):
    title: str
    content: str = ""
    category: str = "General"
    tags: list = []
    pinned: bool = False


class WikiUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list] = None
    pinned: Optional[bool] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _summary(page: WikiPage) -> dict:
    return {
        "id": str(page.id),
        "title": page.title,
        "category": page.category,
        "tags": page.tags or [],
        "pinned": page.pinned,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "created_at": page.created_at.isoformat() if page.created_at else None,
    }


def _full(page: WikiPage) -> dict:
    d = _summary(page)
    d["content"] = page.content or ""
    return d


def _snippet(content: str, query: str, length: int = 200) -> str:
    if not content:
        return ""
    lower = content.lower()
    idx = lower.find(query.lower())
    if idx == -1:
        return content[:length]
    start = max(0, idx - 60)
    end = min(len(content), idx + length)
    snippet = content[start:end]
    if start > 0:
        snippet = "…" + snippet
    if end < len(content):
        snippet = snippet + "…"
    return snippet


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/search")
def search_wiki(
    q: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not q.strip():
        return []
    pages = (
        db.query(WikiPage)
        .filter(
            WikiPage.user_id == current_user.id,
            or_(
                WikiPage.title.ilike(f"%{q}%"),
                WikiPage.content.ilike(f"%{q}%"),
            ),
        )
        .order_by(WikiPage.updated_at.desc())
        .limit(20)
        .all()
    )
    results = []
    for p in pages:
        d = _summary(p)
        d["snippet"] = _snippet(p.content or "", q)
        results.append(d)
    return results


@router.get("")
def list_pages(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pages = (
        db.query(WikiPage)
        .filter(WikiPage.user_id == current_user.id)
        .order_by(WikiPage.pinned.desc(), WikiPage.updated_at.desc())
        .all()
    )
    return [_summary(p) for p in pages]


@router.post("", status_code=201)
def create_page(
    body: WikiCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    page = WikiPage(user_id=current_user.id, **body.model_dump())
    db.add(page)
    db.commit()
    db.refresh(page)
    return _full(page)


@router.get("/{page_id}")
def get_page(
    page_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    page = db.query(WikiPage).filter(WikiPage.id == page_id, WikiPage.user_id == current_user.id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return _full(page)


@router.patch("/{page_id}")
def update_page(
    page_id: str,
    body: WikiUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    page = db.query(WikiPage).filter(WikiPage.id == page_id, WikiPage.user_id == current_user.id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(page, k, v)
    page.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(page)
    return _full(page)


@router.delete("/{page_id}", status_code=204)
def delete_page(
    page_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    page = db.query(WikiPage).filter(WikiPage.id == page_id, WikiPage.user_id == current_user.id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    db.delete(page)
    db.commit()


# ── Wikipedia proxy ────────────────────────────────────────────────────────────
# Proxied server-side so the browser doesn't hit Wikipedia directly
# (avoids Content-Security-Policy blocks).

WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_HEADERS = {"User-Agent": "PersonalOS/1.0 (personal dashboard app)"}


@router.get("/wikipedia/search")
async def wikipedia_search(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    params = {
        "action": "query",
        "list": "search",
        "srsearch": q,
        "format": "json",
        "srlimit": "8",
        "srprop": "snippet",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(WIKI_API, params=params, headers=WIKI_HEADERS)
            res.raise_for_status()
            data = res.json()
        return {"results": data.get("query", {}).get("search", [])}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Wikipedia unavailable: {e}")


@router.get("/wikipedia/article")
async def wikipedia_article(
    title: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    params = {
        "action": "query",
        "prop": "extracts",
        "explaintext": "true",
        "titles": title,
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(WIKI_API, params=params, headers=WIKI_HEADERS)
            res.raise_for_status()
            data = res.json()
        pages = data.get("query", {}).get("pages", {})
        page = pages.get(next(iter(pages)), {})
        if "extract" not in page:
            raise HTTPException(status_code=404, detail="Article not found")
        return {"title": page.get("title", title), "extract": page["extract"]}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Wikipedia unavailable: {e}")
