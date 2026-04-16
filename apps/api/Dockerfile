FROM node:20

# Set root
WORKDIR /app

# Copy all files first
COPY . .

# Install root deps (if any)
RUN npm install

# -------- BUILD WEB --------
WORKDIR /app/apps/web
RUN npm install
RUN npm run build

# -------- BUILD API --------
WORKDIR /app/apps/api
RUN npm install
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

# -------- RUN API --------
WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/index.js"]