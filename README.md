一个简单好用的图床
====================

## 部署方法

1. 将除 `server` 文件夹外的所有静态资源部署到站点目录（例如 `/var/www/html` 或宝塔面板对应的网站目录）。如果使用后端内置的静态托管功能，可在 `.env` 中通过 `FRONTEND_DIST_DIR=..` 指向当前项目根目录。
2. 根据 `server/README.md` 的指引在 VPS 上部署 Node.js 后端。后端提供了一个完整的 [`server/.env.example`](server/.env.example) 文件，请复制为 `.env` 后设置 `API_PAGE_PASSWORD`、`ALLOWED_ORIGINS` 等安全项，重启服务即可生效。
3. 打开前端页面，在「设置」中填写后端地址并点击「生成」按钮，输入访问密码后即可自动填入专属 API 密钥，随后保存配置即可开始上传。如果前后端使用同一域名，仅需填写 `https://你的域名` 即可。

> **提示**：后端默认放行与当前访问 Host 相同的来源，即便未在 `ALLOWED_ORIGINS` 中列出，也可正常上传。如需强制仅允许白名单域名，请将 `.env` 中的 `ALLOW_SAME_HOST_ORIGIN` 设置为 `false`。

前端页面提供：

- API 地址 & 密钥配置，自动保存到浏览器 `localStorage`
- 多图片上传，成功后支持复制直链、Markdown、BBCode
- 图片列表展示，支持从服务器刷新、复制和删除
- 本地历史清空按钮，便于快速整理

## Nginx 反向代理示例

如果将前端和后端分别部署在 `imgup.example.com`（静态文件）和 `img.example.com`（API）两个域名下，可以参考下面的 Nginx 配置：

```nginx
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name imgup.example.com;

    root /mnt/vdb/example.com/openimg;
    index index.php index.html index.htm;

    ssl_certificate /etc/nginx/ssl/fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/private.key;
}

server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name img.example.com;

    ssl_certificate /etc/nginx/ssl/fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/private.key;

    client_max_body_size 10M;

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

只想统一使用 `img.example.com` 访问前端和后端时，可以保留一个 `server` 块即可：

```nginx
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name img.example.com;

    root /mnt/vdb/example.com/openimg; # 前端静态文件所在目录
    index index.html;

    ssl_certificate /etc/nginx/ssl/fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/private.key;

    client_max_body_size 10M;

    # 将 API、图片访问代理到 Node.js 服务
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

    # 其余静态资源由 Nginx 直接返回
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

如果后端通过 `FRONTEND_DIST_DIR` 托管了前端构建文件，也可以简化为将整个域名反向代理给 Node.js：

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

请确保在反向代理启用前，后端服务已经在服务器本地的 `3000` 端口启动（例如使用 `pm2 start server.js`）。如果访问代理域名返回 `502 Bad Gateway`，通常意味着 Node.js 进程未运行或启动失败，可以通过 `pm2 status` 或 `journalctl -u <service>` 等命令检查进程日志。

在 https://github.com/ceocok/fake-nodeimage 基础上修改
