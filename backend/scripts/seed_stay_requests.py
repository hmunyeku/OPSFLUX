"""
Script to seed stay requests sample data in the database.
Run with: docker exec -it <backend-container> python -m scripts.seed_stay_requests
Or from backend folder: python -m scripts.seed_stay_requests
"""

import sys
import os

# Add the app directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, datetime, timedelta
from uuid import uuid4
from sqlmodel import Session, select
from app.core.db import engine
from app.models_pob import (
    StayRequest,
    StayRequestValidator,
    StayRequestTraining,
    StayRequestCertification,
    StayRequestStatus,
    ValidatorStatus,
)
from app.models import User
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


SAMPLE_STAY_REQUESTS = [
    {
        "person_name": "Jean Dupont",
        "site": "FPSO Cidade de Ilhabela",
        "project": "Maintenance Annuelle",
        "company": "Total Energies",
        "function": "Ingénieur Maintenance",
        "start_date": date.today() + timedelta(days=5),
        "end_date": date.today() + timedelta(days=19),
        "reason": "Intervention sur les systèmes hydrauliques",
        "status": StayRequestStatus.IN_VALIDATION.value,
        "validation_level": 1,
        "total_levels": 3,
        "is_first_stay": False,
        "validators": [
            {"name": "Marie Martin", "level": 1, "status": ValidatorStatus.APPROVED.value},
            {"name": "Pierre Durand", "level": 2, "status": ValidatorStatus.PENDING.value},
            {"name": "Sophie Bernard", "level": 3, "status": ValidatorStatus.PENDING.value},
        ],
        "trainings": [
            {"type": "Induction", "training_date": date.today() - timedelta(days=30), "validity_date": date.today() + timedelta(days=335), "mandatory": True},
            {"type": "Visite Médicale", "training_date": date.today() - timedelta(days=60), "validity_date": date.today() + timedelta(days=305), "mandatory": True},
            {"type": "SST", "training_date": date.today() - timedelta(days=90), "validity_date": date.today() + timedelta(days=275), "mandatory": True},
        ],
    },
    {
        "person_name": "Marc Lambert",
        "site": "Platform B - Santos Basin",
        "project": "Inspection ROV",
        "company": "Schlumberger",
        "function": "Opérateur ROV",
        "start_date": date.today() + timedelta(days=10),
        "end_date": date.today() + timedelta(days=24),
        "reason": "Inspection des risers et structures sous-marines",
        "status": StayRequestStatus.PENDING.value,
        "validation_level": 0,
        "total_levels": 2,
        "is_first_stay": True,
        "validators": [
            {"name": "Lucas Petit", "level": 1, "status": ValidatorStatus.PENDING.value},
            {"name": "Emma Roux", "level": 2, "status": ValidatorStatus.PENDING.value},
        ],
        "trainings": [
            {"type": "Induction", "training_date": None, "validity_date": None, "mandatory": True},
            {"type": "Visite Médicale", "training_date": date.today() - timedelta(days=10), "validity_date": date.today() + timedelta(days=355), "mandatory": True},
        ],
    },
    {
        "person_name": "Claire Moreau",
        "site": "FPSO Cidade de Ilhabela",
        "project": "Support HSE",
        "company": "Perenco",
        "function": "Responsable HSE",
        "start_date": date.today() - timedelta(days=5),
        "end_date": date.today() + timedelta(days=9),
        "reason": "Audit HSE trimestriel",
        "status": StayRequestStatus.APPROVED.value,
        "validation_level": 3,
        "total_levels": 3,
        "is_first_stay": False,
        "validators": [
            {"name": "Antoine Lefevre", "level": 1, "status": ValidatorStatus.APPROVED.value},
            {"name": "Julie Girard", "level": 2, "status": ValidatorStatus.APPROVED.value},
            {"name": "Thomas Blanc", "level": 3, "status": ValidatorStatus.APPROVED.value},
        ],
        "trainings": [
            {"type": "Induction", "training_date": date.today() - timedelta(days=200), "validity_date": date.today() + timedelta(days=165), "mandatory": True},
            {"type": "Visite Médicale", "training_date": date.today() - timedelta(days=100), "validity_date": date.today() + timedelta(days=265), "mandatory": True},
            {"type": "SST", "training_date": date.today() - timedelta(days=50), "validity_date": date.today() + timedelta(days=315), "mandatory": True},
            {"type": "Lutte Incendie", "training_date": date.today() - timedelta(days=120), "validity_date": date.today() + timedelta(days=245), "mandatory": True},
        ],
    },
    {
        "person_name": "Philippe Rousseau",
        "site": "Platform C - Offshore Gabon",
        "project": "Installation Équipements",
        "company": "Technip FMC",
        "function": "Chef de Projet",
        "start_date": date.today() + timedelta(days=15),
        "end_date": date.today() + timedelta(days=45),
        "reason": "Supervision installation nouvelles pompes",
        "status": StayRequestStatus.DRAFT.value,
        "validation_level": 0,
        "total_levels": 3,
        "is_first_stay": False,
        "validators": [],
        "trainings": [
            {"type": "Induction", "training_date": date.today() - timedelta(days=180), "validity_date": date.today() + timedelta(days=185), "mandatory": True},
        ],
    },
    {
        "person_name": "Isabelle Fournier",
        "site": "FPSO Cidade de Ilhabela",
        "project": "Maintenance Annuelle",
        "company": "Total Energies",
        "function": "Technicienne Instrumentation",
        "start_date": date.today() + timedelta(days=3),
        "end_date": date.today() + timedelta(days=17),
        "reason": "Calibration instruments de mesure",
        "status": StayRequestStatus.REJECTED.value,
        "validation_level": 1,
        "total_levels": 2,
        "is_first_stay": False,
        "validators": [
            {"name": "François Mercier", "level": 1, "status": ValidatorStatus.APPROVED.value},
            {"name": "Nathalie Bonnet", "level": 2, "status": ValidatorStatus.REJECTED.value},
        ],
        "trainings": [
            {"type": "Visite Médicale", "training_date": date.today() - timedelta(days=400), "validity_date": date.today() - timedelta(days=35), "mandatory": True},
        ],
    },
    {
        "person_name": "Robert Chevalier",
        "site": "Platform B - Santos Basin",
        "project": "Formation Équipage",
        "company": "Perenco",
        "function": "Formateur",
        "start_date": date.today() + timedelta(days=20),
        "end_date": date.today() + timedelta(days=27),
        "reason": "Formation sécurité offshore pour nouveaux employés",
        "status": StayRequestStatus.IN_VALIDATION.value,
        "validation_level": 2,
        "total_levels": 3,
        "is_first_stay": False,
        "validators": [
            {"name": "Céline Dubois", "level": 1, "status": ValidatorStatus.APPROVED.value},
            {"name": "Michel Perrin", "level": 2, "status": ValidatorStatus.APPROVED.value},
            {"name": "Anne Laurent", "level": 3, "status": ValidatorStatus.PENDING.value},
        ],
        "trainings": [
            {"type": "Induction", "training_date": date.today() - timedelta(days=60), "validity_date": date.today() + timedelta(days=305), "mandatory": True},
            {"type": "Visite Médicale", "training_date": date.today() - timedelta(days=45), "validity_date": date.today() + timedelta(days=320), "mandatory": True},
            {"type": "SST", "training_date": date.today() - timedelta(days=30), "validity_date": date.today() + timedelta(days=335), "mandatory": True},
        ],
    },
]


def seed_stay_requests():
    """Crée des demandes de séjour de test dans la base de données"""

    with Session(engine) as session:
        # Récupérer l'admin pour created_by_id
        admin_user = session.exec(
            select(User).where(User.is_superuser == True)
        ).first()

        if not admin_user:
            logger.warning("Aucun super utilisateur trouvé. Les demandes seront créées sans created_by_id.")

        # Vérifier si des demandes existent déjà
        existing_count = session.exec(
            select(StayRequest).where(StayRequest.deleted_at.is_(None))
        ).all()

        if len(existing_count) > 0:
            logger.info(f"{len(existing_count)} demandes de séjour existent déjà. Ajout des nouvelles demandes...")

        created_count = 0

        for req_data in SAMPLE_STAY_REQUESTS:
            validators_data = req_data.pop("validators", [])
            trainings_data = req_data.pop("trainings", [])

            # Créer la demande de séjour
            stay_request = StayRequest(
                **req_data,
                created_by_id=admin_user.id if admin_user else None
            )
            session.add(stay_request)
            session.commit()
            session.refresh(stay_request)

            # Ajouter les validateurs
            for idx, val_data in enumerate(validators_data):
                validator = StayRequestValidator(
                    stay_request_id=stay_request.id,
                    validator_name=val_data["name"],
                    level=val_data["level"],
                    status=val_data["status"],
                    validation_date=datetime.utcnow() if val_data["status"] != ValidatorStatus.PENDING.value else None,
                    created_by_id=admin_user.id if admin_user else None
                )
                session.add(validator)

            # Ajouter les formations
            for train_data in trainings_data:
                training = StayRequestTraining(
                    stay_request_id=stay_request.id,
                    type=train_data["type"],
                    training_date=train_data.get("training_date"),
                    validity_date=train_data.get("validity_date"),
                    mandatory=train_data.get("mandatory", False),
                    created_by_id=admin_user.id if admin_user else None
                )
                session.add(training)

            session.commit()
            created_count += 1
            logger.info(f"Demande créée: {stay_request.person_name} - {stay_request.site} ({stay_request.status.value})")

        logger.info(f"\n{'='*50}")
        logger.info(f"Total: {created_count} demandes de séjour créées avec succès!")
        logger.info(f"{'='*50}")


if __name__ == "__main__":
    logger.info("Démarrage du script de seed des demandes de séjour...")
    seed_stay_requests()
    logger.info("Script terminé.")
