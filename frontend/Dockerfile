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
ENV PORT 3000

# Run in development mode
CMD ["npm", "run", "dev"]


