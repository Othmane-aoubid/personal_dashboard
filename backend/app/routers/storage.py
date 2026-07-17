"""
Storage Usage router — disk stats and large-file discovery.
"""
import os
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/storage", tags=["storage"])


def _human(size_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"


def _disk_stat(path: str) -> dict:
    usage = shutil.disk_usage(path)
    total_gb = usage.total / (1024 ** 3)
    used_gb = usage.used / (1024 ** 3)
    free_gb = usage.free / (1024 ** 3)
    percent = (usage.used / usage.total * 100) if usage.total else 0
    return {
        "path": path,
        "total_gb": round(total_gb, 2),
        "used_gb": round(used_gb, 2),
        "free_gb": round(free_gb, 2),
        "percent": round(percent, 1),
    }


@router.get("/presets")
def get_presets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a structured list of preset paths for the dropdown."""
    presets = []

    def add(label, path, icon="📁", group="Other"):
        if os.path.exists(path):
            presets.append({"label": label, "path": path, "icon": icon, "group": group})

    # Container
    add("Container root (/)", "/", "🐳", "Container")
    if os.path.exists("/userfiles"):
        add("User Files volume", "/userfiles", "📦", "Container")

    # Windows C: drive
    hostc = "/hostc"
    if os.path.exists(hostc):
        add("C:\\ (root)", hostc, "💾", "C: Drive")

        # Top-level Windows folders
        for name, icon in [("Windows", "🪟"), ("Program Files", "⚙️"),
                            ("Program Files (x86)", "⚙️"), ("ProgramData", "📂")]:
            add(f"C:\\{name}", f"{hostc}/{name}", icon, "C: Drive")

        # Per-user folders
        users_dir = f"{hostc}/Users"
        if os.path.exists(users_dir):
            try:
                skip = {"Public", "Default", "Default User", "All Users", "desktop.ini"}
                for uname in sorted(os.listdir(users_dir)):
                    if uname in skip:
                        continue
                    uhome = f"{users_dir}/{uname}"
                    if not os.path.isdir(uhome):
                        continue
                    add(f"C:\\Users\\{uname}", uhome, "🏠", f"👤 {uname}")
                    for folder, icon in [
                        ("Desktop",   "🖥️"),
                        ("Documents", "📄"),
                        ("Downloads", "⬇️"),
                        ("Pictures",  "🖼️"),
                        ("Videos",    "🎬"),
                        ("Music",     "🎵"),
                        ("OneDrive",  "☁️"),
                        ("AppData",   "⚙️"),
                    ]:
                        add(f"C:\\Users\\{uname}\\{folder}",
                            f"{uhome}/{folder}", icon, f"👤 {uname}")
            except PermissionError:
                pass

    return {"presets": presets}


@router.get("/browse")
def browse_directory(
    path: str = Query(default="/"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List immediate subdirectories for path navigation."""
    root = Path(path)
    if not root.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not root.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    parent = str(root.parent) if root.parent != root else None
    dirs = []
    try:
        for item in sorted(root.iterdir(), key=lambda x: x.name.lower()):
            if item.is_dir() and not item.name.startswith('.'):
                try:
                    dirs.append({"name": item.name, "path": str(item)})
                except OSError:
                    pass
    except PermissionError:
        pass

    return {"path": str(root), "parent": parent, "dirs": dirs[:80]}


@router.get("/overview")
def disk_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    results = []
    try:
        results.append(_disk_stat("/"))
    except Exception as e:
        results.append({"path": "/", "error": str(e)})

    for extra in ["/hostc", "/mnt/c", "/host"]:
        if os.path.exists(extra):
            try:
                results.append(_disk_stat(extra))
            except Exception:
                pass

    return {"disks": results}


@router.get("/analyze")
def analyze_directory(
    path: str = Query(default="/"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    results_holder = [[]]
    error_holder = [None]

    def _dir_size(item_path: str, deadline: float):
        """Walk a directory summing file sizes; stop early if deadline exceeded."""
        total = 0
        truncated = False
        for dp, dns, fns in os.walk(item_path):
            dns[:] = [d for d in dns if not d.startswith(".")]
            for fn in fns:
                try:
                    total += os.path.getsize(os.path.join(dp, fn))
                except OSError:
                    pass
            if time.monotonic() > deadline:
                truncated = True
                break
        return total, truncated

    def _run():
        try:
            root = Path(path)
            if not root.exists():
                error_holder[0] = "Path not found"
                return
            if not root.is_dir():
                error_holder[0] = "Not a directory"
                return

            overall_deadline = time.monotonic() + 25  # leave 5s headroom before the 30s join
            entries = []
            try:
                for item in root.iterdir():
                    if item.name.startswith("."):
                        continue
                    if time.monotonic() > overall_deadline:
                        break
                    try:
                        if item.is_dir():
                            # per-item budget: 3s, but never past the overall deadline
                            item_deadline = min(time.monotonic() + 3, overall_deadline)
                            total, truncated = _dir_size(str(item), item_deadline)
                            entries.append({
                                "name": item.name,
                                "path": str(item),
                                "size_bytes": total,
                                "size_human": _human(total) + ("+" if truncated else ""),
                                "is_dir": True,
                                "truncated": truncated,
                            })
                        else:
                            sz = item.stat().st_size
                            entries.append({
                                "name": item.name,
                                "path": str(item),
                                "size_bytes": sz,
                                "size_human": _human(sz),
                                "is_dir": False,
                                "truncated": False,
                            })
                    except (PermissionError, OSError):
                        continue
            except PermissionError:
                error_holder[0] = "Permission denied"
                return

            entries.sort(key=lambda x: x["size_bytes"], reverse=True)
            results_holder[0] = entries[:20]
        except Exception as e:
            error_holder[0] = str(e)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=30)

    if error_holder[0]:
        raise HTTPException(status_code=500, detail=error_holder[0])

    # Return partial results if thread is still alive rather than a hard 504
    return {"path": path, "entries": results_holder[0], "partial": t.is_alive()}


@router.get("/large-files")
def large_files(
    path: str = Query(default="/"),
    min_mb: float = Query(default=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    results_holder = [[]]
    error_holder = [None]
    min_bytes = min_mb * 1024 * 1024

    def _run():
        try:
            root = Path(path)
            if not root.exists():
                error_holder[0] = "Path not found"
                return

            found = []
            for dp, dns, fns in os.walk(str(root)):
                dns[:] = [d for d in dns if not d.startswith(".")]
                for fn in fns:
                    fp = os.path.join(dp, fn)
                    try:
                        sz = os.path.getsize(fp)
                        if sz >= min_bytes:
                            stat = os.stat(fp)
                            found.append({
                                "name": fn,
                                "path": fp,
                                "size_bytes": sz,
                                "size_human": _human(sz),
                                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            })
                    except OSError:
                        continue
                    if len(found) >= 200:
                        break
                if len(found) >= 200:
                    break

            found.sort(key=lambda x: x["size_bytes"], reverse=True)
            results_holder[0] = found[:50]
        except Exception as e:
            error_holder[0] = str(e)

    t = threading.Thread(target=_run)
    t.start()
    t.join(timeout=30)

    if t.is_alive():
        raise HTTPException(status_code=504, detail="Search timed out")
    if error_holder[0]:
        raise HTTPException(status_code=500, detail=error_holder[0])

    return {"path": path, "min_mb": min_mb, "files": results_holder[0]}
