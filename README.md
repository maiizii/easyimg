一个简单好用的图床
部署方法
1,将除server文件夹的项目文件以静态网页的开工部署到/var/www/html文件夹下或者宝塔对应网站文件夹
2，根据server里的说明，在VPS上部署后端
好了，可以使用了，打开你的前台网页，设置里填入你server的API地址就行。
若启用了后端的 API 密钥校验，请在前台的「API 接口」页生成密钥，并将同一值配置到服务器的 `API_KEY` 环境变量中。

在https://github.com/ceocok/fake-nodeimage 基础上修改
