一个简单好用的图床
部署方法
1,将除server文件夹的项目文件以静态网页的开工部署到/var/www/html文件夹下或者宝塔对应网站文件夹（也可以在后端通过 `FRONTEND_DIST_DIR` 直接托管这些静态文件）
2，根据server里的说明，在VPS上部署后端，并在 `.env` 中配置 `API_KEY`、`ALLOWED_ORIGINS` 等安全项（服务启动时会自动读取）
好了，可以使用了，打开你的前台网页，设置里填入你server的API地址就行；若前后端统一域名，则可直接访问同一地址。
若启用了后端的 API 密钥校验，请在前台的「API 接口」页生成密钥，并将同一值配置到服务器的 `.env` 中，随后重启服务使其生效。

> **小提示**：新版后端会默认允许与当前访问域名相同的 `Origin`，即便没有在 `ALLOWED_ORIGINS` 中显式写出，也能正常上传。
> 如果需要强制只允许列表中的来源，可以在 `.env` 中将 `ALLOW_SAME_HOST_ORIGIN` 设置为 `false`。

## Nginx 反向代理示例

如果将前端和后端分别部署在 `imgup.example.com`（静态文件）和 `img.example.com`（API） 两个域名下，可以参考下面的 Nginx 配置：

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

在https://github.com/ceocok/fake-nodeimage 基础上修改
