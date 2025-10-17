# 图床后端部署指南

## VPS部署步骤

### 1. 安装Node.js（如果还没有）
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

### 2. 上传代码到VPS
```bash
# 在VPS上创建目录
mkdir -p /var/www/image-hosting-backend
cd /var/www/image-hosting-backend

# 复制 server.js 和 package.json 到这个目录
```

### 3. 安装依赖
```bash
npm install
```

### 4. 使用PM2运行（推荐）
```bash
# 安装PM2
sudo npm install -g pm2

# 启动服务
pm2 start server.js --name image-hosting

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs image-hosting

# 重启服务
pm2 restart image-hosting
```

> **提示**：如果从仓库拉取了最新代码或收到 `MODULE_NOT_FOUND` 类似的报错，请重新运行 `npm install` 安装可能新增的依赖，再执行 `pm2 restart image-hosting` 重启服务。

### 5. 配置Nginx反向代理（可选但推荐）
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

### 6. 配置SSL（推荐使用Let's Encrypt）
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 环境变量配置

创建 `.env` 文件（可选）：
```bash
PORT=3000
NODE_ENV=production
# 允许的前端域名，多个用逗号分隔，例如：https://imgup.example.com,https://another.example.com
ALLOWED_ORIGINS=
# 是否自动放行与当前 Host 相同的来源（默认 true，填写 false 可强制只使用 ALLOWED_ORIGINS 列表）
ALLOW_SAME_HOST_ORIGIN=true
# API 密钥，可在前端的「API 接口」页面生成，多个密钥用逗号分隔
API_KEY=
# （可选）前端打包产物所在目录，配置后后端会托管该目录
# 如果未配置，后端会尝试自动识别与 `server.js` 同级或上级目录中的前端构建目录
# 例：FRONTEND_DIST_DIR=..
```

> 提示：后端现在会自动加载与 `server.js` 同目录或进程当前工作目录下的 `.env` 文件，
> 因此只需在部署目录创建并更新 `.env` 后重新启动服务即可生效。

## 安全建议

1. **修改CORS配置**：通过 `ALLOWED_ORIGINS` 或直接在 `server.js` 中显式列出允许的前端域名，避免使用通配符
2. **添加认证**：设置 `API_KEY`（或 `API_KEYS`） 环境变量启用内置的 API 密钥校验
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
可以将前端打包后的静态资源路径配置到 `FRONTEND_DIST_DIR` 环境变量。后端会自动托管该目录下的静态资源，
并为非 `/api`、`/images` 请求返回 `index.html`，无需单独部署前端静态站点。请确保该目录仅包含可公开访问的前端文件，
不要把 `.env` 或其他后端敏感内容放在该目录内。如果未显式设置 `FRONTEND_DIST_DIR`，后端会尝试在 `server.js`
所在目录的上级位置自动寻找包含 `index.html` 的目录并托管。

例如：

```bash
FRONTEND_DIST_DIR=/var/www/image-hosting-frontend
```

在重新启动服务后，直接访问 `https://img.example.com` 即会看到前端页面，API 地址同样为该域名根路径。
