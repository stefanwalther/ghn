FROM oven/bun:1 AS app

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

RUN mkdir -p /app/data

EXPOSE 21120

ENV PORT=21120

CMD ["sh", "-c", "bun run db:push && bun --bun next start -p ${PORT:-21120}"]
