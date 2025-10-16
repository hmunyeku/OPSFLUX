"""add_default_system_hooks

Revision ID: 98bb2dda688e
Revises: o0p1q2r3s4t5
Create Date: 2025-10-16 21:12:53.471926

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from datetime import datetime
import uuid


# revision identifiers, used by Alembic.
revision = '98bb2dda688e'
down_revision = 'o0p1q2r3s4t5'
branch_labels = None
depends_on = None


def upgrade():
    """
    Insère les hooks système par défaut
    """

    # Récupérer la connexion
    connection = op.get_bind()

    # Récupérer l'ID du premier superuser pour created_by
    result = connection.execute(
        sa.text('SELECT id FROM "user" WHERE is_superuser = true LIMIT 1')
    )
    superuser_row = result.fetchone()
    superuser_id = str(superuser_row[0]) if superuser_row else None

    now = datetime.utcnow()

    # Définir les hooks système par défaut
    default_hooks = [
        {
            'id': str(uuid.uuid4()),
            'name': 'Notification création utilisateur',
            'event': 'user.created',
            'description': 'Envoie une notification de bienvenue lors de la création d\'un utilisateur',
            'priority': 100,
            'is_active': True,
            'conditions': None,
            'actions': [
                {
                    'type': 'send_notification',
                    'config': {
                        'title': 'Bienvenue sur OpsFlux',
                        'message': 'Votre compte a été créé avec succès.',
                        'type': 'success'
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Email création utilisateur',
            'event': 'user.created',
            'description': 'Envoie un email de bienvenue au nouvel utilisateur',
            'priority': 90,
            'is_active': False,
            'conditions': None,
            'actions': [
                {
                    'type': 'send_email',
                    'config': {
                        'template': 'welcome',
                        'subject': 'Bienvenue sur OpsFlux'
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Notification modification utilisateur',
            'event': 'user.updated',
            'description': 'Notifie l\'utilisateur de modifications sur son compte',
            'priority': 80,
            'is_active': True,
            'conditions': None,
            'actions': [
                {
                    'type': 'send_notification',
                    'config': {
                        'title': 'Compte mis à jour',
                        'message': 'Votre profil a été modifié.',
                        'type': 'info'
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Audit suppression utilisateur',
            'event': 'user.deleted',
            'description': 'Crée un log d\'audit lors de la suppression d\'un utilisateur',
            'priority': 100,
            'is_active': True,
            'conditions': None,
            'actions': [
                {
                    'type': 'create_task',
                    'config': {
                        'task_type': 'audit_log',
                        'severity': 'high'
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Notification changement rôle',
            'event': 'role.assigned',
            'description': 'Notifie un utilisateur lorsqu\'un nouveau rôle lui est attribué',
            'priority': 90,
            'is_active': True,
            'conditions': None,
            'actions': [
                {
                    'type': 'send_notification',
                    'config': {
                        'title': 'Nouveau rôle',
                        'message': 'Un nouveau rôle vous a été attribué.',
                        'type': 'info'
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Webhook événement système',
            'event': 'system.error',
            'description': 'Appelle un webhook externe en cas d\'erreur système critique',
            'priority': 100,
            'is_active': False,
            'conditions': {
                'severity': {'>=': 8}
            },
            'actions': [
                {
                    'type': 'call_webhook',
                    'config': {
                        'url': 'https://monitoring.example.com/alert',
                        'method': 'POST'
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Notification incident HSE',
            'event': 'incident.created',
            'description': 'Envoie une alerte lors de la création d\'un incident HSE',
            'priority': 100,
            'is_active': False,
            'conditions': None,
            'actions': [
                {
                    'type': 'send_notification',
                    'config': {
                        'title': 'Nouvel incident HSE',
                        'message': 'Un nouvel incident a été déclaré.',
                        'type': 'warning'
                    }
                },
                {
                    'type': 'send_email',
                    'config': {
                        'template': 'incident_alert',
                        'recipients': ['hse-manager@example.com']
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Notification réservation approuvée',
            'event': 'booking.approved',
            'description': 'Notifie l\'utilisateur de l\'approbation de sa réservation',
            'priority': 90,
            'is_active': False,
            'conditions': None,
            'actions': [
                {
                    'type': 'send_notification',
                    'config': {
                        'title': 'Réservation approuvée',
                        'message': 'Votre réservation a été approuvée.',
                        'type': 'success'
                    }
                },
                {
                    'type': 'send_email',
                    'config': {
                        'template': 'booking_confirmation'
                    }
                }
            ],
            'created_by_id': superuser_id,
            'created_at': now,
            'updated_at': now
        }
    ]

    # Insérer les hooks
    import json
    for hook in default_hooks:
        connection.execute(
            sa.text("""
                INSERT INTO hook (
                    id, name, event, description, priority, is_active,
                    conditions, actions, created_by_id, created_at, updated_at
                )
                VALUES (
                    :id, :name, :event, :description, :priority, :is_active,
                    CAST(:conditions AS jsonb), CAST(:actions AS jsonb), :created_by_id, :created_at, :updated_at
                )
            """),
            {
                'id': hook['id'],
                'name': hook['name'],
                'event': hook['event'],
                'description': hook['description'],
                'priority': hook['priority'],
                'is_active': hook['is_active'],
                'conditions': json.dumps(hook['conditions']) if hook['conditions'] is not None else None,
                'actions': json.dumps(hook['actions']),
                'created_by_id': hook['created_by_id'],
                'created_at': hook['created_at'],
                'updated_at': hook['updated_at']
            }
        )


def downgrade():
    """
    Supprime les hooks système par défaut
    """
    connection = op.get_bind()

    # Liste des événements des hooks par défaut
    default_events = [
        'user.created',
        'user.updated',
        'user.deleted',
        'role.assigned',
        'system.error',
        'incident.created',
        'booking.approved'
    ]

    # Supprimer les hooks par événement
    for event in default_events:
        connection.execute(
            sa.text("DELETE FROM hook WHERE event = :event"),
            {'event': event}
        )
