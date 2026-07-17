"""
Terminal Commander router — shell execution + filesystem operations.
This is a personal single-user dashboard, so all paths are allowed.
"""
import os
import shutil
import fnmatch
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/terminal", tags=["terminal"])

MAX_OUTPUT = 50 * 1024   # 50 KB
MAX_READ   = 500 * 1024  # 500 KB


# ── Schemas ────────────────────────────────────────────────────────────────────

class ExecRequest(BaseModel):
    command: str
    cwd: Optional[str] = None


class MkdirRequest(BaseModel):
    path: str


class TouchRequest(BaseModel):
    path: str


class WriteRequest(BaseModel):
    path: str
    content: str


class DeleteRequest(BaseModel):
    path: str


class RenameRequest(BaseModel):
    src: str
    dst: str


class SearchRequest(BaseModel):
    root: str
    query: str
    max_results: int = 50


# ── Helpers ────────────────────────────────────────────────────────────────────

def _entry(p: Path) -> dict:
    try:
        stat = p.stat(follow_symlinks=False)
        is_dir = p.is_dir()
        return {
            "name": p.name,
            "path": str(p),
            "is_dir": is_dir,
            "size": stat.st_size if not is_dir else None,
            "modified": stat.st_mtime,
        }
    except OSError:
        return {"name": p.name, "path": str(p), "is_dir": False, "size": None, "modified": None}


def _human(size_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/exec")
def exec_command(
    body: ExecRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = {"stdout": "", "stderr": "", "returncode": -1}
    exc_holder = [None]

    def run():
        try:
            cwd = body.cwd or "/"
            proc = subprocess.run(
                ["bash", "-c", body.command],
                capture_output=True,
                text=True,
                timeout=10,
                cwd=cwd,
            )
            result["stdout"] = proc.stdout[:MAX_OUTPUT]
            result["stderr"] = proc.stderr[:MAX_OUTPUT]
            result["returncode"] = proc.returncode
        except subprocess.TimeoutExpired:
            result["stderr"] = "Command timed out after 10 seconds"
            result["returncode"] = 124
        except Exception as e:
            result["stderr"] = str(e)
            result["returncode"] = -1

    t = threading.Thread(target=run)
    t.start()
    t.join(timeout=12)
    if t.is_alive():
        result["stderr"] = "Command timed out"
        result["returncode"] = 124

    return result


@router.get("/fs")
def list_directory(
    path: str = Query(default="/"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = Path(path).resolve()
        if not p.exists():
            raise HTTPException(status_code=404, detail="Path not found")
        if not p.is_dir():
            raise HTTPException(status_code=400, detail="Not a directory")

        entries = []
        try:
            items = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
            for item in items:
                try:
                    entries.append(_entry(item))
                except (PermissionError, OSError):
                    continue
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")

        parent = str(p.parent) if str(p.parent) != str(p) else None
        return {"entries": entries, "parent_path": parent}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fs/mkdir")
def make_directory(
    body: MkdirRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = Path(body.path)
        p.mkdir(parents=True, exist_ok=True)
        return {"ok": True, "path": str(p)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fs/touch")
def touch_file(
    body: TouchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = Path(body.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.touch(exist_ok=True)
        return {"ok": True, "path": str(p)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fs/write")
def write_file(
    body: WriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = Path(body.path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body.content, encoding="utf-8")
        return {"ok": True, "path": str(p)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fs/read")
def read_file(
    path: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = Path(path)
        if not p.exists():
            raise HTTPException(status_code=404, detail="File not found")
        if not p.is_file():
            raise HTTPException(status_code=400, detail="Not a file")
        if p.stat().st_size > MAX_READ:
            raise HTTPException(status_code=413, detail="File too large (max 500 KB)")
        content = p.read_text(encoding="utf-8", errors="replace")
        return {"path": str(p), "content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/fs/delete")
def delete_path(
    body: DeleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = Path(body.path)
        if not p.exists():
            raise HTTPException(status_code=404, detail="Path not found")
        if p.is_dir():
            shutil.rmtree(str(p))
        else:
            p.unlink()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fs/rename")
def rename_path(
    body: RenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        src = Path(body.src)
        dst = Path(body.dst)
        if not src.exists():
            raise HTTPException(status_code=404, detail="Source not found")
        shutil.move(str(src), str(dst))
        return {"ok": True, "dst": str(dst)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fs/search")
def search_files(
    body: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        root = Path(body.root)
        if not root.exists():
            raise HTTPException(status_code=404, detail="Root path not found")

        results = []
        pattern = body.query.lower()

        for dirpath, dirnames, filenames in os.walk(str(root)):
            # Skip hidden dirs
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for name in dirnames + filenames:
                if fnmatch.fnmatch(name.lower(), f"*{pattern}*") or pattern in name.lower():
                    full = Path(dirpath) / name
                    try:
                        stat = full.stat(follow_symlinks=False)
                        results.append({
                            "name": name,
                            "path": str(full),
                            "is_dir": full.is_dir(),
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                        })
                    except OSError:
                        pass
                    if len(results) >= body.max_results:
                        break
            if len(results) >= body.max_results:
                break

        return {"results": results, "query": body.query, "root": str(root)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
