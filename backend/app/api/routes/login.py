from datetime import timedelta
from typing import Annotated, Any, Union

import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm

from app import crud
from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core import security
from app.core.config import settings
from app.core.security import get_password_hash, create_2fa_temp_token, ALGORITHM
from app.core.twofa_service import TwoFactorService
from app.models import (
    Message,
    NewPassword,
    Token,
    Token2FARequired,
    TwoFactorLoginRequest,
    TokenPayload,
    UserPublic,
    User,
)
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)

router = APIRouter(tags=["login"])


@router.post("/login/access-token")
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Union[Token, Token2FARequired]:
    """
    OAuth2 compatible token login, get an access token for future requests.
    If 2FA is enabled, returns a temporary token and requires_2fa flag.
    """
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Vérifier si le 2FA est activé pour cet utilisateur
    twofa_config = TwoFactorService.get_config(session=session, user=user)

    if twofa_config and twofa_config.is_enabled:
        # 2FA activé - retourner un token temporaire
        temp_token = create_2fa_temp_token(user.id)

        # Déterminer les méthodes disponibles
        available_methods = []
        if twofa_config.totp_secret and twofa_config.totp_verified_at:
            available_methods.append("totp")
        if twofa_config.phone_number and twofa_config.phone_verified_at:
            available_methods.append("sms")
        if twofa_config.backup_codes:
            available_methods.append("backup")

        # Masquer le numéro de téléphone
        masked_phone = None
        if twofa_config.phone_number:
            masked_phone = TwoFactorService.mask_phone_number(twofa_config.phone_number)

        return Token2FARequired(
            requires_2fa=True,
            temp_token=temp_token,
            available_methods=available_methods,
            masked_phone=masked_phone,
        )

    # Pas de 2FA - retourner un token d'accès normal
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=security.create_access_token(
            user.id, expires_delta=access_token_expires
        )
    )


@router.post("/login/verify-2fa")
def verify_2fa_login(
    session: SessionDep, request: TwoFactorLoginRequest
) -> Token:
    """
    Vérifier le code 2FA et retourner un token d'accès complet.
    Le temp_token doit être valide et de type '2fa_temp'.
    """
    # Décoder et valider le token temporaire
    try:
        payload = jwt.decode(
            request.temp_token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired temporary token",
        )

    # Vérifier que c'est bien un token temporaire 2FA
    if token_data.type != "2fa_temp":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid token type",
        )

    # Récupérer l'utilisateur
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Récupérer la config 2FA
    twofa_config = TwoFactorService.get_config(session=session, user=user)
    if not twofa_config or not twofa_config.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA not enabled for this user",
        )

    # Vérifier le code selon la méthode
    is_valid = False

    if request.method == "totp" and twofa_config.totp_secret:
        is_valid = TwoFactorService.verify_totp_code(
            twofa_config.totp_secret, request.code
        )
    elif request.method == "sms":
        is_valid = TwoFactorService.verify_sms_code(
            session=session, user=user, code=request.code
        )
    elif request.method == "backup":
        is_valid = TwoFactorService.verify_backup_code(
            session=session, user=user, code=request.code
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 2FA method",
        )

    if not is_valid:
        # Incrémenter le compteur de tentatives échouées
        twofa_config.failed_attempts = (twofa_config.failed_attempts or 0) + 1
        session.add(twofa_config)
        session.commit()

        # Bloquer après 5 tentatives échouées
        if twofa_config.failed_attempts >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed attempts. Please try again later.",
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code",
        )

    # Code valide - réinitialiser le compteur de tentatives et mettre à jour last_used_at
    from datetime import datetime, timezone

    twofa_config.failed_attempts = 0
    twofa_config.last_used_at = datetime.now(timezone.utc)
    session.add(twofa_config)
    session.commit()

    # Retourner un vrai token d'accès
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return Token(
        access_token=security.create_access_token(
            user.id, expires_delta=access_token_expires
        )
    )


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token
    """
    return current_user


@router.post("/password-recovery/{email}")
def recover_password(email: str, session: SessionDep) -> Message:
    """
    Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )
    send_email(
        email_to=user.email,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Password recovery email sent")


@router.post("/reset-password/")
def reset_password(session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password
    """
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this email does not exist in the system.",
        )
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    hashed_password = get_password_hash(password=body.new_password)
    user.hashed_password = hashed_password
    session.add(user)
    session.commit()
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(email=email)
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
