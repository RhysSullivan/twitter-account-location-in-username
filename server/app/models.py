from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class AccountLocation(Base):
    __tablename__ = "account_locations"
    __table_args__ = (UniqueConstraint("username", name="uq_account_username"),)

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False, index=True)
    location = Column(String(255), nullable=False)
    fetched_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
