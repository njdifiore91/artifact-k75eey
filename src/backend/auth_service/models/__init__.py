"""
Auth service models package initialization.
Provides secure exposure of the User model for authentication and user management
while maintaining proper data protection through controlled exports.

Version: 1.0.0
"""

from .user import User

# Explicitly define exports to prevent unintended exposure
__all__ = ["User"]