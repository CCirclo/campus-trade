import { Router, type Response } from 'express';
import { all, dateIso, one, pool, run, type DbRow } from './db.js';
import { requireAuth, requireCampus, type AuthedRequest } from './auth.js';
import { cleanText, consumeRateLimit } from './security.js';
import { campusBelongsToSchool, campusScopeNames, defaultCampusScope, migrateLegacyScope } from './campus-catalog.js';
import { canViewItemInScope, type MarketScope } from './market-scope.js';
import { parsePagination } from './search.js';

export const treeholeRouter = Router();

export const TREEHOLE_REPORT_REASONS = ['违规内容', '骚扰攻击', '泄露隐私', '虚假信息', '其他'] as const;
const MAX_IMAGES = 9;

/** 匿名编号的对外显示文本（帖内稳定编号，仅用于区分同一帖内不同匿名者）。 */
export function anonymousAlias(no: number): string {
  return `匿名${no}号`;
}

type TreeholeTarget = { userId: number; schoolId: string; campusId: string };
type TreeholeViewer = MarketScope & { userId?: number };

/** 树洞可见性与商品一致：本人 OR 同校同校区。 */
export function canViewTreeholeInScope(viewer: TreeholeViewer, post: TreeholeTarget): boolean {
  return canViewItemInScope(viewer, post);
}

function treeholeScope(req: AuthedRequest): MarketScope {
  if (req.user) return { schoolId: req.user.schoolId, campusId: req.user.campusId };
  const fallback = defaultCampusScope();
  const schoolId = cleanText(req.query.schoolId, 40) || fallback.schoolId;
  const campusId = cleanText(req.query.campusId, 40) || fallback.campusId;
  return campusBelongsToSchool(schoolId, campusId) ? { schoolId, campusId } : fallback;
}

function canViewScoped(req: AuthedRequest, row: Record<string, unknown>): boolean {
  const scope = treeholeScope(req);
  return canViewTreeholeInScope({ ...scope, userId: req.user?.id }, {
    userId: Number(row.user_id),
    schoolId: String(row.school_id),
    campusId: String(row.campus_id),
  });
}

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(v => String(v)).filter(Boolean).slice(0, MAX_IMAGES);
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((v: unknown) => String(v)).filter(Boolean).slice(0, MAX_IMAGES) : [];
  } catch {
    return [];
  }
}

function scopeNames(row: Record<string, unknown>) {
  const scope = migrateLegacyScope(row.school_id, row.campus_id);
  return { schoolId: scope.schoolId, campusId: scope.campusId, ...campusScopeNames(scope.schoolId, scope.campusId) };
}

const postSelect = `SELECT p.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar,
  (SELECT COUNT(*) FROM treehole_likes l WHERE l.post_id=p.id) likes_count,
  (SELECT COUNT(*) FROM treehole_comments c WHERE c.post_id=p.id) comments_count
  FROM treehole_posts p JOIN users u ON u.id=p.user_id`;

function mapPostAuthor(row: Record<string, unknown>, anonymous: boolean) {
  if (anonymous) return { anonymous: true, alias: '楼主', isOP: true };
  return { anonymous: false, id: Number(row.user_id), nickname: String(row.author_nickname || ''), avatarUrl: String(row.author_avatar || ''), isOP: true };
}

function mapPost(row: Record<string, unknown>, viewerId: number | undefined, liked: boolean) {
  const anonymous = Boolean(row.anonymous);
  return {
    id: Number(row.id),
    anonymous,
    content: String(row.content || ''),
    images: parseImages(row.images),
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    liked,
    status: String(row.status || '正常'),
    ...scopeNames(row),
    createdAt: dateIso(row.created_at),
    mine: viewerId != null && Number(row.user_id) === viewerId,
    author: mapPostAuthor(row, anonymous),
  };
}

function mapComment(row: Record<string, unknown>, postOwnerId: number, viewerId: number | undefined) {
  const anonymous = Boolean(row.anonymous);
  const isOP = Number(row.user_id) === postOwnerId;
  let author: Record<string, unknown>;
  if (anonymous) {
    const no = row.alias_no ? Number(row.alias_no) : 0;
    author = isOP ? { anonymous: true, alias: '楼主', isOP: true } : { anonymous: true, alias: no > 0 ? anonymousAlias(no) : '匿名', isOP: false };
  } else {
    author = { anonymous: false, id: Number(row.user_id), nickname: String(row.author_nickname || ''), avatarUrl: String(row.author_avatar || ''), isOP };
  }
  return {
    id: Number(row.id),
    postId: Number(row.post_id),
    parentId: row.parent_id ? Number(row.parent_id) : null,
    content: String(row.content || ''),
    anonymous,
    createdAt: dateIso(row.created_at),
    mine: viewerId != null && Number(row.user_id) === viewerId,
    author,
  };
}

// ---------- 列表 ----------
treeholeRouter.get('/posts', async (req: AuthedRequest, res: Response) => {
  const { schoolId, campusId } = treeholeScope(req);
  const pagination = parsePagination(req.query.page, req.query.pageSize);
  if ('error' in pagination) return res.status(400).json({ error: pagination.error });

  let likedIds = new Set<number>();
  if (req.user) {
    const likedRows = await all('SELECT post_id FROM treehole_likes WHERE user_id=?', [req.user.id]);
    likedIds = new Set(likedRows.map(r => Number(r.post_id)));
  }

  const totalRow = await one(`SELECT COUNT(*) AS total FROM treehole_posts p WHERE p.school_id=? AND p.campus_id=? AND p.status='正常'`, [schoolId, campusId]);
  const total = Number(totalRow?.total || 0);
  const offset = (pagination.page - 1) * pagination.pageSize;
  const rows = await all(`${postSelect} WHERE p.school_id=? AND p.campus_id=? AND p.status='正常' ORDER BY p.created_at DESC, p.id DESC LIMIT ${pagination.pageSize} OFFSET ${offset}`, [schoolId, campusId]);

  res.json({
    posts: rows.map(r => mapPost(r, req.user?.id, likedIds.has(Number(r.id)))),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasMore: pagination.page * pagination.pageSize < total,
  });
});

// ---------- 发布 ----------
treeholeRouter.post('/posts', requireAuth, requireCampus, async (req: AuthedRequest, res: Response) => {
  const content = cleanText(req.body.content, 1000);
  const images = Array.isArray(req.body.images)
    ? req.body.images.map((v: unknown) => cleanText(v, 800)).filter(Boolean).slice(0, MAX_IMAGES)
    : [];
  const anonymous = Boolean(req.body.anonymous);
  const campusId = cleanText(req.body.campusId, 40) || req.user!.campusId;

  if (!content.trim() && !images.length) return res.status(400).json({ error: '请填写文字或至少添加一张图片' });
  if (!campusBelongsToSchool(req.user!.schoolId, campusId)) return res.status(400).json({ error: '所选校区不属于当前学校' });

  const result = await run(
    `INSERT INTO treehole_posts (user_id, content, images, anonymous, school_id, campus_id) VALUES (?,?,?,?,?,?)`,
    [req.user!.id, content, JSON.stringify(images), anonymous ? 1 : 0, req.user!.schoolId, campusId],
  );
  res.status(201).json({ id: Number(result.insertId) });
});

// ---------- 详情 + 评论 ----------
treeholeRouter.get('/posts/:id', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: '树洞帖子不存在' });
  const row = await one(`${postSelect} WHERE p.id=?`, [id]);
  if (!row) return res.status(404).json({ error: '树洞帖子不存在或已删除' });
  if (!canViewScoped(req, row)) return res.status(404).json({ error: '该帖子不在你当前选择的校区' });

  const liked = req.user ? Boolean(await one('SELECT 1 FROM treehole_likes WHERE post_id=? AND user_id=?', [id, req.user.id])) : false;
  const comments = await all(
    `SELECT c.*, u.nickname AS author_nickname, u.avatar_url AS author_avatar, a.alias_no
     FROM treehole_comments c
     JOIN users u ON u.id=c.user_id
     LEFT JOIN treehole_anon_aliases a ON a.post_id=c.post_id AND a.user_id=c.user_id
     WHERE c.post_id=? ORDER BY c.created_at ASC, c.id ASC`,
    [id],
  );

  res.json({
    post: mapPost(row, req.user?.id, liked),
    comments: comments.map(c => mapComment(c, Number(row.user_id), req.user?.id)),
  });
});

// ---------- 删除帖子 ----------
treeholeRouter.delete('/posts/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: '树洞帖子不存在' });
  const existing = await one('SELECT id,user_id FROM treehole_posts WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '树洞帖子不存在或已删除' });
  if (Number(existing.user_id) !== req.user!.id) return res.status(403).json({ error: '只能删除自己发布的帖子' });
  await run('DELETE FROM treehole_posts WHERE id=?', [id]);
  res.json({ ok: true });
});

// ---------- 点赞 ----------
treeholeRouter.post('/posts/:id/like', requireAuth, requireCampus, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const post = await one('SELECT id,user_id,school_id,campus_id FROM treehole_posts WHERE id=? AND status=\'正常\'', [id]);
  if (!post || !canViewScoped(req, post)) return res.status(404).json({ error: '帖子不存在或不在当前校区' });
  const existing = await one('SELECT 1 FROM treehole_likes WHERE post_id=? AND user_id=?', [id, req.user!.id]);
  if (existing) await run('DELETE FROM treehole_likes WHERE post_id=? AND user_id=?', [id, req.user!.id]);
  else await run('INSERT INTO treehole_likes (post_id,user_id) VALUES (?,?)', [id, req.user!.id]);
  const count = await one('SELECT COUNT(*) AS count FROM treehole_likes WHERE post_id=?', [id]);
  res.json({ liked: !existing, likesCount: Number(count?.count || 0) });
});

// ---------- 发表评论（含楼中楼回复与匿名编号） ----------
treeholeRouter.post('/posts/:id/comments', requireAuth, requireCampus, async (req: AuthedRequest, res: Response) => {
  const postId = Number(req.params.id);
  const content = cleanText(req.body.content, 500);
  if (content.trim().length < 2) return res.status(400).json({ error: '评论至少需要 2 个字符' });
  const anonymous = Boolean(req.body.anonymous);
  const parentIdRaw = req.body.parentId;
  const parentId = parentIdRaw === null || parentIdRaw === undefined || parentIdRaw === '' ? null : Number(parentIdRaw);

  const post = await one('SELECT id,user_id,school_id,campus_id FROM treehole_posts WHERE id=? AND status=\'正常\'', [postId]);
  if (!post || !canViewScoped(req, post)) return res.status(404).json({ error: '帖子不存在或不在当前校区' });

  if (parentId !== null) {
    if (!Number.isSafeInteger(parentId)) return res.status(400).json({ error: '回复对象无效' });
    const parent = await one('SELECT id,post_id FROM treehole_comments WHERE id=? AND post_id=?', [parentId, postId]);
    if (!parent) return res.status(400).json({ error: '要回复的评论不存在' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let aliasNo: number | null = null;
    if (anonymous) {
      // 锁帖子行，串行化同帖匿名编号分配，保证编号稳定且不重号。
      await conn.execute('SELECT id FROM treehole_posts WHERE id=? FOR UPDATE', [postId]);
      const [existingRows] = await conn.execute<any[]>('SELECT alias_no FROM treehole_anon_aliases WHERE post_id=? AND user_id=?', [postId, req.user!.id]);
      if (existingRows.length) {
        aliasNo = Number(existingRows[0].alias_no);
      } else {
        const [maxRows] = await conn.execute<any[]>('SELECT COALESCE(MAX(alias_no),0)+1 AS next_no FROM treehole_anon_aliases WHERE post_id=?', [postId]);
        aliasNo = Number(maxRows[0]?.next_no || 1);
        await conn.execute('INSERT INTO treehole_anon_aliases (post_id,user_id,alias_no) VALUES (?,?,?)', [postId, req.user!.id, aliasNo]);
      }
    }
    const [result] = await conn.execute<any>('INSERT INTO treehole_comments (post_id,user_id,parent_id,content,anonymous) VALUES (?,?,?,?,?)', [postId, req.user!.id, parentId, content, anonymous ? 1 : 0]);
    await conn.commit();
    res.status(201).json({ id: Number(result.insertId), aliasNo });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ---------- 删除评论 ----------
treeholeRouter.delete('/comments/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: '评论不存在' });
  const existing = await one('SELECT id,user_id FROM treehole_comments WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '评论不存在或已删除' });
  if (Number(existing.user_id) !== req.user!.id) return res.status(403).json({ error: '只能删除自己的评论' });
  await run('DELETE FROM treehole_comments WHERE id=?', [id]);
  res.json({ ok: true });
});

// ---------- 举报 ----------
treeholeRouter.post('/reports', requireAuth, requireCampus, async (req: AuthedRequest, res: Response) => {
  if (!consumeRateLimit(`treehole-report:${req.user!.id}`, 5, 60 * 60_000)) return res.status(429).json({ error: '举报提交过于频繁，请稍后再试' });
  const targetType = cleanText(req.body.targetType, 10);
  const targetId = Number(req.body.targetId);
  const reason = cleanText(req.body.reason, 20);
  const detail = cleanText(req.body.detail, 500);
  if (!['post', 'comment'].includes(targetType)) return res.status(400).json({ error: '请选择举报对象类型' });
  if (!(TREEHOLE_REPORT_REASONS as readonly string[]).includes(reason)) return res.status(400).json({ error: '请选择举报原因' });
  if (!Number.isSafeInteger(targetId) || targetId < 1) return res.status(400).json({ error: '举报对象无效' });

  let post: DbRow | undefined;
  if (targetType === 'post') {
    post = await one('SELECT id,user_id,school_id,campus_id FROM treehole_posts WHERE id=?', [targetId]);
  } else {
    post = await one(`SELECT p.id,p.user_id,p.school_id,p.campus_id FROM treehole_posts p JOIN treehole_comments c ON c.post_id=p.id WHERE c.id=?`, [targetId]);
  }
  if (!post || !canViewScoped(req, post)) return res.status(404).json({ error: '内容不存在或不在当前校区' });

  const result = await run('INSERT INTO treehole_reports (target_type,target_id,reporter_id,reason,detail) VALUES (?,?,?,?,?)', [targetType, targetId, req.user!.id, reason, detail]);
  res.status(201).json({ id: Number(result.insertId) });
});
