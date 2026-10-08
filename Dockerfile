FROM node:22-alpine
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    DB_FILE=/app/data/maaltijden.db \
    PORT=3000 \
    APP_VERSION=$APP_VERSION
LABEL org.opencontainers.image.title="Maaltijden" \
      org.opencontainers.image.description="Maaltijdplanner en receptenboek" \
      org.opencontainers.image.version=$APP_VERSION
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
