import asyncio
import logging
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .countries import normalize_country
from .db import SessionLocal, engine, get_session
from .location_provider import fetch_location_for_username
from .models import AccountLocation, Base
from .schemas import HealthResponse, LocationCreate, LocationResponse

logger = logging.getLogger(__name__)


app = FastAPI(title="Username Location Cache", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://twitter.superintendent.me"],
)


@app.get("/")
async def index():
    return {
        "service": "username-location-cache",
        "endpoints": {
            "healthcheck": {"method": "GET", "path": "/healthcheck"},
            "check": {"method": "GET", "path": "/check?a=<username>"},
            "add": {"method": "POST", "path": "/add", "body": {"username": "<username>", "location": "<country>"}, "status": 201},
        },
        "examples": {
            "healthcheck": "curl https://twitter.superintendent.me/healthcheck",
            "check": "curl 'https://twitter.superintendent.me/check?a=jack'",
        },
    }


def _upsert_location_stmt(normalized_username: str, location: str, fetched_at: datetime):
    stmt = insert(AccountLocation).values(
        username=normalized_username,
        location=location,
        fetched_at=fetched_at,
    )
    return stmt.on_conflict_do_update(
        index_elements=[AccountLocation.username],
        set_={"location": stmt.excluded.location, "fetched_at": stmt.excluded.fetched_at},
    )


async def _refresh_location(username: str, normalized: str):
    now = datetime.now(timezone.utc)
    try:
        new_location = await fetch_location_for_username(username)
    except Exception:  # pragma: no cover - defensive for provider errors
        logger.exception("background refresh failed for %s", normalized)
        return

    if new_location is None:
        return

    canonical_location = normalize_country(new_location)
    if canonical_location is None:
        return

    async with SessionLocal() as session:
        stmt = _upsert_location_stmt(normalized, canonical_location, now)
        await session.execute(stmt)
        await session.commit()


@app.on_event("startup")
async def startup_event():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.get("/healthcheck", response_model=HealthResponse)
async def healthcheck(session: AsyncSession = Depends(get_session)):
    try:
        await session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc

    return HealthResponse(status="ok", database="available")


@app.get("/check", response_model=LocationResponse)
async def check_username(
    a: str = Query(..., alias="a", min_length=1, description="Twitter/X username"),
    session: AsyncSession = Depends(get_session),
):
    username = a.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username must not be blank")

    normalized = username.lower()
    now = datetime.now(timezone.utc)

    result = await session.execute(
        select(AccountLocation.location, AccountLocation.fetched_at).where(AccountLocation.username == normalized)
    )
    record = result.first()

    if record is not None:
        location, fetched_at = record
        fresh = (now - fetched_at) < settings.cache_ttl
    else:
        location, fetched_at, fresh = None, None, False

    if fresh:
        return LocationResponse(
            username=username,
            location=location,
            cached=True,
            last_checked=fetched_at,
            expires_at=fetched_at + settings.cache_ttl,
        )

    if location is not None:
        asyncio.create_task(_refresh_location(username, normalized))
        return LocationResponse(
            username=username,
            location=location,
            cached=False,
            last_checked=fetched_at,
            expires_at=fetched_at + settings.cache_ttl,
        )

    try:
        new_location = await fetch_location_for_username(username)
    except Exception as exc:  # pragma: no cover - defensive for provider errors
        raise HTTPException(status_code=502, detail="location lookup failed") from exc

    if new_location is None:
        raise HTTPException(status_code=404, detail="location unavailable")

    canonical_location = normalize_country(new_location)
    if canonical_location is None:
        raise HTTPException(status_code=502, detail="location not in allowed country list")

    stmt = _upsert_location_stmt(normalized, canonical_location, now)
    await session.execute(stmt)
    await session.commit()
    return LocationResponse(
        username=username,
        location=canonical_location,
        cached=False,
        last_checked=now,
        expires_at=now + settings.cache_ttl,
    )


@app.post("/add", response_model=LocationResponse, status_code=201)
async def add_location(
    payload: LocationCreate,
    session: AsyncSession = Depends(get_session),
):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username must not be blank")

    normalized = username.lower()
    now = datetime.now(timezone.utc)

    canonical_location = normalize_country(payload.location)
    if canonical_location is None:
        raise HTTPException(status_code=422, detail="location must be one of the allowed country names")

    stmt = _upsert_location_stmt(normalized, canonical_location, now)
    logger.info(f"adding for {normalized},{canonical_location}")
    await session.execute(stmt)
    await session.commit()

    return LocationResponse(
        username=username,
        location=payload.location,
        cached=False,
        last_checked=now,
        expires_at=now + settings.cache_ttl,
    )
