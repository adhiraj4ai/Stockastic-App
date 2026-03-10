#!/bin/sh

# Wait for postgres (although depends_on handles most of it, it's good practice)
# echo "Waiting for postgres..."
# while ! nc -z $DB_HOST $DB_PORT; do
#   sleep 0.1
# done
# echo "PostgreSQL started"

# Create logs directory for security logging
mkdir -p /app/logs

echo "Making migrations..."
python manage.py makemigrations --no-input

echo "Running migrations..."
python manage.py migrate

echo "Collecting static files..."
python manage.py collectstatic --no-input

exec "$@"
