FROM node:20-slim

WORKDIR /app/apps/api

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy API package metadata and Prisma schema before install
COPY apps/api/package.json ./
COPY apps/api/prisma ./prisma

# Install dependencies inside apps/api
RUN npm install

# Copy API source code
COPY apps/api ./

# Generate Prisma client and build the API
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --schema=prisma/schema.prisma && node dist/index.js"]