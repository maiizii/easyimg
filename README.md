简易图床 EasyImg
=================

EasyImg 是一个前后端分离的轻量级图床方案，提供批量上传、历史管理和密钥保护等功能。仓库包含静态前端页面和 Node.js 后端服务，按需部署即可快速启用自托管图床。

## 部署步骤

1. **部署前端**：将除 `server` 目录外的所有文件上传到站点根目录（例如 `/var/www/html` 或宝塔面板网站目录）。如果希望由后端托管静态文件，可在 `.env` 中通过 `FRONTEND_DIST_DIR=..` 指向当前项目根目录。
2. **部署后端**：按照 [`server/README.md`](server/README.md) 的指引在 VPS 上安装依赖并启动 Node.js 服务。请复制 [`server/.env.example`](server/.env.example) 为 `.env`，设置 `API_PAGE_PASSWORD`、`ALLOWED_ORIGINS` 等安全项后再启动服务。
3. **前端配置**：访问前端页面，在「设置」里填写后端地址并点击「生成」获取专属 API 密钥，最后保存配置即可开始上传。

> **提示**：后端默认放行与当前访问 Host 相同的来源，即便未写入 `ALLOWED_ORIGINS` 也可正常上传。如需强制白名单，请将 `.env` 中的 `ALLOW_SAME_HOST_ORIGIN` 设为 `false`。

前端页面提供：

- API 地址和密钥配置，自动保存到浏览器 `localStorage`
- 多图片上传，生成直链、Markdown、BBCode 等引用格式
- 图片列表展示，支持刷新、复制链接、删除图片
- 本地历史清空按钮，便于快速整理

## Nginx 单域名反向代理示例

下方示例展示如何使用同一个域名（如 `img.example.com`）同时托管前端静态资源并将 `/api`、`/images` 代理到 Node.js 后端：

```nginx
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name img.example.com;

    root /mnt/vdb/example.com/easyimg; # 前端静态文件目录
    index index.html;

    ssl_certificate /etc/nginx/ssl/fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/private.key;

    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /images/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

如果后端通过 `FRONTEND_DIST_DIR` 托管了构建文件，也可以直接将整个域名代理到 Node.js：

```nginx
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name img.example.com;

    ssl_certificate /etc/nginx/ssl/fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/private.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

确保在启用反向代理前，后端服务已经在本地 `3000` 端口运行（例如使用 `pm2 start server.js`）。若访问返回 `502 Bad Gateway`，请检查 Node.js 进程状态或查看日志。

基于 https://github.com/ceocok/fake-nodeimage 修改。
