import asyncio, json, sys
sys.path.insert(0, '/opt/opsflux')
from app.core.database import async_session_factory
from sqlalchemy import text

async def main():
    async with async_session_factory() as db:
        rows = await db.execute(text("SELECT widgets FROM dashboard_tabs WHERE module='planner' LIMIT 1"))
        row = rows.fetchone()
        if row:
            widgets = row[0] if isinstance(row[0], list) else []
            for w in widgets:
                print(json.dumps({k: w.get(k) for k in ['id','title','type','x','y','w','h','config']}))

asyncio.run(main())
