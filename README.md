简易图床 EasyImg
=================

- EasyImg 是一个轻量级的自建图床方案，提供批量上传、历史管理和密钥保护等功能。随着后端支持自动托管 `www/` 目录中的前端页面，部署时只要在服务器上克隆本仓库并运行服务端 `server/` 即可对外提供服务。
- 免登录、多用户单独管理、适合自用或小范围使用（自己备份数据）

## 网站截图
![img_mgw1w3un_i5nssd.png](https://img.911777.xyz/images/945065e551fb71d356963dd71b9f46b009f6573de69be84918592867fde92e65/1760778223727-4awr9cu6-img_mgw1w3un_i5nssd.png)
![img_mgw1went_mt6u5o.png](https://img.911777.xyz/images/945065e551fb71d356963dd71b9f46b009f6573de69be84918592867fde92e65/1760778237418-j6tvhn5t-img_mgw1went_mt6u5o.png)
![img_mgw1wrl3_v27fq8.png](https://img.911777.xyz/images/945065e551fb71d356963dd71b9f46b009f6573de69be84918592867fde92e65/1760778253753-ndovsluz-img_mgw1wrl3_v27fq8.png)


## 测试地址

- [img.yet.la](https://img.yet.la/)
- 访问密码：nodeseek

## 目录结构

- `www/`：静态前端页面，默认由后端托管，无需额外配置。
- `server/`：Node.js 后端服务，负责图片上传、存储、鉴权和静态资源托管。
- `README.md`：当前说明文档，其余部署细节请参考 [`server/README.md`](server/README.md)。

## 一体化部署步骤

1. **拉取代码**：在服务器上安装 Git，选择目标目录后执行 `git clone https://github.com/maiizii/easyimg.git`，再进入 `easyimg` 目录。
2. **安装 Node.js**：确保系统提供 Node.js 18+ 和 npm，可参考 [`server/README.md`](server/README.md#vps部署步骤) 中的安装命令。
3. **初始化配置**：复制 [`server/.env.example`](server/.env.example) 为 `server/.env`，根据实际情况设置 `API_PAGE_PASSWORD`、`ALLOWED_ORIGINS` 等变量。默认情况下后端会自动托管仓库中的 `www/` 静态文件。
4. **安装依赖并启动**：切换到 `server/` 目录执行 `npm install`，随后使用 `node server.js` 或 `pm2 start server.js --name easyimg` 启动服务。首次运行后可以通过 `pm2 save` 配置开机自启。
5. **配置反向代理/HTTPS（可选）**：在 Nginx 或宝塔中将域名指向本机 `3000` 端口，并按照下方示例启用 HTTPS 与上传大小限制。

完成以上步骤后访问你的域名即可看到前端界面，所有上传、删除等接口均通过同一域名的 `/api` 路径处理，无需再手动部署前端站点。

> **提示**：后端默认放行与当前访问 Host 相同的来源，即便未写入 `ALLOWED_ORIGINS` 也可正常上传。如需强制白名单，请将 `.env` 中的 `ALLOW_SAME_HOST_ORIGIN` 设为 `false`。

前端页面提供：

- API 地址和密钥配置，自动保存到浏览器 `localStorage`（每个用户独立）
- 多图片上传，生成URL、Markdown、BBCode、HTML 等引用格式
- 图片列表展示，支持刷新、复制链接、删除图片
- 本地历史清空按钮，便于快速整理
- 管理员控制台 `/admin`，支持密码登录、分页浏览所有上传记录、复制链接与删除违规图片

## 管理员控制台

管理员控制台默认托管在 `/admin` 页面，需在后端配置 `ADMIN_PASSWORD` 后才会启用：

1. 在 `server/.env`（或部署目录下的 `.env`）中设置 `ADMIN_PASSWORD=你的管理员密码`，并重启后端服务。
2. 浏览器访问 `https://你的域名/admin`，输入刚设置的管理员密码完成登录。
3. 登录成功后可使用分页工具快速浏览全部上传记录，支持复制直链、Markdown、BBCode、HTML 引用格式，以及一键删除违规图片。
4. 点击顶部的“刷新列表”可重新获取最新上传记录，“退出登录”可清除当前会话。

## 常见操作流程

1. **完成部署**：按照“一体化部署步骤”启动服务并确保反向代理正常。
2. **访问站点**：使用浏览器打开域名，首次进入会提示前往「设置」。
3. **配置后端信息**：在设置面板中填入当前域名作为 API 地址（例如 `https://img.example.com`）以及你在 `server/.env` 中设置的 `API_PAGE_PASSWORD`。
4. **生成专属密钥**：点击「生成」按钮创建 API 密钥，页面会自动保存密钥和接口地址。
5. **开始上传**：返回上传页拖拽或选择图片，系统会使用刚生成的密钥进行上传，并提供多种格式的引用链接。

> 如果需要在多台设备使用，可重复上述步骤生成新的密钥；若密钥泄露，重新生成即可。

## Nginx 反向代理示例

以下配置适用于统一使用 `https://img.example.com` 域名，通过 Nginx 将外部请求转发到本机 `3000` 端口运行的 EasyImg 服务：

```nginx
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

确保在启用反向代理前，后端服务已经在本地 `3000` 端口运行（例如使用 `pm2 start server.js --name easyimg`）。若访问返回 `502 Bad Gateway`，请检查 Node.js 进程状态或查看日志。

基于 https://github.com/ceocok/fake-nodeimage 修改。
