# glibc base so better-sqlite3 uses its prebuilt binary (no compiler toolchain needed)
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci
COPY . .
RUN npm run build -w client
ENV DB_PATH=/data/data.db
ENV PORT=3001
EXPOSE 3001
CMD ["sh", "-c", "mkdir -p /data && if [ \"$EMPTY_DB\" != \"1\" ]; then npm run seed; fi && npm run start -w server"]
