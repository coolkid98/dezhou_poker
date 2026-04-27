# 德州扑克 Texas Hold'em

基于 React + Node.js + Socket.IO 的多人在线德州扑克游戏。

## 功能特性

- 多人实时对战（最多 10 人桌）
- 完整德州扑克规则（翻牌/转牌/河牌/摊牌）
- 房主控制开始每一手
- 自定义盲注和初始筹码
- 下注筹码飞行动画 + 摊牌逐个揭示
- 程序化背景音乐（Jazz Lounge）+ 动作音效
- 移动端适配
- **AI 实时分析**：每手牌发牌后自动调用 MiniMax AI，给出胜率、建议行动（弃牌/过牌/跟注/加注/All-in）及原因，翻/转/河牌后自动刷新；每轮思考时间上限 60 秒

## 技术栈

- **前端**：React 18 + Vite
- **后端**：Node.js + Express + Socket.IO
- **数据库**：SQLite（better-sqlite3）
- **部署**：Docker + Docker Compose

---

## 本地开发

```bash
# 安装所有依赖
npm run install:all

# 启动开发服务器（前端 :5173，后端 :3001）
npm run dev
```

浏览器打开 `http://localhost:5173`

---

## 生产部署（阿里云 ECS + Docker）

### 1. 服务器安装 Docker 和 Docker Compose

#### Ubuntu

```bash
# 1.1 安装 Docker 所需依赖，并配置阿里云 Docker CE 镜像源
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update

# 1.2 安装 Docker Engine
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
sudo systemctl enable --now docker

# 1.3 安装 Docker Compose V2 插件
sudo apt-get install -y docker-compose-plugin

# 1.4 验证 Docker 和 Docker Compose
docker --version
docker compose version
```

#### Alibaba Cloud Linux / CentOS

如果服务器是 Alibaba Cloud Linux / CentOS：

```bash
# 1.1 安装 Docker 所需依赖，并配置阿里云 Docker CE 镜像源
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo

# 1.2 安装 Docker Engine
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
sudo systemctl enable --now docker

# 1.3 安装 Docker Compose V2 插件
sudo yum install -y docker-compose-plugin

# 1.4 验证 Docker 和 Docker Compose
docker --version
docker compose version
```

> 如果你已经安装了 Docker，但执行 `docker compose build` 提示没有 `docker compose` 指令，通常是缺少 Compose V2 插件。Ubuntu 执行 `sudo apt-get install -y docker-compose-plugin`，Alibaba Cloud Linux / CentOS 执行 `sudo yum install -y docker-compose-plugin`，再用 `docker compose version` 验证。
>
> 老教程里的 `docker-compose` 是旧版独立命令；本项目统一使用新版 Compose V2 的 `docker compose`。

### 2. 拉取代码

```bash
git clone https://github.com/coolkid98/dezhou_poker.git
cd dezhou_poker
```

### 3. 配置环境变量

```bash
# 生成随机 JWT 密钥并写入 .env（重要：生产环境务必修改）
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env

# 追加 MiniMax API Key（AI 分析功能必填）
echo "MINIMAX_API_KEY=你的key" >> .env

cat .env  # 确认已生成
```

> `.env` 文件不会被提交到仓库，每次部署需手动创建。

### 4. 构建并启动

```bash
docker compose build
docker compose up -d
```

首次构建约 3-5 分钟。构建完成后服务运行在 **3001 端口**。

### 5. 开放安全组端口

在阿里云控制台 → ECS → 安全组 → 入方向规则，添加：

| 协议 | 端口 | 来源 |
|------|------|------|
| TCP  | 3001 | 0.0.0.0/0 |

### 6. 访问

浏览器打开：`http://你的ECS公网IP:3001`

---

## 常用运维命令

```bash
# 查看容器状态
docker compose ps

# 查看实时日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 更新部署
git pull
docker compose build
docker compose up -d
```

## 数据持久化

SQLite 数据库通过 Docker Volume `poker-db` 持久化，容器重建后数据不丢失。

```bash
# 查看数据卷
docker volume ls

# 备份数据库
docker run --rm \
  -v dezhou_poker_poker-db:/data \
  -v $(pwd):/backup \
  docker.m.daocloud.io/library/node:20-alpine \
  cp /data/poker.db /backup/poker_backup.db
```

---

## 常见问题

**国内服务器拉取镜像超时**

项目已配置使用 DaoCloud 镜像源，一般可正常构建。如仍失败，手动预拉取：

```bash
docker pull docker.m.daocloud.io/library/node:20-alpine
```
