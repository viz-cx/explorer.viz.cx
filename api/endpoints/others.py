from fastapi import APIRouter

from helpers.live_health import seconds_since_heartbeat
from helpers.viz import get_client

router = APIRouter()


@router.get("/")
def home() -> dict:
    info = get_client().info()
    age = seconds_since_heartbeat()
    info["live_stream_heartbeat_age_sec"] = round(age, 1) if age is not None else None
    return info
