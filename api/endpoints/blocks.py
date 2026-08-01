from fastapi import APIRouter, HTTPException

import helpers.mongo as mongo

router = APIRouter(
    prefix="/blocks",
    tags=["Blocks"],
    responses={404: {"description": "Not found"}},
)


@router.get("/latest")
async def latest() -> dict:
    return await mongo.aget_last_block()


@router.get("/{id}")
async def block(id: int) -> dict:
    """A block by number.

    The archive still has holes (79,105,831–80,679,604 and 80,807,025–81,192,999,
    see scripts/backfill_from_info_viz.py), so "not stored" is an ordinary answer
    here, not a fault. It used to be one: find_one returned None, the `-> dict`
    annotation failed response validation, and every probe of a hole block came
    back 500 with a traceback in the logs.
    """
    doc = await mongo.aget_block(id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Block not in the archive")
    return doc
