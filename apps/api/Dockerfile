FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy workspace package metadata and Prisma schema before install
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma

# Install workspace dependencies
RUN npm install --workspaces

# Copy API source code
COPY apps/api ./apps/api

# Generate Prisma client and build the API
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN cd apps/api && npm run build

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]