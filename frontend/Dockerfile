FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Set environment variable
# Declare build arguments
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ML_SERVICE_URL

# Make them available as environment variables during build
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_ML_SERVICE_URL=${NEXT_PUBLIC_ML_SERVICE_URL}

ENV PORT 3000

# Build the Next.js application
RUN npm run build

# Start the application in production mode
CMD ["npm", "run", "start"]


