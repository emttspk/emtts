FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build frontend
RUN cd apps/web && npm install && npm run build

# Build backend
RUN cd apps/api && npm install && npm run build

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/index.js"]