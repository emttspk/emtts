FROM node:20-slim

WORKDIR /app

# Copy root package files to handle workspaces
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install ALL dependencies (including devDeps needed for tsc)
RUN npm install

# Copy source code
COPY apps/api ./apps/api

WORKDIR /app/apps/api

# Build the TypeScript project
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]