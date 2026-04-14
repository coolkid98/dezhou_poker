# ─── 阶段 1：构建前端 ────────────────────────────────────────────
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine AS builder

WORKDIR /app

# 安装前端依赖并构建
COPY client/package*.json ./client/
RUN npm --prefix client install

COPY client/ ./client/
RUN npm --prefix client run build
# 产物在 /app/client/dist

# ─── 阶段 2：生产运行 ────────────────────────────────────────────
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine AS runner

WORKDIR /app

# 只安装后端生产依赖（跳过 devDependencies）
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev

# 拷贝后端源码 + 前端构建产物
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

# SQLite 数据库目录（挂载卷）
RUN mkdir -p /app/server/src/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/src/index.js"]
