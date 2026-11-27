from fastapi import APIRouter, HTTPException, Response
from fastapi_cache.decorator import cache
from viz.account import Account, AccountDoesNotExistsException

from helpers.avatar import generateAvatar
from helpers.viz import get_client

router = APIRouter(
    prefix="/profile",
    tags=["Profile"],
    responses={404: {"description": "Not found"}},
)


@router.get("/{user}")
@cache(expire=60)
def profile(user: str):
    try:
        acc = Account(user, get_client())
        if not isinstance(acc["json_metadata"], dict):
            acc["json_metadata"] = {}
        if "profile" not in acc["json_metadata"]:
            acc["json_metadata"]["profile"] = {}
        if "avatar" not in acc["json_metadata"]["profile"]:
            prefix = "https://api.viz.cx"
            ava = f"{prefix}/profile/avatar/{user}"
            acc["json_metadata"]["profile"]["avatar"] = ava
        return acc
    except AccountDoesNotExistsException:
        raise HTTPException(status_code=404, detail="Account doesn't exists") from None


@router.get("/avatar/{user}")
def avatar(user: str) -> Response:
    # Not @cache'd: fastapi-cache can't store a raw Response (a hit comes back
    # as JSON). The image is a pure function of the name, so let clients keep it.
    return Response(
        content=generateAvatar(user),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=86400"},
    )
