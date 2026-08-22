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
| `keyword` | 标题/类目/描述关键词（≤40 字符） |
| `category` | 分类 |
| `condition` | 成色 |
| `schoolId` | 学校（默认 `ruc_suzhou`） |
| `sort` | `latest`（默认）/ `priceAsc` / `priceDesc` |
| `page` | 页码，从 1 开始（默认 1；`(page - 1) × pageSize` 不得超过 10,000） |
| `pageSize` | 每页数量（默认 20，最大 100） |

关键词会先归一化并扩展已配置的校园简称。**多个查询词之间是 AND 关系**：例如 `iphone 15` 必须同时命中 `iphone` 与 `15`；每个查询词的别名变体（如 高数 ↔ 高等数学）是组内 OR 替代。含数字/型号/版本的词使用非数字边界匹配，`15` 不会误命中 `150` 或 `2015`。默认排序按标题、类目、描述的加权相关度，再按发布时间和商品 ID 稳定排序。显式价格排序仍优先按价格排序。

响应：`{ "items": [ Item... ], "total": n, "page": 1, "pageSize": 20, "hasMore": false, "requestId": "...", "algorithmVersion": "keyword-v1" }`。`total` 是全部匹配商品数（混合召回启用时为有界候选池数量），`page`/`pageSize` 回显本次分页参数，`hasMore` 表示是否存在下一页。非法分页参数返回 HTTP 400。

搜索实现、AND 语义与离线评测见 [`search.md`](search.md)。

### GET `/api/recommendations`

参数：`schoolId`、必填 UUID `sessionId`、可选签名 `cursor`、`pageSize`（1–50）。返回 `items`、`requestId`、`algorithmVersion`、`nextCursor`、`previousCursor` 和 `hasMore`。推荐关闭或未进入灰度时返回最新发布结果，结构保持一致。

### POST `/api/events/batch`

一次写入 1–50 条搜索、曝光、点击或转化事件。公共字段为 UUID 格式的 `eventId/requestId/sessionId`、`type/source`、`occurredAt` 和 `algorithmVersion`；商品事件包含 `itemId`，曝光/点击包含 1–500 的 `position`。服务端忽略客户端用户 ID，搜索原文不会落库。成功接收返回 HTTP 202；写入失败不影响浏览请求。

### GET `/api/admin/analytics/recommendations`

管理员接口。可选 `days=1..90`，返回按来源和算法版本聚合的 CTR、收藏率、会话发起率与商品覆盖。

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
- 响应 `201`：`{ "id": 1, "embeddingStatus": "pending|ready|disabled|missing" }`。向量任务只需持久化入队即返回，不等待模型推理。

### PATCH `/api/items/:id`

请求体同 POST，另可传 `status`（`在售`/`已售出`/`已下架`）。

响应：`{ "ok": true, "embeddingStatus": "pending|ready|disabled|missing" }`

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
| PUT | `/api/me/profile` | 更新个人资料 | 登录 |
| POST | `/api/me/avatar` | 上传头像（multipart） | 登录 |

### GET `/api/me/stats`

响应：`{ "stats": { "total": 3, "selling": 2, "sold": 1 } }`

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
