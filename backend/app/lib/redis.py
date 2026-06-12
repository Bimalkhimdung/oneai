import redis.asyncio as aioredis
from app.config import settings

# Initialize async redis clients
redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
pub_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
sub_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
