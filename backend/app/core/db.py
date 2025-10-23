from sqlmodel import Session, create_engine, select

from app import crud
from app.core.config import settings
from app.models import User, UserCreate
from app.models_rbac import Role

# Configuration du pool de connexions pour supporter Celery et le backend
engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    pool_size=20,  # Augmenté de 5 à 20 pour supporter les workers Celery
    max_overflow=40,  # Augmenté de 10 à 40 pour les pics de charge
    pool_pre_ping=True,  # Vérifie la connexion avant utilisation
    pool_recycle=3600,  # Recycle les connexions après 1h
)


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    # from sqlmodel import SQLModel

    # This works because the models are already imported and registered from app.models
    # SQLModel.metadata.create_all(engine)

    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
        )
        user = crud.create_user(session=session, user_create=user_in)

        # Assigner automatiquement le rôle admin au superuser
        admin_role = session.exec(select(Role).where(Role.code == "admin")).first()
        if admin_role and user:
            user.roles.append(admin_role)
            session.add(user)
            session.commit()
            session.refresh(user)
