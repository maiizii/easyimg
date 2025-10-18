# 图床后端部署指南

## VPS 部署步骤

### 1. 克隆仓库并进入 `server/`（如已克隆直接进入server目录）

```bash
git clone https://github.com/maiizii/easyimg.git
cd easyimg/server
```

### 2. 安装 Node.js（如果还没有）
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

### 3. 安装依赖
```bash
npm install
```

### 4. 配置环境变量

```bash
cp .env.example .env
vim .env  # 按需修改 API_PAGE_PASSWORD、ALLOWED_ORIGINS 等配置
```

`.env` 会在服务启动时被自动加载。默认情况下，后端会托管仓库根目录下的 `www/` 静态页面，无需额外部署前端。

### 5. 使用 PM2 运行（推荐）
```bash
# 安装PM2
sudo npm install -g pm2

# 启动服务
pm2 start server.js --name easyimg

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs easyimg

# 重启服务
pm2 restart easyimg
```

> **提示**：如果从仓库拉取了最新代码或收到 `MODULE_NOT_FOUND` 类似的报错，请重新运行 `npm install` 安装可能新增的依赖，再执行 `pm2 restart easyimg` 重启服务。

如果不想使用 PM2，也可以直接运行 `node server.js`，或结合系统服务管理器（如 `systemd`）守护进程。

### 6. 配置 Nginx 反向代理（可选但推荐）
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 改为您的域名

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 7. 配置 SSL（推荐使用 Let's Encrypt）
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 环境变量配置

在 `server` 目录中创建 `.env` 文件：
```bash
PORT=3000
NODE_ENV=production
# 允许的前端域名，多个用逗号分隔，例如：https://imgup.example.com,https://another.example.com
ALLOWED_ORIGINS=
# 是否自动放行与当前 Host 相同的来源（默认 true，填写 false 可强制只使用 ALLOWED_ORIGINS 列表）
ALLOW_SAME_HOST_ORIGIN=true
# 访问密码：前端生成专属 API 密钥时需要输入，务必设置一个足够复杂的值
API_PAGE_PASSWORD=
# （可选）前端打包产物所在目录，配置后后端会托管该目录
# 如果未配置，后端会尝试自动识别与 `server.js` 同级或上级目录中的前端构建目录
# 示例：当前仓库内的静态页面位于 `../www`
FRONTEND_DIST_DIR=../www
```

> 可以直接复制项目内的 [`server/.env.example`](./.env.example) 为 `.env`，再根据部署环境修改对应值。

> 提示：后端现在会自动加载与 `server.js` 同目录或进程当前工作目录下的 `.env` 文件，
> 因此只需在部署目录创建并更新 `.env` 后重新启动服务即可生效。

## 首次生成 API 密钥

1. 在 `.env` 中设置一个复杂的 `API_PAGE_PASSWORD` 并重启服务。
2. 访问前端页面，进入「设置」填写后端 API 地址与刚配置的访问密码。
3. 点击「生成」按钮创建 API 密钥。密钥只会在生成时展示，请妥善保存。
4. 如需吊销旧密钥，可重新生成，旧密钥会立即失效。

## 安全建议

1. **修改CORS配置**：通过 `ALLOWED_ORIGINS` 或直接在 `server.js` 中显式列出允许的前端域名，避免使用通配符
2. **添加认证**：设置 `API_PAGE_PASSWORD` 并妥善保管访问密码，避免密钥被任意生成
3. **限流**：使用 `express-rate-limit` 防止滥用
4. **定期备份**：定期备份 `uploads` 目录

## 测试接口

```bash
# 健康检查
curl http://your-domain.com/api/health

# 上传测试（将 your-api-key 替换为实际密钥）
curl -X POST -H "X-API-Key: your-api-key" -F "images=@test.jpg" http://your-domain.com/api/upload

# 获取图片列表
curl -H "X-API-Key: your-api-key" http://your-domain.com/api/images
```

## 前端配置

### 与前端使用同一域名

如果希望通过同一个域名同时提供前端页面与 API（例如统一使用 `https://img.example.com`），
默认情况下仓库自带的 `../www` 会被自动托管，无需设置额外变量。若需要替换前端资源，可以将新的构建产物放到其他目录，并在 `.env` 中调整 `FRONTEND_DIST_DIR`。
后端会自动托管该目录下的静态资源，并为非 `/api`、`/images` 请求返回 `index.html`。
请确保该目录仅包含可公开访问的前端文件，不要把 `.env` 或其他后端敏感内容放在该目录内。如果未显式设置 `FRONTEND_DIST_DIR`，后端会尝试在 `server.js`
所在目录的上级位置自动寻找包含 `index.html` 的目录并托管。

例如：

```bash
FRONTEND_DIST_DIR=/var/www/easyimg/www
```

在重新启动服务后，直接访问 `https://img.example.com` 即会看到前端页面，API 地址同样为该域名根路径。
