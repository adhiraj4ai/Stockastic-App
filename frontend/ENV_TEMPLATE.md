# =============================================================================
# Stockastic Frontend Environment Configuration Template
# =============================================================================
# Copy the contents below to create a .env.local file
# DO NOT commit .env.local to version control

# =============================================================================
# API Configuration
# =============================================================================
# Backend Django API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

# ML Service API URL (if using separate ML service)
NEXT_PUBLIC_ML_SERVICE_URL=http://localhost:8001

# =============================================================================
# Notes
# =============================================================================
# - All environment variables in Next.js that need to be accessible in the browser
#   must be prefixed with NEXT_PUBLIC_
# - The frontend uses these URLs to connect to the backend API
# - Make sure the backend is running on the specified port (default: 8000)
# - CORS is configured in the backend to allow requests from http://localhost:3000

# =============================================================================
# How to Use
# =============================================================================
# 1. Create a new file named .env.local in the frontend directory
# 2. Copy the NEXT_PUBLIC_* variables above into .env.local
# 3. Update the values if your backend is running on a different port
# 4. Restart the Next.js dev server (npm run dev)
