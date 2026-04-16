# ─── 阶段 1：构建前端 ────────────────────────────────────────────
FROM docker.m.daocloud.io/library/node:20-alpine AS builder

WORKDIR /app

# 安装前端依赖并构建
COPY client/package*.json ./client/
RUN npm --prefix client install --registry=https://registry.npmmirror.com

COPY client/ ./client/
RUN npm --prefix client run build
# 产物在 /app/client/dist

# ─── 阶段 2：生产运行 ────────────────────────────────────────────
# 用 slim（glibc）而非 alpine（musl），使 better-sqlite3 能直接用预编译二进制，无需编译
FROM docker.m.daocloud.io/library/node:20-slim AS runner

WORKDIR /app

# 只安装后端生产依赖（跳过 devDependencies）
# 通过 npmmirror 下载 better-sqlite3 预编译二进制，跳过 node-gyp 编译
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev \
    --registry=https://registry.npmmirror.com \
    --better-sqlite3-binary-host=https://registry.npmmirror.com/-/binary/better-sqlite3

# 拷贝后端源码 + 前端构建产物
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

# SQLite 数据库目录（挂载卷）
RUN mkdir -p /app/server/src/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/src/index.js"]
