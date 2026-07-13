FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 8000

CMD ["node", "index.js"]
