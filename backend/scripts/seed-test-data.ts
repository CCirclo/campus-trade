import 'dotenv/config';
import { all, initDatabase, one, pool, refreshSchoolCatalog, run } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { categories, conditions, easterEggs, kinds, regions } from '../server/security.js';

/**
 * 本地测试环境批量数据生成器（幂等，可重复运行）。
 *
 * 用法：
 *   npx tsx backend/scripts/seed-test-data.ts            # 首次生成
 *   npx tsx backend/scripts/seed-test-data.ts --force    # 清空种子数据后重新生成
 *
 * 图片绕过说明：
 *   头像与商品图片均使用 data:image/svg+xml 内联 SVG（彩色色块 + 文字/emoji 符号），
 *   不依赖任何真实照片，也无需访问外网图床。
 */

const SEED_MARKER = 'seed_test_data_v1';
const SEED_EMAIL_PREFIX = 'seedtest';

// 可调参数
const USER_COUNT = 50;
const ITEM_COUNT = 150;
const FAVORITE_COUNT = 60;
const COMMENT_COUNT = 40;
const SEED_PASSWORD = 'Seed@2026';

// 测试覆盖的校区（学校固定为 ruc）
const campusList = [
  { id: 'suzhou', name: '苏州校区' },
  { id: 'zhongguancun', name: '中关村校区' },
  { id: 'tongzhou', name: '通州校区' },
] as const;

// ---------- 可复现随机数 ----------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260826);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

// ---------- SVG 占位图（绕过真实照片） ----------
const encodeSvg = (inner: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${inner}</svg>`)}`;

const categoryVisual: Record<string, { bg: string; symbol: string }> = {
  教材: { bg: '#e3f2fd', symbol: '📚' },
  电子产品: { bg: '#e8eaf6', symbol: '💻' },
  生活用品: { bg: '#e8f5e9', symbol: '🛋️' },
  服饰: { bg: '#fce4ec', symbol: '👕' },
  运动器材: { bg: '#fff3e0', symbol: '⚽' },
  其他: { bg: '#f3e5f5', symbol: '📦' },
};

function itemImage(category: string): string {
  const visual = categoryVisual[category] ?? categoryVisual['其他'];
  return encodeSvg(
    `<rect width="400" height="300" fill="${visual.bg}"/><text x="200" y="150" font-size="120" text-anchor="middle" dominant-baseline="central">${visual.symbol}</text>`,
  );
}

const avatarPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'];
function avatarImage(nickname: string, index: number): string {
  const color = avatarPalette[index % avatarPalette.length];
  const ch = nickname.slice(0, 1);
  return encodeSvg(
    `<rect width="400" height="400" fill="${color}"/><text x="200" y="210" font-size="160" text-anchor="middle" dominant-baseline="central" fill="#ffffff">${ch}</text>`,
  );
}

// ---------- 名称/文案素材 ----------
const nicknames = [
  '林同学', '苏同学', '阿哲', '小北', '柚子', '木子', '小橙', '大熊', '阿凯', '柠檬',
  '桃子', '老周', '小方', '陈同学', '米粒', '球球', '阿树', '小鱼', '冬瓜', '阿May',
  '小夏', '鹿鹿', '芝士', '布丁', '阿远', '小航', '璐璐', '阿泽', '团团', '豆豆',
  '可乐', '橙子', '阿森', '小虎', '南南', '阿乐', '西西', '泡泡', '阿宇', '甜甜',
];
const titlePool: Record<string, string[]> = {
  教材: ['高等数学（第七版）上册', '线性代数', '大学英语精读', '数据结构与算法', '概率论与数理统计', '马克思主义基本原理', '大学物理', '微观经济学', 'C 语言程序设计', '离散数学'],
  电子产品: ['iPad Air 5 64G', '罗技 K380 蓝牙键盘', '索尼 WH-1000XM4 耳机', '小米护眼台灯', '机械键盘 87 键', 'AirPods Pro 二代', 'Switch 游戏机', '24 寸显示器', '蓝牙鼠标', '20000mAh 充电宝'],
  生活用品: ['桌面收纳盒', '暖光台灯', '保温杯', '床上四件套', '衣架 20 个', '宿舍小风扇', '加湿器', '雨伞', '洗衣液', '插线板'],
  服饰: ['优衣库卫衣 M 码', '羽绒服', '运动鞋 42 码', '帆布包', '围巾', '棒球帽', '牛仔裤 28', '衬衫', '毛衣', '冲锋衣'],
  运动器材: ['瑜伽垫', '哑铃 5kg', '篮球', '羽毛球拍', '跳绳', '滑板', '足球', '乒乓球拍', '健身手套', '拉力带'],
  其他: ['猫粮 5kg', '考研资料合集', '手办模型', '吉他', '自行车', '乐高积木', '蓝牙音箱', '相机三脚架', '手账本套装', '键盘手托'],
};
const descSuffix = ['宿舍自用，功能正常。', '九成新，可小刀。', '毕业出清，价格可谈。', '用过几次，保存完好。', '当面验货，满意再交易。'];
const commentPool = [
  '还在吗？', '可以再便宜点吗？', '成色看起来不错', '请问什么时候方便面交？', '已收藏，帮顶',
  '能留个联系方式吗？', '这个价格很划算', '诚心要，今天能取吗？', '细节图有吗？', '好物，顶一个',
];

// ---------- 主流程 ----------
async function main() {
  const force = process.argv.includes('--force');
  const marker = await one('SELECT setting_key FROM platform_settings WHERE setting_key=?', [SEED_MARKER]);
  if (marker && !force) {
    console.log('测试数据已存在，跳过生成。如需重新生成请加 --force。');
    await pool.end();
    return;
  }

  await initDatabase();

  // 确保三个校区存在于目录中（幂等），并刷新内存目录
  for (const campus of campusList) {
    await run('INSERT IGNORE INTO campuses (school_id,id,name) VALUES (?,?,?)', ['ruc', campus.id, campus.name]);
  }
  await refreshSchoolCatalog();

  // 清空旧的种子数据（外键级联删除商品/收藏/评论/钱包等）
  await run('DELETE FROM users WHERE email LIKE ?', [`${SEED_EMAIL_PREFIX}%@ruc.edu.cn`]);

  const passwordHash = await hashPassword(SEED_PASSWORD);

  // 1. 用户（按校区轮询分布）
  const userIds: number[] = [];
  const selfOperatedIds: number[] = [];
  const userIdToCampus = new Map<number, string>();
  for (let i = 0; i < USER_COUNT; i++) {
    const email = `${SEED_EMAIL_PREFIX}${String(i + 1).padStart(3, '0')}@ruc.edu.cn`;
    const nickname = i < nicknames.length ? nicknames[i] : `${pick(nicknames)}${i + 1}`;
    const selfOperated = i < 4 ? 1 : 0; // 前 4 个为自营账号，可发布原石计价商品
    const campus = campusList[i % campusList.length];
    const result = await run(
      `INSERT INTO users (email,password_hash,nickname,avatar_url,school_id,campus_id,verified,email_verified,admin_verified,self_operated,role)
       VALUES (?,?,?,?,'ruc',?,1,1,0,?,'user')`,
      [email, passwordHash, nickname, avatarImage(nickname, i), campus.id, selfOperated],
    );
    const id = Number(result.insertId);
    userIds.push(id);
    userIdToCampus.set(id, campus.id);
    if (selfOperated) selfOperatedIds.push(id);
  }

  // 2. 钱包（每个用户给一笔原石与创世结晶初始余额，便于测试购买/钱包页）
  for (const id of userIds) {
    const lungmen = randInt(20, 800);
    const originium = randInt(0, 30);
    await run('INSERT INTO wallets (user_id,currency,balance) VALUES (?,?,?)', [id, 'lungmen', lungmen]);
    await run('INSERT INTO wallets (user_id,currency,balance) VALUES (?,?,?)', [id, 'originium', originium]);
    await run(
      'INSERT INTO currency_ledger (user_id,currency,amount,balance_after,reason,operator) VALUES (?,?,?,?,?,?)',
      [id, 'lungmen', lungmen, lungmen, '测试环境初始奖励', '系统'],
    );
    if (originium > 0) {
      await run(
        'INSERT INTO currency_ledger (user_id,currency,amount,balance_after,reason,operator) VALUES (?,?,?,?,?,?)',
        [id, 'originium', originium, originium, '测试环境初始奖励', '系统'],
      );
    }
  }

  // 3. 商品
  const itemIds: number[] = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const category = pick(categories);
    const condition = pick(conditions);
    const title = pick(titlePool[category]);
    const kind = rand() < 0.15 ? '贴图' : '商品';
    const sellerId = pick(userIds);
    const sellerCampus = userIdToCampus.get(sellerId) ?? 'suzhou';
    const isLungmen = selfOperatedIds.includes(sellerId) && rand() < 0.4;
    let price: number;
    let currency = 'cny';
    let rmbPrice: number | null = null;
    if (isLungmen) {
      currency = 'lungmen';
      price = randInt(5, 500);
      rmbPrice = Math.round(price * (0.4 + rand() * 0.6) * 100) / 100;
    } else {
      price = kind === '贴图' ? randInt(1, 200) : Math.round(randInt(5, 200000) / 100) / 100;
    }
    const regionList = pick([['苏州区'], ['北京区'], ['苏州区', '北京区']]);
    const easterEgg = rand() < 0.1 ? pick(easterEggs) : null;
    const statusRoll = rand();
    const status = statusRoll < 0.72 ? '在售' : statusRoll < 0.87 ? '已售出' : '已下架';
    const description = `${condition}，${pick(descSuffix)}`;
    const images = [itemImage(category)];
    const result = await run(
      `INSERT INTO items (user_id,title,price,currency,rmb_price,images,regions,kind,easter_egg,category,item_condition,description,school_id,campus_id,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        sellerId, title, price, currency, rmbPrice,
        JSON.stringify(images), JSON.stringify(regionList), kind, easterEgg,
        category, condition, description, 'ruc', sellerCampus, status,
      ],
    );
    itemIds.push(Number(result.insertId));
  }

  // 4. 收藏（随机用户收藏他人商品）
  const favoriteSet = new Set<string>();
  for (let i = 0; i < FAVORITE_COUNT; i++) {
    const userId = pick(userIds);
    const itemId = pick(itemIds);
    const key = `${userId}:${itemId}`;
    if (favoriteSet.has(key)) continue;
    favoriteSet.add(key);
    const item = await one('SELECT user_id FROM items WHERE id=?', [itemId]);
    if (!item || Number(item.user_id) === userId) continue;
    await run('INSERT IGNORE INTO favorites (user_id,item_id) VALUES (?,?)', [userId, itemId]);
  }

  // 5. 评论（随机用户评论他人商品）
  for (let i = 0; i < COMMENT_COUNT; i++) {
    const userId = pick(userIds);
    const itemId = pick(itemIds);
    const item = await one('SELECT user_id FROM items WHERE id=?', [itemId]);
    if (!item || Number(item.user_id) === userId) continue;
    await run('INSERT INTO comments (item_id,user_id,content) VALUES (?,?,?)', [itemId, userId, pick(commentPool)]);
  }

  // 6. 写入标记
  await run('INSERT INTO platform_settings (setting_key,setting_value) VALUES (?,JSON_OBJECT("users",?,"items",?)) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [
    SEED_MARKER, USER_COUNT, ITEM_COUNT,
  ]);

  const statUsers = await one('SELECT COUNT(*) c FROM users');
  const statItems = await one('SELECT COUNT(*) c FROM items');
  const statFav = await one('SELECT COUNT(*) c FROM favorites');
  const statComments = await one('SELECT COUNT(*) c FROM comments');
  const campusRows = await all("SELECT campus_id, COUNT(*) c FROM users WHERE email LIKE ? GROUP BY campus_id ORDER BY campus_id", [`${SEED_EMAIL_PREFIX}%@ruc.edu.cn`]);
  const itemCampusRows = await all("SELECT campus_id, COUNT(*) c FROM items GROUP BY campus_id ORDER BY campus_id");
  console.log('测试数据生成完成：');
  console.log(`  用户总数：${Number(statUsers?.c || 0)}（其中自营 ${selfOperatedIds.length} 个）`);
  console.log(`  商品总数：${Number(statItems?.c || 0)}`);
  console.log(`  收藏总数：${Number(statFav?.c || 0)}`);
  console.log(`  评论总数：${Number(statComments?.c || 0)}`);
  console.log(`  校区用户分布：${campusRows.map(r => `${String(r.campus_id)}=${Number(r.c)}`).join('、')}`);
  console.log(`  校区商品分布：${itemCampusRows.map(r => `${String(r.campus_id)}=${Number(r.c)}`).join('、')}`);
  console.log(`  种子用户登录密码统一为：${SEED_PASSWORD}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('测试数据生成失败：', error);
  try { await pool.end(); } catch { /* ignore */ }
  process.exitCode = 1;
});
