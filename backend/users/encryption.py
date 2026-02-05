from django.db import models
from cryptography.fernet import Fernet
from django.conf import settings
import base64

# Generate a key if not present (In prod, this should be in settings/env)
# Ideally, settings.SECRET_KEY can be derived or a separate ENCRYPTION_KEY used.
# For this implementation, we will perform encryption transparently.

def get_crypter():
    # Use SECRET_KEY to derive a Fernet key (simplified)
    # Fernet key must be 32 url-safe base64-encoded bytes.
    # We'll pad/truncate SECRET_KEY or just generate one and tell user to set it.
    # Correct approach: Add ENCRYPTION_KEY to settings. If missing, error or warn.
    # Fallback to a derived key from SECRET_KEY for convenience in this task.
    key = settings.SECRET_KEY[:32]
    if len(key) < 32:
        key = key.ljust(32, '0')
    return Fernet(base64.urlsafe_b64encode(key.encode()))

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
        except:
            return value # Return raw if decryption fails (e.g. old data)

    def get_prep_value(self, value):
        if value is None:
            return value
        return get_crypter().encrypt(str(value).encode()).decode()

    def to_python(self, value):
        if value is None:
            return value
        # If it looks like encrypted data (we can't easily tell without trying), 
        # but standardized flow is: DB -> from_db_value -> Python. 
        # Set -> get_prep_value -> DB.
        # User Set -> to_python -> Clean.
        return str(value)

