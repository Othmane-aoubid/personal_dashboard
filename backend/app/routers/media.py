"""
Media processing router.
Handles image processing (Pillow) and video operations (ffmpeg).
"""
import io
import os
import json
import tempfile
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.routers.files import _safe_path

router = APIRouter(prefix="/api/v1/media", tags=["media"])


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _resolve_input(
    file: Optional[UploadFile],
    path: Optional[str],
    user: User,
    db: Session,
) -> bytes:
    """Return file bytes from either an upload or a filesystem path."""
    if file is not None:
        return await file.read()
    if path:
        resolved = _safe_path(path, user.id, db)
        with open(resolved, "rb") as f:
            return f.read()
    raise HTTPException(status_code=400, detail="Provide either file or path")


# ── Image processing ───────────────────────────────────────────────────────────

@router.post("/image/process")
async def process_image(
    file: Optional[UploadFile] = File(None),
    path: Optional[str] = Form(None),
    operations: str = Form("[]"),
    output_format: str = Form("png"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Apply a list of operations to an image and return the processed result.

    operations JSON array items:
      { "type": "rotate",      "angle": 90 }
      { "type": "flip_h" }
      { "type": "flip_v" }
      { "type": "brightness",  "value": 1.5 }
      { "type": "contrast",    "value": 1.5 }
      { "type": "saturation",  "value": 1.5 }
      { "type": "sharpness",   "value": 1.5 }
      { "type": "grayscale" }
      { "type": "sepia" }
      { "type": "invert" }
      { "type": "blur",        "radius": 2 }
      { "type": "crop",        "x": 0, "y": 0, "w": 100, "h": 100 }
    """
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps

    data = await _resolve_input(file, path, current_user, db)

    try:
        ops = json.loads(operations)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid operations JSON")

    try:
        img = Image.open(io.BytesIO(data))
        # Convert to RGBA for processing, then back later
        if img.mode not in ("RGB", "RGBA", "L"):
            img = img.convert("RGB")

        for op in ops:
            op_type = op.get("type")

            if op_type == "rotate":
                angle = op.get("angle", 90)
                img = img.rotate(-angle, expand=True)

            elif op_type == "flip_h":
                img = ImageOps.mirror(img)

            elif op_type == "flip_v":
                img = ImageOps.flip(img)

            elif op_type == "brightness":
                value = float(op.get("value", 1.0))
                img = ImageEnhance.Brightness(img).enhance(value)

            elif op_type == "contrast":
                value = float(op.get("value", 1.0))
                img = ImageEnhance.Contrast(img).enhance(value)

            elif op_type == "saturation":
                value = float(op.get("value", 1.0))
                img = ImageEnhance.Color(img).enhance(value)

            elif op_type == "sharpness":
                value = float(op.get("value", 1.0))
                img = ImageEnhance.Sharpness(img).enhance(value)

            elif op_type == "grayscale":
                img = ImageOps.grayscale(img).convert("RGB")

            elif op_type == "sepia":
                gray = ImageOps.grayscale(img)
                sepia = Image.new("RGB", gray.size)
                pixels = gray.load()
                sepia_pixels = sepia.load()
                for y in range(gray.height):
                    for x in range(gray.width):
                        p = pixels[x, y]
                        sepia_pixels[x, y] = (
                            min(255, int(p * 1.08)),
                            min(255, int(p * 0.86)),
                            min(255, int(p * 0.67)),
                        )
                img = sepia

            elif op_type == "invert":
                if img.mode == "RGBA":
                    r, g, b, a = img.split()
                    rgb = Image.merge("RGB", (r, g, b))
                    rgb = ImageOps.invert(rgb)
                    r2, g2, b2 = rgb.split()
                    img = Image.merge("RGBA", (r2, g2, b2, a))
                else:
                    img = ImageOps.invert(img.convert("RGB"))

            elif op_type == "blur":
                radius = float(op.get("radius", 2))
                img = img.filter(ImageFilter.GaussianBlur(radius=radius))

            elif op_type == "crop":
                x = int(op.get("x", 0))
                y = int(op.get("y", 0))
                w = int(op.get("w", img.width))
                h = int(op.get("h", img.height))
                img = img.crop((x, y, x + w, y + h))

        # Determine output format
        fmt = output_format.upper()
        if fmt == "JPG":
            fmt = "JPEG"
        if fmt not in ("PNG", "JPEG", "WEBP", "GIF", "BMP"):
            fmt = "PNG"

        # JPEG does not support alpha
        if fmt == "JPEG" and img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")

        buf = io.BytesIO()
        img.save(buf, format=fmt)
        buf.seek(0)

        mime = {
            "PNG": "image/png",
            "JPEG": "image/jpeg",
            "WEBP": "image/webp",
            "GIF": "image/gif",
            "BMP": "image/bmp",
        }.get(fmt, "image/png")

        filename = f"processed.{output_format.lower()}"
        return StreamingResponse(
            buf,
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


# ── Video trim ─────────────────────────────────────────────────────────────────

@router.post("/video/trim")
async def trim_video(
    file: Optional[UploadFile] = File(None),
    path: Optional[str] = Form(None),
    start: float = Form(0.0),
    end: float = Form(10.0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trim a video between start and end seconds using ffmpeg."""
    if start < 0:
        raise HTTPException(status_code=400, detail="start must be >= 0")
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be greater than start")

    data = await _resolve_input(file, path, current_user, db)
    duration = end - start

    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, "input.mp4")
        output_path = os.path.join(tmp, "output.mp4")

        with open(input_path, "wb") as f:
            f.write(data)

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", input_path,
            "-t", str(duration),
            "-c", "copy",
            output_path,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail="ffmpeg timed out")

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"ffmpeg error: {result.stderr[-500:] if result.stderr else 'unknown'}",
            )

        with open(output_path, "rb") as f:
            video_bytes = f.read()

    return StreamingResponse(
        io.BytesIO(video_bytes),
        media_type="video/mp4",
        headers={"Content-Disposition": 'attachment; filename="trimmed.mp4"'},
    )


# ── Extract frame ──────────────────────────────────────────────────────────────

@router.post("/video/extract-frame")
async def extract_frame(
    file: Optional[UploadFile] = File(None),
    path: Optional[str] = Form(None),
    timestamp: float = Form(0.0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract a single frame from a video at the given timestamp."""
    if timestamp < 0:
        raise HTTPException(status_code=400, detail="timestamp must be >= 0")

    data = await _resolve_input(file, path, current_user, db)

    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, "input.mp4")
        output_path = os.path.join(tmp, "frame.jpg")

        with open(input_path, "wb") as f:
            f.write(data)

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(timestamp),
            "-i", input_path,
            "-frames:v", "1",
            "-q:v", "2",
            output_path,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail="ffmpeg timed out")

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"ffmpeg error: {result.stderr[-500:] if result.stderr else 'unknown'}",
            )

        with open(output_path, "rb") as f:
            frame_bytes = f.read()

    return StreamingResponse(
        io.BytesIO(frame_bytes),
        media_type="image/jpeg",
        headers={"Content-Disposition": 'attachment; filename="frame.jpg"'},
    )
