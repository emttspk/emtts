FROM node:18

WORKDIR /app

COPY apps/api/package*.json ./

RUN npm install --omit=dev

COPY apps/api ./

EXPOSE 3000

CMD ["node", "src/index.ts"]