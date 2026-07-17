from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ENCRYPTION_KEY: str = ""  # Fernet key for AI API key encryption

    # Database
    DATABASE_URL: str = "postgresql+psycopg://personal_os:secret@db:5432/personal_os_db"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days — matches NextAuth session lifetime
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI providers (fallback — prefer per-user keys stored in DB)
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    RUNWAY_API_KEY: str = ""

    # File browser
    FILES_MOUNT_ROOT: str = "/userfiles"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
