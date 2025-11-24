from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    status: str
    database: str


class LocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    location: str
    cached: bool
    last_checked: datetime
    expires_at: datetime


class LocationCreate(BaseModel):
    username: str
    location: str
