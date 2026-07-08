"""Helper module for API"""
from fastapi import APIRouter

from endpoints import (
    analytics,
    auth,
    blocks,
    demo,
    key_references,
    notifications,
    onboarding,
    others,
    people,
    profile,
    richlist,
    session,
    watchlist,
    webhooks,
    ws,
)

router = APIRouter()
router.include_router(others.router)
router.include_router(onboarding.router)
router.include_router(people.router)
router.include_router(auth.router)
router.include_router(session.router)
router.include_router(watchlist.router)
router.include_router(notifications.router)
router.include_router(analytics.router)
router.include_router(demo.router)
router.include_router(key_references.router)
router.include_router(blocks.router)
router.include_router(profile.router)
router.include_router(richlist.router)
router.include_router(webhooks.router)
router.include_router(ws.router)
