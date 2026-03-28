"""Create test pipeline data via API."""
import requests

BASE = "https://api.opsflux.io/api/v1"

# Login
r = requests.post(f"{BASE}/auth/login", json={"email": "admin@opsflux.io", "password": "Admin@2026!"})
print("Login:", r.status_code)
if r.status_code != 200:
    print(r.text[:200])
    exit()
token = r.json()["access_token"]
h = {"Authorization": f"Bearer {token}"}

# List installations
r2 = requests.get(f"{BASE}/asset-registry/installations?page_size=5", headers=h)
print("Installations:", r2.status_code)
items = r2.json().get("items", [])

if not items:
    print("No installations found, creating hierarchy...")

    # Create field
    rf = requests.post(f"{BASE}/asset-registry/fields", headers=h, json={
        "field_code": "TST-FLD", "name": "Champ Test Gabon", "country": "GA",
        "status": "PRODUCING", "latitude": 0.4, "longitude": 9.5
    })
    print("Field:", rf.status_code, rf.json().get("id", "")[:8] if rf.ok else rf.text[:100])
    field_id = rf.json()["id"] if rf.ok else None

    # Create site
    rs = requests.post(f"{BASE}/asset-registry/sites", headers=h, json={
        "site_code": "TST-SITE", "name": "Site Offshore Test",
        "field_id": field_id, "site_type": "OFFSHORE", "status": "OPERATIONAL"
    })
    print("Site:", rs.status_code, rs.json().get("id", "")[:8] if rs.ok else rs.text[:100])
    site_id = rs.json()["id"] if rs.ok else None

    # Create 2 installations
    for i, name in enumerate(["Platform Alpha", "Platform Beta"]):
        ri = requests.post(f"{BASE}/asset-registry/installations", headers=h, json={
            "installation_code": f"PLT-{chr(65+i)}", "name": name, "site_id": site_id,
            "installation_type": "PLATFORM", "status": "OPERATIONAL",
            "latitude": 0.4 + i * 0.01, "longitude": 9.5 + i * 0.01
        })
        print(f"Installation {name}:", ri.status_code, ri.json().get("id", "")[:8] if ri.ok else ri.text[:100])

    # Re-fetch
    r2 = requests.get(f"{BASE}/asset-registry/installations?page_size=5", headers=h)
    items = r2.json().get("items", [])

for i in items[:5]:
    print(f"  {i['id'][:12]}... {i.get('name', '?')} ({i.get('installation_type', '?')})")

# Create pipeline
if len(items) >= 2:
    from_id = items[0]["id"]
    to_id = items[1]["id"]
    rp = requests.post(f"{BASE}/asset-registry/pipelines", headers=h, json={
        "pipeline_id": "PL-001",
        "name": "Pipeline Test Alpha-Beta",
        "service": "OIL",
        "status": "OPERATIONAL",
        "from_installation_id": from_id,
        "to_installation_id": to_id,
        "nominal_diameter_in": 12.0,
        "design_pressure_barg": 150.0,
        "total_length_km": 3.5,
        "pipe_material": "Carbon Steel",
        "design_code": "DNV-OS-F101",
    })
    print(f"Pipeline: {rp.status_code}")
    if rp.ok:
        print(f"  Created: {rp.json()['id'][:12]}... {rp.json()['name']}")
    else:
        print(f"  Error: {rp.text[:300]}")
else:
    print("Not enough installations to create pipeline")
