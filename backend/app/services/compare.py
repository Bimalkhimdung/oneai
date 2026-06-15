import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import schemas
from app.providers.base import ProviderConnectInfo
from app.providers.registry import get_adapter
from app.services.chat import load_model_and_server
from app.services.server import decrypt_api_key

logger = logging.getLogger("app.compare")


async def compare_models(
    db: AsyncSession,
    user_id: str,
    input_data: schemas.CompareInput,
) -> schemas.CompareResponseDto:
    models = [
        await load_model_and_server(db, model_id, user_id)
        for model_id in input_data.modelIds
    ]

    async def run_model(model) -> schemas.CompareResultDto:
        adapter = get_adapter(model.server.provider.value)
        api_key = decrypt_api_key(model.server)
        conn_info = ProviderConnectInfo(
            host=model.server.host,
            port=model.server.port,
            apiKey=api_key,
        )

        assembled = ""
        totals = {}
        try:
            async for chunk in adapter.chat_stream(
                conn_info,
                model=model.name,
                messages=[{"role": "user", "content": input_data.prompt}],
            ):
                if chunk.delta:
                    assembled += chunk.delta
                if chunk.done:
                    totals = {
                        "tokensIn": chunk.tokensIn,
                        "tokensOut": chunk.tokensOut,
                        "durationMs": chunk.durationMs,
                    }

            return schemas.CompareResultDto(
                modelId=model.id,
                modelName=model.name,
                content=assembled,
                tokensIn=totals.get("tokensIn"),
                tokensOut=totals.get("tokensOut"),
                durationMs=totals.get("durationMs"),
            )
        except Exception as exc:
            logger.warning("Compare failed for model %s: %s", model.name, exc)
            return schemas.CompareResultDto(
                modelId=model.id,
                modelName=model.name,
                content="",
                error=str(exc),
            )

    results = await asyncio.gather(*(run_model(model) for model in models))
    return schemas.CompareResponseDto(prompt=input_data.prompt, results=list(results))
