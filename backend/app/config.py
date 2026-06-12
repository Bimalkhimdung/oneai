import re
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator

class Settings(BaseSettings):
    NODE_ENV: str = "development"
    API_PORT: int = 4000
    WEB_ORIGIN: str = "http://localhost:3000"
    
    DATABASE_URL: str
    REDIS_URL: str
    
    JWT_ACCESS_SECRET: str
    JWT_REFRESH_SECRET: str
    JWT_ACCESS_TTL: str = "15m"
    JWT_REFRESH_TTL_DAYS: int = 30
    
    ENCRYPTION_KEY: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    LOG_LEVEL: str = "info"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
            
        # Strip "?schema=..." since asyncpg doesn't support this Prisma parameter
        if "?" in url:
            base, query = url.split("?", 1)
            params = [p for p in query.split("&") if not p.startswith("schema=")]
            if params:
                url = f"{base}?{'&'.join(params)}"
            else:
                url = base
        return url

    @property
    def jwt_access_ttl_seconds(self) -> int:
        match = re.match(r"^(\d+)([smh])$", self.JWT_ACCESS_TTL)
        if not match:
            return 900
        val = int(match.group(1))
        unit = match.group(2)
        if unit == "s":
            return val
        elif unit == "m":
            return val * 60
        elif unit == "h":
            return val * 3600
        return 900

settings = Settings()
