import { Router, type Response } from 'express';
import { all, dateIso, one, run, type DbRow } from './db.js';
import { requireAuth, requireCampus, type AuthedRequest } from './auth.js';
import { cleanText, validPrice } from './security.js';
import { campusBelongsToSchool, campusScopeNames, defaultCampusScope } from './campus-catalog.js';
import { canViewItemInScope } from './market-scope.js';

export const errandsRouter = Router();

export const ERRAND_SIDES = ['supply', 'demand'] as const;
export const CARGO_TYPES = ['快递', '外卖', '其他'] as const;
export const TRANSPORT_METHODS = ['步行', '自行车', '电瓶车', '摩托车'] as const;

export const CAMPUS_PICKUP_LOCATIONS: Record<string, string[]> = {
  suzhou: ['📦 快递站·文缘人才公寓', '📦 快递站·翰林缘/妈妈驿站', '📪 快递柜·修远楼大门入口左侧通道内', '🍱 外卖柜·文缘人才公寓', '🍱 外卖柜·修远楼大门入口左侧通道内', '🍱 外卖柜·静斋'],
  zhongguancun: ['📦 快递站·中关村校区', '📪 快递柜·中关村校区', '🍱 外卖柜·中关村校区'],
  tongzhou: ['📦 快递站·通州校区', '📪 快递柜·通州校区', '🍱 外卖柜·通州校区'],
};

export const CAMPUS_DELIVERY_LOCATIONS: Record<string, string[]> = {
  suzhou: ['🏫 修远楼', '🏫 开太楼', '🏠 文缘人才公寓2号楼', '🏠 文缘人才公寓1号楼', '🏠 静斋'],
  zhongguancun: ['🏫 中关村校区教学楼', '🏠 中关村校区宿舍楼'],
  tongzhou: ['🏫 通州校区教学楼', '🏠 通州校区宿舍楼'],
};

/** 结束时点后 24 小时内显示为「已过期」（灰显），超过 24 小时自动下架。 */
export const ERRAND_GRACE_HOURS = 24;

const errandSelect = `SELECT e.*, u.nickname AS publisher_nickname, u.avatar_url AS publisher_avatar FROM errands e JOIN users u ON u.id=e.user_id`;

const toTime = (value: unknown) => {
  const d = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

function parseArr(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(v => String(v)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((v: unknown) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function errandStatus(row: DbRow): string {
  if (row.completed_at) return '已完成';
  if (row.closed_at) return '已关闭';
  const now = Date.now();
  const startsAt = toTime(row.starts_at);
  const endsAt = toTime(row.ends_at);
  if (now < startsAt) return '未开始';
  if (now < endsAt) return '进行中';
  if (now < endsAt + ERRAND_GRACE_HOURS * 3600_000) return '已过期';
  return '已下架';
}

function mapErrand(row: DbRow) {
  const schoolId = String(row.school_id || '');
  const campusId = String(row.campus_id || '');
  const names = campusScopeNames(schoolId, campusId);
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    side: String(row.side),
    cargoType: String(row.cargo_type),
    title: String(row.title || ''),
    description: String(row.description || ''),
    priceMin: row.price_min == null ? null : Number(row.price_min),
    priceMax: row.price_max == null ? null : Number(row.price_max),
    pickupLocations: parseArr(row.pickup_locations),
    deliveryLocations: parseArr(row.delivery_locations),
    transportMethod: row.transport_method ? String(row.transport_method) : null,
    weightLimit: String(row.weight_limit || ''),
    transportTime: String(row.transport_time || ''),
    startsAt: dateIso(row.starts_at),
    endsAt: dateIso(row.ends_at),
    schoolId,
    campusId,
    ...names,
    status: errandStatus(row),
    createdAt: dateIso(row.created_at),
    publisher: { id: Number(row.user_id), nickname: String(row.publisher_nickname || ''), avatarUrl: String(row.publisher_avatar || '') },
  };
}

function errandScope(req: AuthedRequest) {
  if (req.user) return { schoolId: req.user.schoolId, campusId: req.user.campusId };
  const fallback = defaultCampusScope();
  const schoolId = cleanText(req.query.schoolId, 40) || fallback.schoolId;
  const campusId = cleanText(req.query.campusId, 40) || fallback.campusId;
  return campusBelongsToSchool(schoolId, campusId) ? { schoolId, campusId } : fallback;
}

function parseIso(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function strArr(value: unknown, maxCount: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => cleanText(v, maxLen)).filter(Boolean))].slice(0, maxCount);
}

function defaultTitle(side: string, cargoType: string): string {
  return side === 'supply' ? `${cargoType}代取` : `${cargoType}取件需求`;
}

type ErrandPayload = {
  side: string;
  cargoType: string;
  title: string;
  description: string;
  priceMin: number | null;
  priceMax: number | null;
  pickupLocations: string[];
  deliveryLocations: string[];
  transportMethod: string | null;
  weightLimit: string;
  transportTime: string;
  startsAt: Date;
  endsAt: Date;
};

function parseErrandPayload(body: Record<string, unknown>): { ok: true; value: ErrandPayload } | { ok: false; error: string } {
  const side = cleanText(body.side, 10);
  const cargoType = cleanText(body.cargoType, 10);
  const description = cleanText(body.description, 500);
  const title = cleanText(body.title, 80);
  const weightLimit = cleanText(body.weightLimit, 40);
  const transportTime = cleanText(body.transportTime, 40);
  const transportMethod = body.transportMethod ? cleanText(body.transportMethod, 10) : null;

  if (!(ERRAND_SIDES as readonly string[]).includes(side)) return { ok: false, error: '请选择发布身份（供给/需求）' };
  if (!(CARGO_TYPES as readonly string[]).includes(cargoType)) return { ok: false, error: '请选择货物类型' };
  if (transportMethod && !(TRANSPORT_METHODS as readonly string[]).includes(transportMethod)) return { ok: false, error: '运输方式无效' };

  const hasMin = body.priceMin !== undefined && body.priceMin !== null && body.priceMin !== '';
  const hasMax = body.priceMax !== undefined && body.priceMax !== null && body.priceMax !== '';
  const priceMin = hasMin ? validPrice(body.priceMin) : null;
  const priceMax = hasMax ? validPrice(body.priceMax) : null;
  if (hasMin && priceMin === null) return { ok: false, error: '价格下限无效' };
  if (hasMax && priceMax === null) return { ok: false, error: '价格上限无效' };
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) return { ok: false, error: '价格下限不能大于上限' };

  const pickupLocations = strArr(body.pickupLocations, 10, 120);
  const deliveryLocations = strArr(body.deliveryLocations, 10, 120);
  if (!pickupLocations.length) return { ok: false, error: '请至少选择一个取件地点' };
  if (!deliveryLocations.length) return { ok: false, error: '请至少选择一个收件地点' };

  const startsAt = parseIso(body.startsAt);
  const endsAt = parseIso(body.endsAt);
  if (startsAt === null || endsAt === null) return { ok: false, error: '请设置生效时间范围' };
  if (endsAt <= startsAt) return { ok: false, error: '结束时间必须晚于开始时间' };
  if (endsAt - Date.now() > 90 * 24 * 3600_000) return { ok: false, error: '结束时间不能超过 90 天' };

  return {
    ok: true,
    value: {
      side,
      cargoType,
      title: title || defaultTitle(side, cargoType),
      description,
      priceMin,
      priceMax,
      pickupLocations,
      deliveryLocations,
      transportMethod,
      weightLimit,
      transportTime,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    },
  };
}

errandsRouter.get('/locations', (req, res) => {
  const campusId = cleanText(req.query.campusId, 40) || defaultCampusScope().campusId;
  res.json({
    campusId,
    pickup: CAMPUS_PICKUP_LOCATIONS[campusId] || CAMPUS_PICKUP_LOCATIONS.suzhou,
    delivery: CAMPUS_DELIVERY_LOCATIONS[campusId] || CAMPUS_DELIVERY_LOCATIONS.suzhou,
    cargoTypes: CARGO_TYPES,
    transportMethods: TRANSPORT_METHODS,
    sides: ERRAND_SIDES,
  });
});

errandsRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const { schoolId, campusId } = errandScope(req);
  const side = cleanText(req.query.side, 10);
  const cargoType = cleanText(req.query.cargoType, 10);
  const mine = req.query.mine === '1' && Boolean(req.user);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
  const where: string[] = ['e.school_id=?', 'e.campus_id=?'];
  const args: unknown[] = [schoolId, campusId];
  if ((ERRAND_SIDES as readonly string[]).includes(side)) { where.push('e.side=?'); args.push(side); }
  if ((CARGO_TYPES as readonly string[]).includes(cargoType)) { where.push('e.cargo_type=?'); args.push(cargoType); }
  if (mine) {
    where.push('e.user_id=?');
    args.push(req.user!.id);
  } else {
    where.push(`(e.completed_at IS NOT NULL OR e.closed_at IS NOT NULL OR e.ends_at > DATE_SUB(NOW(), INTERVAL ${ERRAND_GRACE_HOURS} HOUR))`);
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await one(`SELECT COUNT(*) AS total FROM errands e ${filter}`, args);
  const total = Number(totalRow?.total || 0);
  const rows = await all(`${errandSelect} ${filter} ORDER BY e.created_at DESC, e.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, args);
  res.json({ errands: rows.map(mapErrand), total, page, pageSize, hasMore: page * pageSize < total });
});

errandsRouter.post('/', requireAuth, requireCampus, async (req: AuthedRequest, res: Response) => {
  const parsed = parseErrandPayload((req.body || {}) as Record<string, unknown>);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const d = parsed.value;
  const campusId = cleanText((req.body as Record<string, unknown>).campusId, 40) || req.user!.campusId;
  if (!campusBelongsToSchool(req.user!.schoolId, campusId)) return res.status(400).json({ error: '所选校区不属于当前学校' });
  const result = await run(
    `INSERT INTO errands (user_id,side,cargo_type,title,description,price_min,price_max,pickup_locations,delivery_locations,transport_method,weight_limit,transport_time,starts_at,ends_at,school_id,campus_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user!.id, d.side, d.cargoType, d.title, d.description, d.priceMin, d.priceMax, JSON.stringify(d.pickupLocations), JSON.stringify(d.deliveryLocations), d.transportMethod, d.weightLimit, d.transportTime, d.startsAt, d.endsAt, req.user!.schoolId, campusId],
  );
  res.status(201).json({ id: Number(result.insertId) });
});

errandsRouter.get('/:id', async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: '代取单不存在' });
  const row = await one(`${errandSelect} WHERE e.id=?`, [id]);
  if (!row) return res.status(404).json({ error: '代取单不存在' });
  const scope = errandScope(req);
  const viewable = canViewItemInScope({ ...scope, userId: req.user?.id }, { userId: Number(row.user_id), schoolId: String(row.school_id), campusId: String(row.campus_id) });
  if (!viewable) return res.status(404).json({ error: '该代取单不在你当前选择的校区' });
  const errand = mapErrand(row);
  if (req.user?.id !== Number(row.user_id) && errand.status !== '进行中' && errand.status !== '未开始') return res.status(404).json({ error: '该代取单当前不可接单' });
  res.json({ errand });
});

errandsRouter.patch('/:id', requireAuth, requireCampus, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = await one('SELECT * FROM errands WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '代取单不存在' });
  if (Number(existing.user_id) !== req.user!.id) return res.status(403).json({ error: '只能编辑自己发布的代取单' });
  const parsed = parseErrandPayload((req.body || {}) as Record<string, unknown>);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const d = parsed.value;
  const campusId = cleanText((req.body as Record<string, unknown>).campusId, 40) || String(existing.campus_id);
  if (!campusBelongsToSchool(String(existing.school_id), campusId)) return res.status(400).json({ error: '所选校区不属于当前学校' });
  await run(
    `UPDATE errands SET side=?,cargo_type=?,title=?,description=?,price_min=?,price_max=?,pickup_locations=?,delivery_locations=?,transport_method=?,weight_limit=?,transport_time=?,starts_at=?,ends_at=?,campus_id=? WHERE id=?`,
    [d.side, d.cargoType, d.title, d.description, d.priceMin, d.priceMax, JSON.stringify(d.pickupLocations), JSON.stringify(d.deliveryLocations), d.transportMethod, d.weightLimit, d.transportTime, d.startsAt, d.endsAt, campusId, id],
  );
  res.json({ ok: true });
});

errandsRouter.post('/:id/close', requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = await one('SELECT id,user_id,closed_at,completed_at FROM errands WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '代取单不存在' });
  if (Number(existing.user_id) !== req.user!.id) return res.status(403).json({ error: '只能操作自己发布的代取单' });
  if (existing.completed_at) return res.status(400).json({ error: '已完成的代取单不能关闭' });
  await run('UPDATE errands SET closed_at=CURRENT_TIMESTAMP WHERE id=?', [id]);
  res.json({ ok: true });
});

errandsRouter.post('/:id/complete', requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = await one('SELECT id,user_id,completed_at FROM errands WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '代取单不存在' });
  if (Number(existing.user_id) !== req.user!.id) return res.status(403).json({ error: '只能操作自己发布的代取单' });
  if (existing.completed_at) return res.status(400).json({ error: '该代取单已完成' });
  await run('UPDATE errands SET completed_at=CURRENT_TIMESTAMP WHERE id=?', [id]);
  res.json({ ok: true });
});

errandsRouter.delete('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = await one('SELECT id,user_id FROM errands WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: '代取单不存在' });
  if (Number(existing.user_id) !== req.user!.id) return res.status(403).json({ error: '只能删除自己发布的代取单' });
  await run('DELETE FROM errands WHERE id=?', [id]);
  res.json({ ok: true });
});
