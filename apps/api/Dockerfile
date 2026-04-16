FROM node:20-slim

# Build web frontend first
WORKDIR /app
COPY apps/web/package.json ./apps/web/
COPY apps/web/package-lock.json ./apps/web/
RUN cd apps/web && npm install

COPY apps/web ./apps/web
RUN cd apps/web && npm run build

# Now build API
WORKDIR /app/apps/api

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Set default DATABASE_PROVIDER for production
ENV DATABASE_PROVIDER=postgresql

# Copy API package metadata and Prisma schema before install
COPY apps/api/package.json ./
COPY apps/api/prisma ./prisma

# Install dependencies inside apps/api
RUN npm install

# Copy API source code
COPY apps/api ./

# Explicitly copy web dist to the right location
RUN mkdir -p ../web/dist
COPY --from=0 /app/apps/web/dist /app/apps/web/dist

# Generate Prisma client and build the API
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]