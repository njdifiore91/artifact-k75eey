"""
User management router module implementing secure authentication, registration,
and profile management endpoints for the Art Knowledge Graph API Gateway.
"""

from datetime import datetime, timedelta
from typing import Dict, Optional
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, HTTPException, Security
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import EmailStr

from api_gateway.schemas.user import UserBase, UserCreate, UserUpdate, UserResponse
from shared.schemas.error import ErrorResponse, ValidationError

# Security configurations
JWT_SECRET_KEY = "your-secret-key"  # Should be loaded from secure environment
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Initialize components
router = APIRouter(prefix="/users", tags=["users"])
limiter = Limiter(key_func=get_remote_address)
ph = PasswordHasher()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="users/login")

# Configure security logging
logger = logging.getLogger("security")
logger.setLevel(logging.INFO)

@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("10/minute")
async def register_user(
    user_data: UserCreate,
    request: Request
) -> UserResponse:
    """
    Securely registers a new user with comprehensive validation and security measures.

    Args:
        user_data: User registration data
        request: FastAPI request object

    Returns:
        UserResponse: Created user data with JWT token

    Raises:
        ValidationError: If registration data is invalid
        HTTPException: If registration fails
    """
    try:
        # Log registration attempt
        logger.info(
            "Registration attempt",
            extra={
                "ip": request.client.host,
                "email": user_data.email,
                "request_id": str(uuid4())
            }
        )

        # Additional email validation
        if not await _is_email_allowed(user_data.email):
            raise ValidationError(
                message="Email domain not allowed",
                errors=[{"field": "email", "message": "Please use a valid email domain"}]
            )

        # Check if email exists
        if await _get_user_by_email(user_data.email):
            raise ValidationError(
                message="Email already registered",
                errors=[{"field": "email", "message": "This email is already in use"}]
            )

        # Hash password securely
        hashed_password = ph.hash(user_data.password)

        # Create user record
        user = {
            "id": str(uuid4()),
            "email": user_data.email,
            "name": user_data.name,
            "password_hash": hashed_password,
            "premium_status": False,
            "preferences": {},
            "created_at": datetime.utcnow(),
            "last_login": None
        }

        # Store user in database (implementation needed)
        # await database.users.insert(user)

        # Generate JWT token
        access_token = _create_access_token(
            data={"sub": user["email"]},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        # Log successful registration
        logger.info(
            "User registered successfully",
            extra={
                "user_id": user["id"],
                "email": user["email"]
            }
        )

        return UserResponse(
            **user,
            access_token=access_token,
            token_type="bearer"
        )

    except ValidationError as ve:
        logger.warning(
            "Registration validation failed",
            extra={
                "email": user_data.email,
                "errors": ve.errors
            }
        )
        raise
    except Exception as e:
        logger.error(
            "Registration failed",
            extra={
                "email": user_data.email,
                "error": str(e)
            }
        )
        raise HTTPException(
            status_code=500,
            detail="Registration failed. Please try again later."
        )

@router.post("/login")
@limiter.limit("5/minute")
async def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request
) -> Dict:
    """
    Authenticates user with secure password verification and rate limiting.

    Args:
        form_data: OAuth2 password request form
        request: FastAPI request object

    Returns:
        Dict: JWT token and user data

    Raises:
        HTTPException: If authentication fails
    """
    try:
        # Log login attempt
        logger.info(
            "Login attempt",
            extra={
                "ip": request.client.host,
                "email": form_data.username,
                "request_id": str(uuid4())
            }
        )

        # Get user from database
        user = await _get_user_by_email(form_data.username)
        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )

        # Verify password with timing-safe comparison
        try:
            ph.verify(user["password_hash"], form_data.password)
        except VerifyMismatchError:
            logger.warning(
                "Failed login attempt",
                extra={
                    "email": form_data.username,
                    "ip": request.client.host
                }
            )
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )

        # Check if password needs rehash
        if ph.check_needs_rehash(user["password_hash"]):
            new_hash = ph.hash(form_data.password)
            # Update password hash in database
            # await database.users.update_password_hash(user["id"], new_hash)

        # Generate JWT token
        access_token = _create_access_token(
            data={"sub": user["email"]},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        # Update last login
        # await database.users.update_last_login(user["id"], datetime.utcnow())

        # Log successful login
        logger.info(
            "Login successful",
            extra={
                "user_id": user["id"],
                "email": user["email"]
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": UserResponse(**user)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Login failed",
            extra={
                "email": form_data.username,
                "error": str(e)
            }
        )
        raise HTTPException(
            status_code=500,
            detail="Login failed. Please try again later."
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user(
    token: str = Depends(oauth2_scheme)
) -> UserResponse:
    """
    Retrieves current authenticated user's profile.

    Args:
        token: JWT token from OAuth2 scheme

    Returns:
        UserResponse: Current user's profile data

    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication credentials"
            )
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication credentials"
        )

    user = await _get_user_by_email(email)
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return UserResponse(**user)

# Helper functions
def _create_access_token(
    data: Dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Creates secure JWT token with expiration."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

async def _get_user_by_email(email: EmailStr) -> Optional[Dict]:
    """Retrieves user by email from database."""
    # Database implementation needed
    # return await database.users.get_by_email(email)
    pass

async def _is_email_allowed(email: EmailStr) -> bool:
    """Validates email against allowlist and security policies."""
    # Implementation needed
    # Check domain against allowlist
    # Verify domain reputation
    # Check for disposable email providers
    return True