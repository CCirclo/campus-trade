import { Router, type Response } from 'express';
import { all, dateIso, one, run, type DbRow } from './db.js';
import { type AuthedRequest } from './auth.js';
import { cleanText } from './security.js';
import { campusScopeNames, migrateLegacyScope } from './campus-catalog.js';
import { canAccessCampus, campusSql, loadAdminScope, type AdminScope } from './admin-scope.js';
import { TREEHOLE_REPORT_REASONS } from './treehole.js';

export const adminTreeholeRouter = Router();
const PAGE = 20;

type AdminContext = AdminScope & { schoolIds: string[] };

async function adminContext(req: AuthedRequest): Promise<AdminContext> {
  const scope = await loadAdminScope(req.user!);
  const schoolIds = scope.isSuperAdmin
    ? (await all('SELECT id FROM schools WHERE active=1')).map(r => String(r.id))
    : [...new Set(scope.campuses.map(c => c.schoolId))];
  return { ...scope, schoolIds };
}

function requireManaged(ctx: AdminContext, schoolId: unknown, campusId: unknown): boolean {
  return canAccessCampus(ctx, schoolId, campusId);
}

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(v => String(v)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((v: unknown) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function adminScopeNames(row: Record<string, unknown>) {
  const scope = migrateLegacyScope(row.school_id, row.campus_id);
  return { schoolId: scope.schoolId, campusId: scope.campusId, ...campusScopeNames(scope.schoolId, scope.campusId) };
}

// ---------- 帖子管理（含匿名者真实身份，仅管理员可见） ----------
adminTreeholeRouter.get('/posts', async (req: AuthedRequest, res: Response) => {
  const ctx = await adminContext(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const q = cleanText(req.query.q, 40);
  const where: string[] = [];
  const args: unknown[] = [];
  const scope = campusSql('p', ctx);
  if (scope.clause) { where.push(scope.clause); args.push(...scope.args); }
  if (q) { where.push('(p.content LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await one(`SELECT COUNT(*) total FROM treehole_posts p JOIN users u ON u.id=p.user_id ${filter}`, args);
  const rows = await all<DbRow>(
    `SELECT p.*, u.nickname AS author_nickname, u.email AS author_email, u.avatar_url AS author_avatar,
       (SELECT COUNT(*) FROM treehole_likes l WHERE l.post_id=p.id) likes_count,
       (SELECT COUNT(*) FROM treehole_comments c WHERE c.post_id=p.id) comments_count
     FROM treehole_posts p JOIN users u ON u.id=p.user_id ${filter}
     ORDER BY p.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    args,
  );
  res.json({
    posts: rows.map(r => ({
      id: Number(r.id),
      anonymous: Boolean(r.anonymous),
      content: String(r.content || ''),
      images: parseImages(r.images),
      likesCount: Number(r.likes_count || 0),
      commentsCount: Number(r.comments_count || 0),
      status: String(r.status || '正常'),
      ...adminScopeNames(r),
      createdAt: dateIso(r.created_at),
      author: { id: Number(r.user_id), nickname: String(r.author_nickname || ''), email: String(r.author_email || ''), avatarUrl: String(r.author_avatar || '') },
    })),
    total: Number(count?.total || 0),
    page,
    pageSize: PAGE,
  });
});

adminTreeholeRouter.delete('/posts/:id', async (req: AuthedRequest, res: Response) => {
  const ctx = await adminContext(req);
  const id = Number(req.params.id);
  const post = await one('SELECT id,school_id,campus_id FROM treehole_posts WHERE id=?', [id]);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (!requireManaged(ctx, post.school_id, post.campus_id)) return res.status(403).json({ error: '不能删除其他学校的帖子' });
  await run('DELETE FROM treehole_posts WHERE id=?', [id]);
  res.json({ ok: true });
});

adminTreeholeRouter.delete('/comments/:id', async (req: AuthedRequest, res: Response) => {
  const ctx = await adminContext(req);
  const id = Number(req.params.id);
  const row = await one(`SELECT c.id,p.school_id,p.campus_id FROM treehole_comments c JOIN treehole_posts p ON p.id=c.post_id WHERE c.id=?`, [id]);
  if (!row) return res.status(404).json({ error: '评论不存在' });
  if (!requireManaged(ctx, row.school_id, row.campus_id)) return res.status(403).json({ error: '不能删除其他学校的评论' });
  await run('DELETE FROM treehole_comments WHERE id=?', [id]);
  res.json({ ok: true });
});

// ---------- 举报管理 ----------
adminTreeholeRouter.get('/reports', async (req: AuthedRequest, res: Response) => {
  const ctx = await adminContext(req);
  const status = cleanText(req.query.status, 20);
  const page = Math.max(1, Number(req.query.page) || 1);
  const where: string[] = [];
  const args: unknown[] = [];
  const scope = campusSql('p', ctx);
  if (scope.clause) { where.push(scope.clause); args.push(...scope.args); }
  if (status) { where.push('r.status=?'); args.push(status); }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await one(
    `SELECT COUNT(*) total FROM treehole_reports r
     LEFT JOIN treehole_comments c ON r.target_type='comment' AND c.id=r.target_id
     JOIN treehole_posts p ON p.id = IF(r.target_type='post', r.target_id, c.post_id)
     ${filter}`,
    args,
  );
  const rows = await all<DbRow>(
    `SELECT r.*, p.id AS post_id, p.school_id, p.campus_id,
       IF(r.target_type='post', p.content, c.content) AS target_content,
       u.nickname AS reporter_nickname, u.email AS reporter_email,
       uu.nickname AS handler_nickname
     FROM treehole_reports r
     LEFT JOIN treehole_comments c ON r.target_type='comment' AND c.id=r.target_id
     JOIN treehole_posts p ON p.id = IF(r.target_type='post', r.target_id, c.post_id)
     JOIN users u ON u.id=r.reporter_id
     LEFT JOIN users uu ON uu.id=r.handler_id
     ${filter}
     ORDER BY (r.status='待处理') DESC, r.id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
    args,
  );
  res.json({
    reports: rows.map(r => ({
      id: Number(r.id),
      targetType: String(r.target_type),
      targetId: Number(r.target_id),
      postId: Number(r.post_id),
      targetContent: String(r.target_content || '').slice(0, 200),
      reason: String(r.reason || ''),
      detail: String(r.detail || ''),
      status: String(r.status || '待处理'),
      createdAt: dateIso(r.created_at),
      handledAt: r.handled_at ? dateIso(r.handled_at) : null,
      handlerNickname: r.handler_nickname ? String(r.handler_nickname) : null,
      ...adminScopeNames(r),
      reporter: { id: Number(r.reporter_id), nickname: String(r.reporter_nickname || ''), email: String(r.reporter_email || '') },
    })),
    total: Number(count?.total || 0),
    page,
    pageSize: PAGE,
  });
});

adminTreeholeRouter.patch('/reports/:id', async (req: AuthedRequest, res: Response) => {
  const ctx = await adminContext(req);
  const id = Number(req.params.id);
  const status = cleanText(req.body.status, 20);
  if (!['待处理', '已处理', '已驳回'].includes(status)) return res.status(400).json({ error: '处理状态无效' });
  const existing = await one(
    `SELECT r.id, p.school_id, p.campus_id FROM treehole_reports r
     LEFT JOIN treehole_comments c ON r.target_type='comment' AND c.id=r.target_id
     JOIN treehole_posts p ON p.id = IF(r.target_type='post', r.target_id, c.post_id)
     WHERE r.id=?`,
    [id],
  );
  if (!existing) return res.status(404).json({ error: '举报不存在' });
  if (!requireManaged(ctx, existing.school_id, existing.campus_id)) return res.status(403).json({ error: '不能处理其他学校的举报' });
  await run(
    `UPDATE treehole_reports SET status=?, handled_at=${status === '待处理' ? 'NULL' : 'CURRENT_TIMESTAMP'}, handler_id=? WHERE id=?`,
    [status, status === '待处理' ? null : req.user!.id, id],
  );
  res.json({ ok: true });
});

// 供前端管理页展示可用的举报原因。
adminTreeholeRouter.get('/meta', (_req, res) => res.json({ reasons: TREEHOLE_REPORT_REASONS }));
