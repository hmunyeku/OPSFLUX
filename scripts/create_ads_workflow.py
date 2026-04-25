"""Create the complete AdS validation workflow."""
import asyncio
import json
from uuid import UUID

import httpx


async def main():
    from app.core.security import create_access_token
    token = create_access_token(
        user_id=UUID("f9c04141-2852-4b59-bfbf-1a1cb05b2de4"),
        tenant_schema="public",
        entity_id=UUID("bceac7bc-1ae8-437b-a6e7-d83d4224d1b6"),
        roles=["SUPER_ADMIN"],
    )

    nodes = [
        # ── Entrée ──
        {"id": "start", "type": "start", "label": "Soumission AdS",
         "config": {}, "position": {"x": 100, "y": 0}},

        # ── Étape 0-A: Validation initiateur (si créé par proxy) ──
        {"id": "cond-proxy", "type": "condition", "label": "Créé par proxy ?",
         "config": {"expression": "created_by != requester_id"}, "position": {"x": 100, "y": 80}},
        {"id": "val-initiateur", "type": "human_validation", "label": "Confirmation initiateur",
         "config": {"role": "DEMANDEUR"}, "position": {"x": 350, "y": 80}},

        # ── Étape 0-B: Validation chef projet (si lié à un projet) ──
        {"id": "cond-projet", "type": "condition", "label": "Lié à un projet ?",
         "config": {"expression": "planner_activity_id IS NOT NULL"}, "position": {"x": 100, "y": 170}},
        {"id": "val-chef-projet", "type": "human_validation", "label": "Valid. Chef Projet",
         "config": {"role": "CHEF_PROJ"}, "position": {"x": 350, "y": 170}},

        # ── Étape 1: Contrôle conformité HSE (automatique) ──
        {"id": "check-hse", "type": "system_check", "label": "Contrôle HSE",
         "config": {"check_name": "compliance_matrix_check"}, "position": {"x": 100, "y": 260}},
        {"id": "cond-conforme", "type": "condition", "label": "PAX conforme ?",
         "config": {}, "position": {"x": 100, "y": 340}},
        {"id": "notif-chse", "type": "notification", "label": "Alerte CHSE",
         "config": {"template": "pax_blocked_hse", "role": "CHSE"}, "position": {"x": 350, "y": 340}},

        # ── Étape 2: Validation CDS (N1) ──
        {"id": "val-cds", "type": "human_validation", "label": "Valid. CDS (N1)",
         "config": {"role": "CDS"}, "position": {"x": 100, "y": 430}},

        # ── Étape 3: Validation DPROD (N2, optionnel) ──
        {"id": "cond-n2", "type": "condition", "label": "N2 requis ?",
         "config": {"expression": "site_requires_n2"}, "position": {"x": 100, "y": 520}},
        {"id": "val-dprod", "type": "human_validation", "label": "Valid. DPROD (N2)",
         "config": {"role": "DPROD"}, "position": {"x": 350, "y": 520}},

        # ── Arbitrage quota ──
        {"id": "cond-quota", "type": "condition", "label": "Quota dépassé ?",
         "config": {"expression": "site_capacity_exceeded"}, "position": {"x": 100, "y": 610}},
        {"id": "val-do", "type": "human_validation", "label": "Arbitrage DO",
         "config": {"role": "DO"}, "position": {"x": 350, "y": 610}},

        # ── Notifications & sorties ──
        {"id": "notif-ok", "type": "notification", "label": "Notif. approbation",
         "config": {"template": "ads_approved"}, "position": {"x": 100, "y": 700}},
        {"id": "end-ok", "type": "end_approved", "label": "Approuvé",
         "config": {}, "position": {"x": 100, "y": 780}},
        {"id": "end-rejected", "type": "end_rejected", "label": "Rejeté",
         "config": {}, "position": {"x": 550, "y": 430}},
        {"id": "end-cancelled", "type": "end_cancelled", "label": "Annulé",
         "config": {}, "position": {"x": 550, "y": 80}},
    ]

    edges = [
        # Main flow
        {"id": "e-start-proxy", "source": "start", "target": "cond-proxy"},

        # Proxy check
        {"id": "e-proxy-oui", "source": "cond-proxy", "target": "val-initiateur", "label": "Oui"},
        {"id": "e-proxy-non", "source": "cond-proxy", "target": "cond-projet", "label": "Non"},
        {"id": "e-init-ok", "source": "val-initiateur", "target": "cond-projet", "label": "Confirmé"},
        {"id": "e-init-cancel", "source": "val-initiateur", "target": "end-cancelled", "label": "Refusé"},

        # Project check
        {"id": "e-proj-oui", "source": "cond-projet", "target": "val-chef-projet", "label": "Oui"},
        {"id": "e-proj-non", "source": "cond-projet", "target": "check-hse", "label": "Non"},
        {"id": "e-chefproj-ok", "source": "val-chef-projet", "target": "check-hse", "label": "Approuvé"},
        {"id": "e-chefproj-ko", "source": "val-chef-projet", "target": "end-rejected", "label": "Rejeté"},

        # HSE check (auto)
        {"id": "e-hse-check", "source": "check-hse", "target": "cond-conforme", "trigger": "auto"},
        {"id": "e-conforme-oui", "source": "cond-conforme", "target": "val-cds", "label": "Conforme"},
        {"id": "e-conforme-non", "source": "cond-conforme", "target": "notif-chse", "label": "Bloqué"},
        {"id": "e-chse-resolve", "source": "notif-chse", "target": "val-cds", "label": "Résolu"},

        # CDS validation (N1)
        {"id": "e-cds-ok", "source": "val-cds", "target": "cond-n2", "label": "Approuvé"},
        {"id": "e-cds-ko", "source": "val-cds", "target": "end-rejected", "label": "Rejeté"},

        # N2 check
        {"id": "e-n2-oui", "source": "cond-n2", "target": "val-dprod", "label": "Oui"},
        {"id": "e-n2-non", "source": "cond-n2", "target": "cond-quota", "label": "Non"},
        {"id": "e-dprod-ok", "source": "val-dprod", "target": "cond-quota", "label": "Approuvé"},
        {"id": "e-dprod-ko", "source": "val-dprod", "target": "end-rejected", "label": "Rejeté"},

        # Quota check
        {"id": "e-quota-oui", "source": "cond-quota", "target": "val-do", "label": "Oui"},
        {"id": "e-quota-non", "source": "cond-quota", "target": "notif-ok", "label": "Non"},
        {"id": "e-do-ok", "source": "val-do", "target": "notif-ok", "label": "Approuvé"},
        {"id": "e-do-ko", "source": "val-do", "target": "end-rejected", "label": "Rejeté"},

        # Final
        {"id": "e-notif-end", "source": "notif-ok", "target": "end-ok", "trigger": "auto"},
    ]

    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        resp = await client.post(
            "/api/v1/workflow/definitions",
            json={
                "name": "Validation Avis de Séjour",
                "description": (
                    "Workflow complet de validation AdS : proxy → projet → HSE → "
                    "CDS(N1) → DPROD(N2) → arbitrage DO. "
                    "Conforme au cahier des charges PaxLog."
                ),
                "entity_type": "avis_sejour",
                "nodes": nodes,
                "edges": edges,
            },
            headers={
                "Authorization": f"Bearer {token}",
                "X-Entity-ID": "bceac7bc-1ae8-437b-a6e7-d83d4224d1b6",
            },
        )
        print(f"Status: {resp.status_code}")
        data = resp.json()
        if resp.status_code == 201:
            print(f"ID: {data['id']}")
            print(f"Name: {data['name']}")
            print(f"Nodes: {len(data.get('nodes', []))}")
            print(f"Edges: {len(data.get('edges', []))}")
        else:
            print(f"Error: {json.dumps(data, indent=2)}")


asyncio.run(main())
