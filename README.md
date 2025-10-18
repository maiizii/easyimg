简易图床 EasyImg
=================

EasyImg 是一个前后端分离的轻量级图床方案，提供批量上传、历史管理和密钥保护等功能。仓库现在按照“前端 `www/` + 后端 `server/`” 的结构划分，部署时可以按需选择托管方式。

## 目录结构

- `www/`：静态前端页面，包含 `index.html`、`assets/` 等可直接上传到 Web 服务器的文件。
- `server/`：Node.js 后端服务，负责图片上传、存储与密钥管理。
- `README.md`：当前说明文档，其余部署说明请参考 `server/README.md`。

## 部署步骤

1. **部署前端**：将 `www` 目录中的全部内容上传到网站目录（例如 `/var/www/html` 或宝塔面板站点目录）。如果希望由后端托管前端静态文件，可在后端环境变量中设置 `FRONTEND_DIST_DIR=../www`，让服务自动返回该目录下的页面。
2. **部署后端**：按照 [`server/README.md`](server/README.md) 的指引在 VPS 上安装依赖并启动 Node.js 服务。请复制 [`server/.env.example`](server/.env.example) 为 `.env`，设置 `API_PAGE_PASSWORD`、`ALLOWED_ORIGINS` 等安全项后再启动服务。
3. **前端配置**：访问前端页面，在「设置」里填写后端地址并点击「生成」获取专属 API 密钥，最后保存配置即可开始上传。

> **提示**：后端默认放行与当前访问 Host 相同的来源，即便未写入 `ALLOWED_ORIGINS` 也可正常上传。如需强制白名单，请将 `.env` 中的 `ALLOW_SAME_HOST_ORIGIN` 设为 `false`。

前端页面提供：

- API 地址和密钥配置，自动保存到浏览器 `localStorage`
- 多图片上传，生成直链、Markdown、BBCode 等引用格式
- 图片列表展示，支持刷新、复制链接、删除图片
- 本地历史清空按钮，便于快速整理

## 使用方法

1. **完成部署**：确保前端已上传到静态站点或由后端托管，后端依照 `server/README.md` 中的步骤启动，并在 `server/.env` 里配置 `API_PAGE_PASSWORD` 等必要变量。
2. **访问前端站点**：使用浏览器打开部署好的网页，首次进入会提示前往「设置」。
3. **配置后端信息**：在设置面板中填入后端 API 地址（例如 `https://img.example.com/api`）以及你在后端 `.env` 中设置的 `API_PAGE_PASSWORD`。
4. **生成专属密钥**：点击「生成」按钮创建自己的 API 密钥，页面会自动保存密钥和接口地址。
5. **开始上传**：返回上传页拖拽或选择图片，系统会使用刚生成的密钥进行上传，并提供多种格式的引用链接。

> 如果需要在多台设备使用，可重复上述步骤生成新的密钥；若密钥泄露，重新生成即可。

## Nginx 单域名反向代理示例

下方示例展示如何使用同一个域名（如 `img.example.com`）同时托管前端静态资源并将 `/api`、`/images` 代理到 Node.js 后端：

```nginx
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name img.example.com;

    root /mnt/vdb/example.com/easyimg/www; # 前端静态文件目录
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

如果后端通过 `FRONTEND_DIST_DIR` 托管了前端构建文件，也可以直接将整个域名代理到 Node.js：

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
