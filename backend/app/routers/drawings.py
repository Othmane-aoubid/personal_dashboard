"""CRUD for user drawings (persisted canvas snapshots)."""
from typing import Optional
import base64
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.drawing import Drawing
from app.models.user import User
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/v1/drawings", tags=["drawings"])

# ── Schema ─────────────────────────────────────────────────────────────────────

class DrawingSave(BaseModel):
    name: str
    canvas_data: str          # full-res data URL
    thumbnail: Optional[str] = None  # client-generated small preview


class DrawingRename(BaseModel):
    name: str


class DrawingOut(BaseModel):
    id: str
    name: str
    thumbnail: Optional[str]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class DrawingDetail(DrawingOut):
    canvas_data: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_thumbnail(data_url: str, max_width: int = 240) -> Optional[str]:
    """Downsample a PNG data URL to a small thumbnail."""
    try:
        from PIL import Image
        header, b64 = data_url.split(",", 1)
        raw = base64.b64decode(b64)
        img = Image.open(io.BytesIO(raw))
        ratio = max_width / img.width
        new_h = int(img.height * ratio)
        img = img.resize((max_width, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        encoded = base64.b64encode(buf.getvalue()).decode()
        return f"data:image/png;base64,{encoded}"
    except Exception:
        return None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DrawingOut])
def list_drawings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Drawing)
        .filter(Drawing.user_id == current_user.id)
        .order_by(Drawing.updated_at.desc())
        .all()
    )
    return [
        DrawingOut(
            id=str(r.id),
            name=r.name,
            thumbnail=r.thumbnail,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]


@router.post("", response_model=DrawingOut, status_code=status.HTTP_201_CREATED)
def save_drawing(
    body: DrawingSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thumbnail = body.thumbnail or _make_thumbnail(body.canvas_data)
    drawing = Drawing(
        user_id=current_user.id,
        name=body.name.strip() or "Untitled",
        canvas_data=body.canvas_data,
        thumbnail=thumbnail,
    )
    db.add(drawing)
    db.commit()
    db.refresh(drawing)
    return DrawingOut(
        id=str(drawing.id),
        name=drawing.name,
        thumbnail=drawing.thumbnail,
        created_at=drawing.created_at.isoformat(),
        updated_at=drawing.updated_at.isoformat(),
    )


@router.get("/{drawing_id}", response_model=DrawingDetail)
def get_drawing(
    drawing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(Drawing).filter(
        Drawing.id == drawing_id,
        Drawing.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Drawing not found")
    return DrawingDetail(
        id=str(row.id),
        name=row.name,
        thumbnail=row.thumbnail,
        canvas_data=row.canvas_data,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.patch("/{drawing_id}", response_model=DrawingOut)
def update_drawing(
    drawing_id: str,
    body: DrawingSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Overwrite canvas_data for an existing drawing (Save over)."""
    row = db.query(Drawing).filter(
        Drawing.id == drawing_id,
        Drawing.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Drawing not found")

    row.name = body.name.strip() or row.name
    row.canvas_data = body.canvas_data
    row.thumbnail = body.thumbnail or _make_thumbnail(body.canvas_data) or row.thumbnail
    from datetime import datetime, timezone
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return DrawingOut(
        id=str(row.id),
        name=row.name,
        thumbnail=row.thumbnail,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.patch("/{drawing_id}/rename", response_model=DrawingOut)
def rename_drawing(
    drawing_id: str,
    body: DrawingRename,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(Drawing).filter(
        Drawing.id == drawing_id,
        Drawing.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Drawing not found")
    row.name = body.name.strip() or row.name
    db.commit()
    db.refresh(row)
    return DrawingOut(
        id=str(row.id),
        name=row.name,
        thumbnail=row.thumbnail,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.delete("/{drawing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_drawing(
    drawing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(Drawing).filter(
        Drawing.id == drawing_id,
        Drawing.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Drawing not found")
    db.delete(row)
    db.commit()
