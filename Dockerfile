FROM node:22.14.0-slim

WORKDIR /app

# Install runtime deps (mustache + wrangler)
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8788 \
    PERSIST_TO=/data/wrangler-kv-store

VOLUME ["/data"]

EXPOSE 8788

CMD ["node", "./scripts/start.mjs"]
