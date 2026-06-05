FROM node:22.13.1-bookworm-slim AS build

WORKDIR /app

ARG NODE_OPTIONS
ARG VITE_API_BASE
ARG VITE_API_URL
ARG VITE_ENABLE_TEMPLATE_DESIGNER
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_GA_MEASUREMENT_ID=__VITE_GA_MEASUREMENT_ID__
ARG VITE_META_PIXEL_ID=__VITE_META_PIXEL_ID__
ARG VITE_PUBLIC_WHATSAPP_NUMBER=__VITE_PUBLIC_WHATSAPP_NUMBER__

ENV NODE_OPTIONS=$NODE_OPTIONS
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENABLE_TEMPLATE_DESIGNER=$VITE_ENABLE_TEMPLATE_DESIGNER
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
ENV VITE_META_PIXEL_ID=$VITE_META_PIXEL_ID
ENV VITE_PUBLIC_WHATSAPP_NUMBER=$VITE_PUBLIC_WHATSAPP_NUMBER

COPY package.json ./
RUN npm install

COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY eslint.config.js ./
COPY serve.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22.13.1-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV VITE_GA_MEASUREMENT_ID=""
ENV VITE_META_PIXEL_ID=""
ENV VITE_PUBLIC_WHATSAPP_NUMBER=""

RUN npm install --global serve@14.2.4

COPY --from=build /app/dist ./dist

CMD ["sh", "-c", "node -e \"const fs=require('fs');const path=require('path');const root=path.resolve('dist');const replacements={__VITE_GA_MEASUREMENT_ID__:process.env.VITE_GA_MEASUREMENT_ID||'',__VITE_META_PIXEL_ID__:process.env.VITE_META_PIXEL_ID||'',__VITE_PUBLIC_WHATSAPP_NUMBER__:process.env.VITE_PUBLIC_WHATSAPP_NUMBER||''};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\\.(html|js|css)$/.test(entry.name)){let text=fs.readFileSync(file,'utf8');let next=text;for(const [from,to] of Object.entries(replacements))next=next.split(from).join(to);if(next!==text)fs.writeFileSync(file,next);}}}walk(root);\" && serve -s dist --single -l ${PORT:-3000}"]
