from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import auth, events, todos, financials, goals, files, ai, settings as settings_router, media, generate, drawings, terminal, wiki, storage, timeline, security

app = FastAPI(
    title="Personal OS API",
    version="1.0.0",
    docs_url="/api/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security headers middleware ───────────────────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(events.router)
app.include_router(todos.router)
app.include_router(financials.router)
app.include_router(goals.router)
app.include_router(files.router)
app.include_router(ai.router)
app.include_router(settings_router.router)
app.include_router(media.router)
app.include_router(generate.router)
app.include_router(drawings.router)
app.include_router(terminal.router)
app.include_router(wiki.router)
app.include_router(storage.router)
app.include_router(timeline.router)
app.include_router(security.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.exception_handler(404)
async def not_found(request, exc):
    return JSONResponse(status_code=404, content={"detail": "Not found"})


@app.exception_handler(500)
async def server_error(request, exc):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
