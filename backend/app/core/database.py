from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Ensure migration columns exist in SQLite if jobs table was created previously
        try:
            result = await conn.exec_driver_sql("PRAGMA table_info(jobs)")
            cols = [row[1] for row in result.fetchall()]
            if cols and "stage_outputs" not in cols:
                await conn.exec_driver_sql("ALTER TABLE jobs ADD COLUMN stage_outputs TEXT DEFAULT '{}'")
            if cols and "target_stage" not in cols:
                await conn.exec_driver_sql("ALTER TABLE jobs ADD COLUMN target_stage VARCHAR(50) DEFAULT 'all'")
        except Exception as e:
            print(f"[DB MIGRATION NOTICE] {e}")