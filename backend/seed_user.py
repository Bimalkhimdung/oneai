import asyncio

from app import crud
from app.models.database import AsyncSessionLocal
from app.services.auth import hash_password


EMAIL = "bimalkhimdung@gmail.com"
PASSWORD = "password"
FULL_NAME = "Bimal Khimdung"


async def seed_user() -> None:
    async with AsyncSessionLocal() as db:
        password_hash = hash_password(PASSWORD)
        existing = await crud.get_user_by_email(db, EMAIL)

        if existing:
            existing.password_hash = password_hash
            existing.full_name = existing.full_name or FULL_NAME
            await db.commit()
            print(f"Updated existing user: {EMAIL}")
            return

        await crud.create_user(
            db,
            email=EMAIL,
            password_hash=password_hash,
            full_name=FULL_NAME,
        )
        print(f"Created user: {EMAIL}")


if __name__ == "__main__":
    asyncio.run(seed_user())
