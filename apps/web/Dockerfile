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

ENV NODE_OPTIONS=$NODE_OPTIONS
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENABLE_TEMPLATE_DESIGNER=$VITE_ENABLE_TEMPLATE_DESIGNER
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_GA_MEASUREMENT_ID=__VITE_GA_MEASUREMENT_ID__
ENV VITE_META_PIXEL_ID=__VITE_META_PIXEL_ID__
ENV VITE_PUBLIC_WHATSAPP_NUMBER=__VITE_PUBLIC_WHATSAPP_NUMBER__

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
RUN npm install --global serve@14.2.4

COPY --from=build /app/dist ./dist

RUN printf '%s\n' \
  "const fs = require('fs');" \
  "const path = require('path');" \
  "const root = path.resolve('dist');" \
  "const replacements = {" \
  "  __VITE_GA_MEASUREMENT_ID__: process.env.VITE_GA_MEASUREMENT_ID || ''," \
  "  __VITE_META_PIXEL_ID__: process.env.VITE_META_PIXEL_ID || ''," \
  "  __VITE_PUBLIC_WHATSAPP_NUMBER__: process.env.VITE_PUBLIC_WHATSAPP_NUMBER || ''," \
  "};" \
  "let files = 0;" \
  "let replacementsCount = 0;" \
  "console.log('[runtime-env] analytics env present: ga=' + (process.env.VITE_GA_MEASUREMENT_ID ? 'yes' : 'no') + ' meta=' + (process.env.VITE_META_PIXEL_ID ? 'yes' : 'no') + ' whatsapp=' + (process.env.VITE_PUBLIC_WHATSAPP_NUMBER ? 'yes' : 'no'));" \
  "function walk(dir) {" \
  "  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {" \
  "    const file = path.join(dir, entry.name);" \
  "    if (entry.isDirectory()) {" \
  "      walk(file);" \
  "      continue;" \
  "    }" \
  "    if (!(entry.name.endsWith('.html') || entry.name.endsWith('.js') || entry.name.endsWith('.css'))) continue;" \
  "    files += 1;" \
  "    let text = fs.readFileSync(file, 'utf8');" \
  "    let next = text;" \
  "    for (const [from, to] of Object.entries(replacements)) {" \
  "      const before = next;" \
  "      next = next.split(from).join(to);" \
  "      if (next !== before) replacementsCount += before.split(from).length - 1;" \
  "    }" \
  "    if (next !== text) fs.writeFileSync(file, next);" \
  "  }" \
  "}" \
  "walk(root);" \
  "console.log('[runtime-env] analytics placeholders replaced: ' + replacementsCount + ' in ' + files + ' files');" \
  > runtime-env.cjs

ENTRYPOINT ["sh", "-c", "node runtime-env.cjs && exec \"$@\"", "sh"]
CMD ["sh", "-c", "serve -s dist --single -l ${PORT:-3000}"]
