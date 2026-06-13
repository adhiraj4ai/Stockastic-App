from django.db import models
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
import base64
import hashlib
import os

_KEYGEN_HINT = "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"


def _crypter_from_env_key(encryption_key: str) -> Fernet:
    """Build a Fernet instance from the provided ENCRYPTION_KEY. Raises ValueError if invalid."""
    raw = encryption_key.encode() if isinstance(encryption_key, str) else encryption_key
    try:
        return Fernet(raw)
    except Exception:
        raise ValueError(f"ENCRYPTION_KEY is not a valid Fernet key. Generate one with: {_KEYGEN_HINT}")


def _crypter_from_secret_key() -> Fernet:
    """Derive a Fernet key from Django's SECRET_KEY (development only)."""
    import warnings
    warnings.warn(
        "Using SECRET_KEY-derived encryption key. Set ENCRYPTION_KEY env var for production.",
        UserWarning,
    )
    derived_key = hashlib.pbkdf2_hmac(
        'sha256', settings.SECRET_KEY.encode(), b'stockastic-encryption-salt', 100000
    )
    return Fernet(base64.urlsafe_b64encode(derived_key[:32]))


def get_crypter():
    """Return a Fernet crypter using a securely derived key.

    Production: requires the ENCRYPTION_KEY environment variable (a valid Fernet key).
    Development: derives a key from SECRET_KEY via PBKDF2 (emits a UserWarning).
    """
    encryption_key = os.environ.get('ENCRYPTION_KEY')
    if encryption_key:
        return _crypter_from_env_key(encryption_key)
    if not settings.DEBUG:
        raise RuntimeError(
            f"ENCRYPTION_KEY environment variable is required in production. Generate one with: {_KEYGEN_HINT}"
        )
    return _crypter_from_secret_key()

class EncryptedField(models.Field):
    def __init__(self, *args, **kwargs):
        self.internal_type = kwargs.pop('internal_type', 'CharField')
        super().__init__(*args, **kwargs)

    def get_internal_type(self):
        return "TextField" # Store as text (base64)

    def from_db_value(self, value, expression, connection):
        if value is None:
            return value
        try:
            return get_crypter().decrypt(value.encode()).decode()
        except (InvalidToken, Exception):
            return value # Return raw if decryption fails (e.g. old data)

    def get_prep_value(self, value):
        if value is None:
            return value
        return get_crypter().encrypt(str(value).encode()).decode()

    def to_python(self, value):
        if value is None:
            return value
        return str(value)

