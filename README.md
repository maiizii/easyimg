一个简单好用的图床
部署方法
1,将除server文件夹的项目文件以静态网页的开工部署到/var/www/html文件夹下或者宝塔对应网站文件夹（也可以在后端通过 `FRONTEND_DIST_DIR` 直接托管这些静态文件）
2，根据server里的说明，在VPS上部署后端，并在 `.env` 中配置 `API_KEY`、`ALLOWED_ORIGINS` 等安全项（服务启动时会自动读取）
好了，可以使用了，打开你的前台网页，设置里填入你server的API地址就行；若前后端统一域名，则可直接访问同一地址。
若启用了后端的 API 密钥校验，请在前台的「API 接口」页生成密钥，并将同一值配置到服务器的 `.env` 中，随后重启服务使其生效。

在https://github.com/ceocok/fake-nodeimage 基础上修改
