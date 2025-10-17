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
```

## 安全建议

1. **修改CORS配置**：在 `server.js` 中将 `origin: '*'` 改为您的前端域名
2. **添加认证**：对于生产环境，建议添加API密钥验证
3. **限流**：使用 `express-rate-limit` 防止滥用
4. **定期备份**：定期备份 `uploads` 目录

## 测试接口

```bash
# 健康检查
curl http://your-domain.com/api/health

# 上传测试
curl -X POST -F "images=@test.jpg" http://your-domain.com/api/upload

# 获取图片列表
curl http://your-domain.com/api/images
```

## 前端配置

部署完成后，在前端的设置面板中输入您的API地址：
```
https://your-domain.com
```
