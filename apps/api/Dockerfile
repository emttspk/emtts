FROM node:18

WORKDIR /app

# Copy ONLY api package.json
COPY apps/api/package*.json ./

RUN npm install

# Copy only api code
COPY apps/api ./

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]