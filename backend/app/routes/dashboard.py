import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import dependencies, models
from app.models import database

router = APIRouter(prefix="/dashboard")


@router.get("/token-usage")
async def get_token_usage(
    days: int = Query(7, ge=1, le=365),
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    today = datetime.datetime.utcnow().date()
    start_date = today - datetime.timedelta(days=days - 1)
    start_at = datetime.datetime.combine(start_date, datetime.time.min)
    end_at = datetime.datetime.combine(today, datetime.time.max)
    usage_date = func.date(models.Message.created_at)

    stmt = (
        select(
            usage_date.label("date"),
            func.coalesce(func.sum(models.Message.tokens_in), 0).label("tokens_in"),
            func.coalesce(func.sum(models.Message.tokens_out), 0).label("tokens_out"),
        )
        .join(models.Chat, models.Chat.id == models.Message.chat_id)
        .where(
            models.Chat.user_id == current_user["id"],
            models.Message.created_at >= start_at,
            models.Message.created_at <= end_at,
        )
        .group_by(usage_date)
        .order_by(usage_date)
    )
    result = await db.execute(stmt)

    rows_by_date = {}
    for row in result.all():
        date_key = row.date.isoformat() if hasattr(row.date, "isoformat") else str(row.date)
        tokens_in = int(row.tokens_in or 0)
        tokens_out = int(row.tokens_out or 0)
        rows_by_date[date_key] = {
            "date": date_key,
            "tokensIn": tokens_in,
            "tokensOut": tokens_out,
            "totalTokens": tokens_in + tokens_out,
        }

    rows = []
    for index in range(days):
        date_key = (start_date + datetime.timedelta(days=index)).isoformat()
        rows.append(rows_by_date.get(date_key, {
            "date": date_key,
            "tokensIn": 0,
            "tokensOut": 0,
            "totalTokens": 0,
        }))

    total_in = sum(row["tokensIn"] for row in rows)
    total_out = sum(row["tokensOut"] for row in rows)

    return {
        "range": {
            "days": days,
            "startDate": start_date.isoformat(),
            "endDate": today.isoformat(),
        },
        "totals": {
            "tokensIn": total_in,
            "tokensOut": total_out,
            "totalTokens": total_in + total_out,
        },
        "rows": rows,
    }
