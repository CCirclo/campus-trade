# 校园闲置网页版

学校和校区来自 `GET /api/campuses`。注册时学校由校园邮箱域名自动匹配且普通用户不可修改；校区使用受控下拉框，并可在“我的 → 编辑资料”切换。首页、搜索和推荐只展示当前学校与校区的商品。

Admin 包含学校管理页，展示学校 ID、名称、核验邮箱域名、全部校区和负责人。只有平台总管理员可编辑与指定负责人；学校管理员看到的用户、商品、举报、统计和学校信息仅限所属学校。“我的发布”和自己的主页按发布校区分组展示历史商品。

微信小程序的移动优先网页版，包含商品浏览、搜索分类、发布编辑、收藏评论、站内聊天、个人中心、安全指南，以及邮箱验证码注册和邮箱密码登录。

## 本地运行

本目录是「校园闲置」Web 前端（React + Vite），同时通过脚本统一管理后端（`../backend`）。要求 Node.js 22+ 与 MySQL 8.0+。先创建独立数据库和最小权限账号，再复制环境变量：

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

前端默认 `http://localhost:5173`，API 默认 `http://localhost:8787`。服务启动时只在 `MYSQL_DATABASE` 指向的库内创建本站数据表，不会创建或删除数据库。

## 外部服务

- 邮箱注册：配置 QQ 邮箱 SMTP 的 `EMAIL_HOST_USER`、`EMAIL_HOST_PASSWORD`（授权码）和 `DEFAULT_FROM_EMAIL`，注册时发送 6 位、10 分钟有效的验证码。
- 商品图片：配置腾讯云 COS 的 `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`。若桶为公有读，可把自定义域名写入 `COS_PUBLIC_BASE_URL`；否则留空，由站内媒体地址动态生成短期签名。建议使用只允许指定桶路径的最小权限子账号。

## 构建与检查

```bash
cd frontend
npm test
npm run build
NODE_ENV=production npm start
```

生产环境由 Express 托管 `dist/`，nginx 只需反向代理到独立 Node 端口。请启用 HTTPS，并让 `APP_ORIGIN` 与公开站点地址完全一致。

部署到域名子路径时，例如 `/campus-trade/`，构建前设置 `VITE_BASE_PATH=/campus-trade/`，并让 nginx 使用带尾斜杠的 `proxy_pass http://127.0.0.1:8787/` 去除代理前缀。

> ⚠️ 生产环境的环境变量存放在 `/etc/campus-market/.env`（由 systemd `EnvironmentFile` 加载，`HOST=127.0.0.1` 限制只监听回环地址），**不在项目根目录**。因此服务器上重新构建前端时，需要显式传入构建期变量（dotenv 不会从项目目录读取到它）：
>
> ```bash
> cd /www/wwwroot/campus-market-web
> VITE_BASE_PATH=/campus-trade/ npm run build
> systemctl restart campus-market-web
> ```

## 手机端验收

样式从 320px 起采用移动优先布局，重点检查 360×800、390×844、430×932；700px 起切换平板/桌面增强布局。手机端固定底部导航、聊天输入区和所有主要触控目标均至少约 44px，并适配安全区。

## 当前生产部署

- 访问地址：`https://20250821cdcdifc.top/campus-trade/`
- 应用目录：`/www/wwwroot/campus-market-web`
- 服务：`campus-market-web.service`，仅监听 `127.0.0.1:8787`（不对外直接暴露）
- 环境变量：`/etc/campus-market/.env`（600 权限，原项目内 `.env` 已迁移并保留备份）
- nginx：现有 HTTPS 站点通过独立 `/campus-trade/` location 反向代理，配置片段见 `deploy/nginx-campus-market.conf`
- 数据库：独立 MySQL 数据库 `campus_market`

## 管理后台

管理后台位于 `/admin`（即 `https://20250821cdcdifc.top/campus-trade/admin/`），仅对 `role=admin` 的账号开放，提供：用户管理（列表/创建/编辑/删除）、商品管理（状态调整/删除）、举报处理（用户可在商品页举报，管理员在此处置）。

设置管理员账号：

```bash
# 方式一：设置环境变量 ADMIN_EMAILS（逗号分隔），服务启动时自动提升
echo 'ADMIN_EMAILS=admin@example.com' >> .env
# 方式二：直接提升已注册账号（脚本位于 ../backend/scripts）
npx tsx ../backend/scripts/make-admin.ts admin@example.com
# 方式三：在服务器交互式创建管理员（密码不回显）
npx tsx ../backend/scripts/create-admin.ts admin@example.com
```

数据库会自动迁移：`users` 表新增 `role` 字段（默认 `user`），并新增 `reports` 举报表。
