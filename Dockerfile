FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS toolchain
WORKDIR /app
RUN npm install --global pnpm@11.15.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY packages/tv-adapter/package.json packages/tv-adapter/tsconfig.json ./packages/tv-adapter/
COPY packages/webos/package.json packages/webos/tsconfig.json ./packages/webos/
COPY packages/tizen/package.json packages/tizen/tsconfig.json ./packages/tizen/
COPY packages/philips/package.json packages/philips/tsconfig.json ./packages/philips/
COPY packages/screen-vision/package.json packages/screen-vision/tsconfig.json ./packages/screen-vision/

FROM toolchain AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN pnpm install --frozen-lockfile
COPY apps/api/src ./apps/api/src
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY packages/contracts/src ./packages/contracts/src
COPY packages/tv-adapter/src ./packages/tv-adapter/src
COPY packages/webos/src ./packages/webos/src
COPY packages/tizen/src ./packages/tizen/src
COPY packages/philips/src ./packages/philips/src
COPY packages/screen-vision/src ./packages/screen-vision/src
RUN pnpm --filter @remote-webos-tv/screen-vision build
RUN pnpm --filter @remote-webos-tv/contracts build && pnpm --filter @remote-webos-tv/tv-adapter build && pnpm --filter @remote-webos-tv/webos build && pnpm --filter @remote-webos-tv/tizen build && pnpm --filter @remote-webos-tv/philips build && pnpm --filter @remote-webos-tv/api build && pnpm --filter @remote-webos-tv/web build

FROM toolchain AS production-dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN pnpm install --prod --frozen-lockfile

FROM python:3.11-slim@sha256:e88e9763f943ec1834f992a4b51e0f24500486803e8bc534e5767af9ea65f6ce AS ocr-runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY apps/api/src/ocr/requirements.txt /opt/ocr/requirements.txt
RUN pip install --no-cache-dir -r /opt/ocr/requirements.txt
ENV PADDLE_PDX_CACHE_HOME=/opt/ocr/cache
COPY apps/api/src/ocr/package-models.py /opt/ocr/package-models.py
RUN python /opt/ocr/package-models.py

FROM ocr-runtime AS runtime
COPY --from=toolchain /usr/local/bin/node /usr/local/bin/node
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
ENV NODE_ENV=production
ENV REMOTE_WEBOS_OCR_MODELS=/opt/ocr/cache/official_models
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=production-dependencies /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=production-dependencies /app/packages/tv-adapter/node_modules ./packages/tv-adapter/node_modules
COPY --from=production-dependencies /app/packages/webos/node_modules ./packages/webos/node_modules
COPY --from=production-dependencies /app/packages/tizen/node_modules ./packages/tizen/node_modules
COPY --from=production-dependencies /app/packages/philips/node_modules ./packages/philips/node_modules
COPY --from=production-dependencies /app/packages/screen-vision/node_modules ./packages/screen-vision/node_modules
COPY --from=dependencies /app/apps/api/package.json ./apps/api/package.json
COPY --from=dependencies /app/apps/api/dist ./apps/api/dist
COPY --from=dependencies /app/apps/web/package.json ./apps/web/package.json
COPY --from=dependencies /app/apps/web/dist ./apps/web/dist
COPY --from=dependencies /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=dependencies /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=dependencies /app/packages/tv-adapter/package.json ./packages/tv-adapter/package.json
COPY --from=dependencies /app/packages/tv-adapter/dist ./packages/tv-adapter/dist
COPY --from=dependencies /app/packages/webos/package.json ./packages/webos/package.json
COPY --from=dependencies /app/packages/webos/dist ./packages/webos/dist
COPY --from=dependencies /app/packages/tizen/package.json ./packages/tizen/package.json
COPY --from=dependencies /app/packages/philips/package.json ./packages/philips/package.json
COPY --from=dependencies /app/packages/tizen/dist ./packages/tizen/dist
COPY --from=dependencies /app/packages/philips/dist ./packages/philips/dist
COPY --from=dependencies /app/packages/screen-vision/package.json ./packages/screen-vision/package.json
COPY --from=dependencies /app/packages/screen-vision/dist ./packages/screen-vision/dist
RUN mkdir /data && chown node:node /data && chmod 700 /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=125s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.REMOTE_WEBOS_PORT+'/api/health',{signal:AbortSignal.timeout(2000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/src/index.js"]
