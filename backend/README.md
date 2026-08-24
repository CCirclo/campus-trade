# backend — 后端 API

## 学校与校区模型

`users` 和 `items` 均使用独立的 `school_id`、`campus_id`。`schools`、`campuses`、`school_email_domains` 保存可管理目录，`school_admins` 保存学校负责人。服务启动会为旧库增加校区列，并把 `ruc_suzhou` 无损迁移为 `ruc` / `suzhou`。迁移幂等，不删除用户或商品。普通资料接口只能修改属于原学校的校区；学校只能由注册邮箱目录匹配或由管理员显式调整。

首次启动空数据库前可设置单行 JSON 作为初始种子：

```env
SCHOOL_CATALOG_JSON=[{"id":"ruc","name":"中国人民大学","emailDomains":["ruc.edu.cn"],"campuses":[{"id":"suzhou","name":"苏州校区"}]}]
```

初始化后应在 Admin 的“学校”页面新增或修改学校、校区和核验邮箱域名，保存后立即刷新运行时目录。邮箱域名精确匹配。

平台总管理员固定为 `2025202211@ruc.edu.cn`。该账号可查看全平台数据、维护学校并指定负责人。其他 admin 的所有用户、商品、举报和统计接口都按其负责学校强制过滤；推荐分析仅总管理员可查看。

商品的学校/校区是发布时快照。非主人只能在完全相同的学校与校区查看详情、收藏、评论、举报或发起对话；主人不受当前校区限制，并可按校区查看自己的全部商品。

校园闲置平台的后端服务，基于 **Node.js + Express 5 + MySQL 8**，提供 REST API、邮箱验证码注册登录、站内聊天、图片上传（腾讯云 COS）、举报与管理后台接口等能力。

## 目录结构

```
backend/
├── server/      # API 服务源码（Express 路由、数据库、鉴权、邮件、存储、安全）
├── scripts/     # 运维脚本（管理员设置等）
├── test/        # 单元测试
└── deploy/      # 部署配置（systemd 服务、nginx 反向代理片段）
```

## 运行

后端由前端包统一管理，在 `frontend/` 目录下运行：

```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev      # 同时启动 API(:8787) 与前端(:5173)
```

仅启动 API：

```bash
cd ../frontend
npx tsx ../backend/server/bootstrap.ts
```

## 测试

```bash
cd ../frontend
npm test         # 等价于 node --import tsx --test ../backend/test/*.test.ts
```

## 常用脚本

```bash
# 将已注册账号提升为管理员
cd ../frontend && npx tsx ../backend/scripts/make-admin.ts admin@example.com
# 交互式创建管理员（密码不回显）
cd ../frontend && npx tsx ../backend/scripts/create-admin.ts admin@example.com
```

## 接口文档

详见 [`docs/api.md`](../docs/api.md)。

## 部署

`deploy/` 内含 systemd 服务文件（`campus-market-web.service`）与 nginx 反向代理配置片段（`nginx-campus-market.conf`），生产服务器路径以实际为准。生产环境由 Express 托管前端构建产物 `dist/`，环境变量存放于 `/etc/campus-market/.env`（600 权限）。
