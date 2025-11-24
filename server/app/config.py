import os
from datetime import timedelta

from pydantic import BaseModel


DEFAULT_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/twitter_location"


class Settings(BaseModel):
    database_url: str = DEFAULT_DB_URL
    cache_ttl_days: int = 7

    @property
    def cache_ttl(self) -> timedelta:
        return timedelta(days=self.cache_ttl_days)

    @classmethod
    def load(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL", DEFAULT_DB_URL),
            cache_ttl_days=int(os.getenv("CACHE_TTL_DAYS", "7")),
        )


settings = Settings.load()
