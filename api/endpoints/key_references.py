from fastapi import APIRouter, Query

from helpers.key_index import async_find_accounts_by_key

router = APIRouter(tags=["Accounts"])


@router.get("/key-references")
async def key_references(
    pub: str = Query(..., description="VIZ public key (VIZ…)"),
) -> dict:
    """Return all account names whose current signing keys include `pub`."""
    accounts = await async_find_accounts_by_key(pub)
    return {"accounts": accounts}
