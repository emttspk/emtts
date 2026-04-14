FROM node:20-slim

WORKDIR /app

# Copy workspace package metadata first so dependency install can run before source copy
COPY package.json ./
COPY apps/api/package.json ./apps/api/

# Install workspace dependencies
RUN npm install --workspaces

# Copy app source and Prisma schema
COPY apps/api ./apps/api

WORKDIR /app/apps/api

# Build the TypeScript project and generate Prisma client
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]