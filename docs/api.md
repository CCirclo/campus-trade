# 校园闲置 · 后端接口文档（REST API）

- 基础路径：`/api`
- 默认地址：`http://localhost:8787`（生产环境经 nginx 反向代理，见 `backend/deploy/`）
- 数据格式：`application/json`
- 错误格式：`{ "error": "<错误信息>" }`
- 状态码：`200` 成功 / `201` 创建成功 / `400` 参数错误 / `401` 未登录 / `403` 无权限 / `404` 不存在 / `429` 频率限制 / `500` 服务器错误 / `503` 服务未配置

## 通用约定

### 鉴权

| 中间件 | 说明 |
| --- | --- |
| `requireAuth` | 需登录（Cookie 会话） |
| `requireCampus` | 需登录且为校内用户 |
| `requireAdmin` | 需 `role=admin` 的管理员账号（用于 `/api/admin/*`） |

会话基于 Cookie（`SESSION_COOKIE`），登录/注册成功后自动写入。

### 公共字段

- 商品状态：`在售` / `已售出` / `已下架`
- 分类：商品分类列表（`categories`，见后端 `security.ts`）
- 成色：`conditions`（见后端 `security.ts`）
- 学校：`school_id`（当前默认 `ruc_suzhou`）

---

## 1. 认证 Auth — `/api/auth`

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/auth/me` | 获取当前登录用户 | 可选 |
| POST | `/api/auth/email-code` | 发送邮箱注册验证码 | 无 |
| POST | `/api/auth/register` | 邮箱验证码注册 | 无 |
| POST | `/api/auth/login` | 邮箱密码登录 | 无 |
| POST | `/api/auth/logout` | 退出登录 | 无 |
| POST | `/api/auth/change-password` | 修改密码（吊销其他会话） | 登录 |
| POST | `/api/auth/forgot-password` | 发送找回密码验证码 | 无 |
| POST | `/api/auth/reset-password` | 验证码重置密码（吊销所有会话） | 无 |

### GET `/api/auth/me`

响应：

```json
{
  "user": { "id": 1, "email": "student@ruc.edu.cn", "nickname": "同学A", "avatarUrl": "https://...", "emailVerified": true, "adminVerified": false, "role": "user" },
  "emailConfigured": true
}
```

未登录时 `user` 为 `null`。

### POST `/api/auth/email-code`

请求体：`{ "email": "student@ruc.edu.cn" }`

- 6 位验证码，10 分钟有效，尝试上限 5 次
- 已注册邮箱不发送但统一返回成功（防邮箱枚举）
- 响应：`{ "ok": true }`

### POST `/api/auth/register`

请求体：`{ "email", "password", "nickname", "code", "emailMessageNotifications?" }`

- 密码 8–72 字符，昵称 ≥ 2 字符
- 响应 `201`：`{ "user": { ... } }`（自动登录）

### POST `/api/auth/login`

请求体：`{ "email", "password" }`

响应：`{ "user": { ... } }`（写入会话 Cookie）

### POST `/api/auth/logout`

响应：`{ "ok": true }`

### POST `/api/auth/change-password`

请求体：`{ "currentPassword", "newPassword" }`（新密码 8–72 字符）

- 成功后吊销除当前会话外的所有会话
- 响应：`{ "ok": true }`

### POST `/api/auth/forgot-password`

请求体：`{ "email" }`

- 向已注册邮箱发送重置验证码（未注册也统一返回成功）
- 响应：`{ "ok": true }`

### POST `/api/auth/reset-password`

请求体：`{ "email", "code", "password" }`

- 成功后吊销所有会话，需重新登录
- 响应：`{ "ok": true }`

---

## 2. 商品 Items

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/items` | 商品列表（搜索/分类/排序） | 无 |
| GET | `/api/items/:id` | 商品详情（含评论、收藏状态） | 可选 |
| POST | `/api/items` | 发布商品 | 校内登录 |
| PATCH | `/api/items/:id` | 编辑商品（仅本人） | 校内登录 |
| POST | `/api/items/:id/favorite` | 收藏/取消收藏（切换） | 校内登录 |
| POST | `/api/items/:id/comments` | 发表评论 | 校内登录 |

### GET `/api/items`

查询参数：

| 参数 | 说明 |
| --- | --- |
| `keyword` | 标题/描述关键词（≤40 字符） |
| `category` | 分类 |
| `condition` | 成色 |
| `schoolId` | 学校（默认 `ruc_suzhou`） |
| `sort` | `latest`（默认）/ `priceAsc` / `priceDesc` |

响应：`{ "items": [ Item... ], "total": n }`（最多 100 条）

### GET `/api/items/:id`

响应：

```json
{
  "item": { "id": 1, "title": "...", "price": 99.9, "images": ["https://..."], "category": "...", "condition": "...", "description": "...", "status": "在售", "createdAt": "...", "seller": { "id": 1, "nickname": "...", "avatarUrl": "..." } },
  "favorited": false,
  "comments": [ { "id": 1, "content": "...", "createdAt": "...", "author": { "id": 2, "nickname": "...", "avatarUrl": "...", "verified": true, "isSeller": false } } ]
}
```

### POST `/api/items`

请求体：

```json
{
  "title": "二手教材（≥3 字符）",
  "price": 12.5,
  "category": "教材",
  "condition": "九成新",
  "description": "描述（≤1000 字符）",
  "images": ["https://cos.../xxx.jpg"]
}
```

- `images` 最多 9 张
- 响应 `201`：`{ "id": 1 }`

### PATCH `/api/items/:id`

请求体同 POST，另可传 `status`（`在售`/`已售出`/`已下架`）。

响应：`{ "ok": true }`

### POST `/api/items/:id/favorite`

无请求体。响应：`{ "favorited": true|false }`（切换后的状态）

### POST `/api/items/:id/comments`

请求体：`{ "content": "评论内容（≥2 字符，≤200）" }`

响应 `201`：`{ "id": 1 }`（同时邮件通知管理员）

---

## 3. 用户 Users

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/users/:id` | 用户公开主页（资料 + 在售商品） | 无 |

响应：

```json
{
  "profile": { "id": 1, "nickname": "...", "avatarUrl": "...", "emailVerified": true },
  "items": [ Item... ]
}
```

---

## 4. 个人中心 Me

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/me/items` | 我发布的商品 | 登录 |
| GET | `/api/me/favorites` | 我收藏的商品 | 登录 |
| GET | `/api/me/stats` | 我的统计 | 登录 |
| GET | `/api/me/wallet` | 我的钱包（奖励余额与流水） | 登录 |
| PUT | `/api/me/profile` | 更新个人资料 | 登录 |
| POST | `/api/me/avatar` | 上传头像（multipart） | 登录 |

### GET `/api/me/stats`

响应：`{ "stats": { "total": 3, "selling": 2, "sold": 1 } }`

### GET `/api/me/wallet`

奖励由管理员手动发放，用户端只读。

响应：

```json
{
  "wallet": {
    "originium": { "code": "originium", "name": "至纯源石", "description": "开发贡献凭证 · 或参与治理与分红", "balance": 10 },
    "lungmen": { "code": "lungmen", "name": "龙门币", "description": "通用货币 · 可兑换商品与抽奖", "balance": 200 }
  },
  "entries": [
    { "id": 1, "currency": "lungmen", "amount": 100, "balanceAfter": 200, "reason": "社区贡献奖励", "operator": "admin@example.com", "createdAt": "2026-08-20T08:00:00.000Z" }
  ]
}
```

- `entries` 为最近 50 条发放流水。
- 管理员发放:`npm run grant -- <邮箱> <币种> <数量> <原因> [--yes]`;查询:`npm run grant -- --list <邮箱>`。

### PUT `/api/me/profile`

请求体：`{ "nickname"（≥2 字符）, "wechatId", "emailMessageNotifications": true|false }`

响应：`{ "user": { ... } }`

### POST `/api/me/avatar`

- `multipart/form-data`，字段 `avatar`，限 2MB，仅 JPG/PNG/WebP
- 响应 `201`：`{ "avatarUrl": "...", "user": { ... } }`

---

## 5. 站内聊天 Conversations

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/conversations` | 发起会话（含商品卡片消息） | 校内登录 |
| GET | `/api/conversations` | 会话列表 | 登录 |
| GET | `/api/conversations/unread-count` | 未读数 | 登录 |
| GET | `/api/conversations/:id/messages` | 消息记录 | 登录 |
| POST | `/api/conversations/:id/messages` | 发送消息 | 校内登录 |
| POST | `/api/conversations/:id/read` | 标记已读 | 登录 |

### POST `/api/conversations`

请求体：`{ "itemId": 1 }`

- 不能与自己发起会话
- 首次发送会附带商品卡片消息（`item_card`）
- 响应：`{ "id": 1 }`

### GET `/api/conversations`

响应：

```json
{
  "conversations": [
    { "id": 1, "itemId": 1, "itemTitle": "...", "partner": { "nickname": "...", "avatarUrl": "..." }, "lastMessage": "...", "unreadCount": 0, "updatedAt": "..." }
  ]
}
```

### GET `/api/conversations/unread-count`

响应：`{ "count": 2 }`

### GET `/api/conversations/:id/messages`

响应：

```json
{
  "conversation": { "id": 1, "itemId": 1, "itemTitle": "..." },
  "messages": [
    { "id": 1, "content": "...", "type": "text|item_card", "item": null, "createdAt": "...", "mine": true, "sender": { "nickname": "...", "avatarUrl": "..." } }
  ]
}
```

### POST `/api/conversations/:id/messages`

请求体：`{ "content": "消息（1–500 字符）" }`

响应 `201`：`{ "id": 1, "emailNotification": "sent|recent_online|disabled|failed" }`

### POST `/api/conversations/:id/read`

响应：`{ "ok": true }`

---

## 6. 反馈与举报

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/feedback` | 提交反馈 | 登录 |
| POST | `/api/reports` | 举报商品 | 校内登录 |

### POST `/api/feedback`

请求体：`{ "type": "问题反馈|功能建议|其他", "content": "≥10 字符" }`

- 频率限制：1 小时内最多 5 次
- 响应 `201`：`{ "id": 1 }`

### POST `/api/reports`

请求体：`{ "itemId": 1, "reason": "虚假信息|违规内容|诈骗风险|重复发布|其他", "detail": "≤500 字符" }`

- 频率限制：1 小时内最多 5 次
- 响应 `201`：`{ "id": 1 }`

---

## 7. 图片上传 Uploads

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/uploads` | 上传商品图片（多图） | 校内登录 |
| GET | `/api/media/:token` | 获取签名图片 URL（302 跳转） | 无 |

### POST `/api/uploads`

- `multipart/form-data`，字段 `images`（数组），最多 9 张，单张 ≤ 5MB
- 仅 JPG / PNG / WebP / GIF（校验真实图片签名）
- 依赖腾讯云 COS 配置，未配置返回 `503`
- 响应 `201`：`{ "urls": ["https://..."] }`

### GET `/api/media/:token`

- 私有桶图片的临时签名地址（`Cache-Control: private, max-age=600`）
- 响应：`302` 跳转到签名 URL

---

## 8. 管理后台 Admin — `/api/admin`（需 `role=admin`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/stats` | 平台统计 |
| GET | `/api/admin/users` | 用户列表 |
| POST | `/api/admin/users` | 创建用户 |
| PATCH | `/api/admin/users/:id` | 编辑用户 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| GET | `/api/admin/items` | 商品列表 |
| PATCH | `/api/admin/items/:id` | 调整商品状态 |
| DELETE | `/api/admin/items/:id` | 删除商品 |
| GET | `/api/admin/reports` | 举报列表 |
| PATCH | `/api/admin/reports/:id` | 处置举报 |

> 管理员账号通过环境变量 `ADMIN_EMAILS`（启动时自动提升）或脚本 `backend/scripts/make-admin.ts` / `create-admin.ts` 设置。

---

## 9. 其他

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（含数据库连通性） |

响应：`{ "ok": true }`
