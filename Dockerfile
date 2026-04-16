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
FROM docker.m.daocloud.io/library/node:20-alpine AS runner

WORKDIR /app

# 换用阿里云 Alpine 镜像源，加速国内构建
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装编译 better-sqlite3 原生模块所需的工具
RUN apk add --no-cache python3 make g++

# 只安装后端生产依赖（跳过 devDependencies）
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev --registry=https://registry.npmmirror.com

# 编译完成后移除构建工具，减小镜像体积
RUN apk del python3 make g++

# 拷贝后端源码 + 前端构建产物
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

# SQLite 数据库目录（挂载卷）
RUN mkdir -p /app/server/src/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/src/index.js"]
