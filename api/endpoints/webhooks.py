"""Webhook registration endpoints.

    POST   /webhooks       register a new webhook (returns id + one-time secret)
    GET    /webhooks       list webhooks owned by the authenticated account
    DELETE /webhooks/{id}  delete a webhook owned by the authenticated account

All endpoints require signature-challenge authentication.
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl

from helpers import webhooks
from helpers.signature_auth import require_signed_request

router = APIRouter(
    prefix="/webhooks",
    tags=["Webhooks"],
    responses={401: {"description": "Authentication failed"}},
)


class WebhookFilter(BaseModel):
    op_type: str | None = None
    account: str | None = None


class WebhookCreateBody(BaseModel):
    url: HttpUrl
    filter: WebhookFilter = WebhookFilter()


class WebhookCreated(BaseModel):
    id: str
    secret: str


class WebhookRow(BaseModel):
    id: str
    url: str
    filter: WebhookFilter
    created_at: dt.datetime
    active: bool


@router.post("/", response_model=WebhookCreated)
def create_webhook(
    body: WebhookCreateBody,
    account: str = Depends(require_signed_request),
) -> WebhookCreated:
    try:
        result = webhooks.register(
            account=account,
            url=str(body.url),
            op_type=body.filter.op_type,
            target_account=body.filter.account,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return WebhookCreated(**result)


@router.get("/", response_model=list[WebhookRow])
def list_webhooks(account: str = Depends(require_signed_request)) -> list[WebhookRow]:
    rows = webhooks.list_for(account)
    return [
        WebhookRow(
            id=row["id"],
            url=row["url"],
            filter=WebhookFilter(**(row.get("filter") or {})),
            created_at=row["created_at"],
            active=row["active"],
        )
        for row in rows
    ]


@router.delete("/{webhook_id}")
def delete_webhook(
    webhook_id: str,
    account: str = Depends(require_signed_request),
) -> dict[str, bool]:
    if not webhooks.deactivate(webhook_id, account):
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"ok": True}
