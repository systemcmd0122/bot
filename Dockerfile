FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    unzip \
    ca-certificates \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages "yt-dlp==2025.6.9" bgutil-ytdlp-pot-provider

RUN curl -fsSL https://deno.land/install.sh | sh

ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

RUN git clone https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /root/bgutil-ytdlp-pot-provider && \
    cd /root/bgutil-ytdlp-pot-provider/server && \
    deno install

RUN mkdir -p /root/.config/yt-dlp && \
    printf '%s\n' \
        '--extractor-args' \
        'youtube:player_client=web' \
        '--extractor-args' \
        'youtubepot-bgutilscript:server_home=/root/bgutil-ytdlp-pot-provider/server' \
        > /root/.config/yt-dlp/config

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --include=optional && \
    echo "=== davey check ===" && \
    node --input-type=commonjs -e "try { const d = require('@snazzah/davey'); console.log('davey OK, version:', d.DAVE_PROTOCOL_VERSION); } catch(e) { console.error('davey FAIL:', e.message); }" && \
    echo "=== libsodium check ===" && \
    node --input-type=commonjs -e "try { require('libsodium-wrappers'); console.log('libsodium OK'); } catch(e) { console.error('libsodium FAIL:', e.message); }" && \
    echo "=== opus check ===" && \
    node --input-type=commonjs -e "try { require('@discordjs/opus'); console.log('@discordjs/opus OK (native)'); } catch(e) { console.error('@discordjs/opus:', e.message); try { require('opusscript'); console.log('opusscript OK (fallback)'); } catch(e2) { console.error('opusscript FAIL:', e2.message); } }"

COPY . .

ENV NODE_ENV=production
ENV DEBUG=""

EXPOSE 8000

CMD ["node", "index.js"]
