import os
from datetime import timedelta

from pydantic import BaseModel


DEFAULT_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/twitter_location"


class Settings(BaseModel):
    database_url: str = DEFAULT_DB_URL
    cache_ttl_days: int = 7
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    db_pool_recycle_seconds: int = 1800

    @property
    def cache_ttl(self) -> timedelta:
        return timedelta(days=self.cache_ttl_days)

    @classmethod
    def load(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL", DEFAULT_DB_URL),
            cache_ttl_days=int(os.getenv("CACHE_TTL_DAYS", "7")),
            db_pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
            db_max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
            db_pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "30")),
            db_pool_recycle_seconds=int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800")),
        )


settings = Settings.load()
