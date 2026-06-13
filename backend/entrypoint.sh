#!/bin/sh
set -e

# Create logs directory for security logging
mkdir -p /app/logs

echo "🚀 [STARTUP] Starting backend initialization..."

# Verify Database Connectivity
echo "🔍 [DIAGNOSTICS] Checking database connectivity..."
python << END
import sys
import psycopg
import os
import traceback
try:
    conn = psycopg.connect(
        dbname=os.getenv('POSTGRES_DB', 'stockastic'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', 'postgres'),
        host=os.getenv('DB_HOST', 'postgres'),
        port=os.getenv('DB_PORT', '5432'),
        connect_timeout=5
    )
    print("✅ [DATABASE] Connection successful.")
    sys.exit(0)
except Exception as e:
    print(f"❌ [DATABASE] Connection failed:")
    traceback.print_exc()
    sys.exit(1)
END

# Migrations are generated in dev and tracked in git; boot only applies them.

echo "💾 [DATABASE] Running migrations..."
python manage.py migrate --no-input

echo "📄 [STATIC] Collecting static files..."
python manage.py collectstatic --no-input

echo "✅ [SUCCESS] Initialization complete. Starting server..."
exec "$@"
