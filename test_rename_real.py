"""Definitive test: does Gouti really persist name_ta changes?

Renames the task to a unique timestamp-based value, then re-fetches
the task directly from Gouti to verify whether the change stuck.
"""
import asyncio
import json
import sys
import time

sys.path.insert(0, "/opt/opsflux")
from app.mcp.gouti_tools import _find_gouti_settings, GoutiApiClient


async def main():
    _, settings = await _find_gouti_settings()
    client = GoutiApiClient(
        base_url=settings.get("base_url", "https://apiprd.gouti.net/v1/client"),
        client_id=settings["client_id"],
        client_secret=settings.get("client_secret", ""),
        entity_code=settings.get("entity_code", ""),
        token=settings.get("token"),
    )
    pid, tid = "43000", "2021180"

    # 1. Current name
    resp = await client.call(f"projects/{pid}/tasks/{tid}")
    data = resp.get("data")
    current_name = None
    if isinstance(data, dict):
        current_name = data.get("name_ta") or (data.get("data") or {}).get("name_ta")
    elif isinstance(data, list) and data:
        current_name = data[0].get("name_ta")
    print(f"BEFORE: name_ta = {current_name!r}")

    # 2. Try rename to a unique value
    unique = f"MCP-TEST-{int(time.time())}"
    print(f"\nAttempting rename to: {unique!r}")
    upd = await client.call(f"projects/{pid}/tasks/{tid}", "POST", {"name_ta": unique})
    print(f"  response: {json.dumps(upd.get('data'), ensure_ascii=False)[:300]}")

    # 3. Re-fetch (via GET endpoint directly — bypass any cache)
    await asyncio.sleep(1)
    resp = await client.call(f"projects/{pid}/tasks/{tid}")
    data = resp.get("data")
    after_name = None
    if isinstance(data, dict):
        after_name = data.get("name_ta") or (data.get("data") or {}).get("name_ta")
    elif isinstance(data, list) and data:
        after_name = data[0].get("name_ta")
    print(f"\nAFTER rename: name_ta = {after_name!r}")

    persisted = after_name == unique
    print(f"\n=> PERSISTED: {persisted}")

    # 4. Also try the list endpoint to see if it matches
    list_resp = await client.call(f"projects/{pid}/tasks")
    ldata = list_resp.get("data")
    from_list = None
    if isinstance(ldata, list):
        for t in ldata:
            if str(t.get("ref_ta")) == tid:
                from_list = t.get("name_ta")
                break
    print(f"AFTER (from list endpoint): name_ta = {from_list!r}")

    # 5. Restore original name
    if current_name:
        print(f"\nRestoring original name: {current_name!r}")
        await client.call(f"projects/{pid}/tasks/{tid}", "POST", {"name_ta": current_name})

    await client.close()


asyncio.run(main())
