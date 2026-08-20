# backend — 后端 API

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
