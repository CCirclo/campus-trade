import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Coins, Eye, Package, Pencil, Plus, RefreshCw, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { api, post } from '../api';
import { formatTimestamp } from '../time';
import type { AdminContext, AdminUser, Item, School } from '../types';

const fallbackAvatar = 'https://api.dicebear.com/9.x/notionists/svg?seed=campus';
const pageSize = 20;

function authBadge(u: AdminUser): { text: string; cls: string; title: string } {
  if (u.campusVerified) return { text: u.adminVerified ? '手动认证' : '校园认证', cls: 'ok', title: u.adminVerified ? '管理员手动认证，可发布商品、评论与发消息' : '已通过受支持的校园邮箱验证，可发布商品、评论与发消息' };
  if (u.emailVerified) return { text: '邮箱已验证', cls: 'muted', title: '邮箱已验证，但非受支持校园邮箱 且未手动认证，暂不能发布' };
  return { text: '未认证', cls: 'muted', title: '未认证，暂不能发布商品、评论与发消息' };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState('');
  const [context, setContext] = useState<AdminContext | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; user: AdminUser } | null>(null);
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (keyword) params.set('q', keyword);
    if (role) params.set('role', role);
    if (schoolId) params.set('schoolId', schoolId);
    if (campusId) params.set('campusId', campusId);
    api<{ users: AdminUser[]; total: number }>(`/api/admin/users?${params}`)
      .then(d => { setUsers(d.users); setTotal(d.total); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page, keyword, role, schoolId, campusId]);
  useEffect(load, [load]);
  useEffect(() => { api<AdminContext>('/api/admin/context').then(setContext).catch(() => {}); }, []);

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`确定删除用户「${u.nickname}」（编号 ${u.username}）？该用户的商品、评论等数据会一并删除，且无法恢复。`)) return;
    try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); setEditor(null); load(); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
  };

  return <div className="admin-page">
    <div className="admin-page-title admin-title-row"><div><span className="eyebrow">USERS</span><h1>用户管理</h1><p>{campusId ? '当前筛选单个校区' : '默认显示全部可管理校区'} · 共 {total} 位用户。</p></div><button className="button primary" onClick={() => setEditor({ mode: 'create' })}><Plus />创建用户</button></div>
    <div className="admin-toolbar">
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setPage(1); setKeyword(q); }}><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索编号/邮箱/昵称" /><button>搜索</button></form>
      <div className="admin-filters">
        <button className={!role ? 'active' : ''} onClick={() => { setRole(''); setPage(1); }}>全部</button>
        <button className={role === 'user' ? 'active' : ''} onClick={() => { setRole('user'); setPage(1); }}>普通用户</button>
        <button className={role === 'admin' ? 'active' : ''} onClick={() => { setRole('admin'); setPage(1); }}>管理员</button>
        <label className="admin-campus-filter-label">校区<select value={campusId ? `${schoolId}:${campusId}` : ''} onChange={e => { const v = e.target.value; if (!v) { setSchoolId(''); setCampusId(''); } else { const [s, c] = v.split(':'); setSchoolId(s); setCampusId(c); } setPage(1); }}><option value="">全部校区</option>{context?.schools.map(s => <optgroup key={s.id} label={s.name}>{s.campuses.filter(c => c.active).map(c => <option key={c.id} value={`${s.id}:${c.id}`}>{c.name}</option>)}</optgroup>)}</select></label>
        <button className="admin-refresh" onClick={() => load()} title="刷新"><RefreshCw /></button>
      </div>
    </div>
    {error && <div className="form-error">{error}</div>}
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>用户</th><th>角色</th><th>认证</th><th>发布</th><th>注册时间</th><th>操作</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="admin-table-empty">加载中…</td></tr> :
            !users.length ? <tr><td colSpan={6} className="admin-table-empty">没有找到符合条件的用户</td></tr> :
            users.map(u => <tr key={u.id}>
              <td><div className="admin-cell-user"><img src={u.avatarUrl || fallbackAvatar} alt="" /><span><b>{u.nickname}</b><small>编号 {u.username}{u.email ? ` · ${u.email}` : ''}</small><small>{u.schoolName}</small></span></div></td>
              <td><span className={`admin-pill ${u.role === 'admin' ? 'admin' : 'user'}`}>{u.isSuperAdmin?'平台总管理员':u.isSchoolManager?'学校负责人':u.role === 'admin' ? '管理员' : '用户'}</span></td>
              <td><span className={`admin-pill ${authBadge(u).cls}`} title={authBadge(u).title}>{authBadge(u).text}</span>{u.selfOperated && <span className="admin-pill self">自营</span>}</td>
              <td>{u.itemCount}</td>
              <td className="admin-muted">{formatTimestamp(u.createdAt)}</td>
              <td><div className="admin-row-actions"><button className="admin-icon-btn" title="详情" onClick={() => setDetail(u)}><Eye /></button><button className="admin-icon-btn" title="编辑" onClick={() => setEditor({ mode: 'edit', user: u })}><Pencil /></button><button className="admin-icon-btn danger" title="删除" onClick={() => void remove(u)}><Trash2 /></button></div></td>
            </tr>)}
        </tbody>
      </table>
    </div>
    {totalPages > 1 && <div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft />上一页</button><span>{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight /></button></div>}
    {editor && <UserEditor key={editor.mode === 'edit' ? editor.user.id : 'new'} mode={editor.mode} user={editor.mode === 'edit' ? editor.user : undefined} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} onError={setError} />}
    {detail && <UserDetail user={detail} onClose={() => setDetail(null)} />}
  </div>;
}

type AdminWallet = { user: { id: number; email: string; nickname: string }; balances: { currency: string; balance: number }[]; entries: { id: number; currency: string; amount: number; balanceAfter: number; reason: string; operator: string; createdAt: string }[] };
type AdminOrder = { id: number; itemTitle: string; currency: string; amount: number; status: string; role: 'buyer' | 'seller'; buyer: { nickname: string }; seller: { nickname: string }; createdAt: string; completedAt: string | null };

const currencyName = (code: string) => code === 'lungmen' ? '原石' : code === 'originium' ? '创世结晶' : code;

function UserDetail({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    Promise.all([
      api<AdminWallet>(`/api/admin/users/${user.id}/wallet`),
      api<{ items: Item[] }>(`/api/admin/users/${user.id}/items`),
      api<{ orders: AdminOrder[] }>(`/api/admin/users/${user.id}/orders`),
    ]).then(([w, it, od]) => { if (alive) { setWallet(w); setItems(it.items); setOrders(od.orders); } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : '加载失败'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user.id]);

  return <div className="report-backdrop" onClick={onClose}>
    <div className="report-modal user-detail-modal" onClick={e => e.stopPropagation()}>
      <div className="report-head">
        <div><b>{user.nickname}</b><small>编号 {user.username}{user.email ? ` · ${user.email}` : ''} · {user.schoolName} · 发布 {user.itemCount} 件</small></div>
        <button type="button" onClick={onClose}><X /></button>
      </div>
      {loading ? <p className="admin-table-empty">加载中…</p> : error ? <p className="admin-table-empty">{error}</p> : <div className="user-detail-body">
        <section className="admin-section">
          <div className="admin-section-head"><Coins /><div><b>钱包</b><small>原石与创世结晶余额</small></div></div>
          <div className="admin-stat-grid">{wallet && wallet.balances.length ? wallet.balances.map(b => <div className="admin-stat-card" key={b.currency}><span className="admin-stat-icon"><Coins /></span><div><b>{b.balance}</b><small>{currencyName(b.currency)}</small></div></div>) : <div className="admin-stat-card"><span className="admin-stat-icon"><Coins /></span><div><b>0</b><small>暂无余额</small></div></div>}</div>
          {wallet && wallet.entries.length > 0 && <table className="admin-table"><thead><tr><th>时间</th><th>币种</th><th>金额</th><th>余额</th><th>原因</th><th>操作者</th></tr></thead><tbody>{wallet.entries.map(e => <tr key={e.id}><td className="admin-muted">{formatTimestamp(e.createdAt)}</td><td>{currencyName(e.currency)}</td><td>{e.amount>0?'+':''}{e.amount}</td><td>{e.balanceAfter}</td><td>{e.reason}</td><td>{e.operator}</td></tr>)}</tbody></table>}
        </section>
        <section className="admin-section">
          <div className="admin-section-head"><Package /><div><b>发布商品</b><small>共 {items.length} 件</small></div></div>
          {items.length ? <table className="admin-table"><thead><tr><th>商品</th><th>价格</th><th>校区</th><th>状态</th><th>发布时间</th></tr></thead><tbody>{items.map(it => <tr key={it.id}><td><b>{it.title}</b><small className="admin-muted" style={{display:'block'}}>{it.category} · {it.condition}</small></td><td>{it.currency === 'cny' ? '¥' + it.price : it.price + ' 原石'}</td><td>{it.campusName}</td><td>{it.status}</td><td className="admin-muted">{formatTimestamp(it.createdAt)}</td></tr>)}</tbody></table> : <p className="admin-table-empty">该用户还没有发布商品</p>}
        </section>
        <section className="admin-section">
          <div className="admin-section-head"><ShoppingBag /><div><b>交易订单</b><small>共 {orders.length} 笔</small></div></div>
          {orders.length ? <table className="admin-table"><thead><tr><th>方向</th><th>商品</th><th>金额</th><th>状态</th><th>时间</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td><span className="admin-pill">{o.role === 'buyer' ? '买入' : '卖出'}</span></td><td>{o.itemTitle || '—'}</td><td>{o.amount} {currencyName(o.currency)}</td><td>{o.status}</td><td className="admin-muted">{formatTimestamp(o.completedAt || o.createdAt)}</td></tr>)}</tbody></table> : <p className="admin-table-empty">该用户还没有交易订单</p>}
        </section>
      </div>}
    </div>
  </div>;
}

function UserEditor({ mode, user, onClose, onSaved, onError }: { mode: 'create' | 'edit'; user?: AdminUser; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [role, setRole] = useState<'user' | 'admin'>(user?.role || 'user');
  const [adminVerified, setAdminVerified] = useState(user?.adminVerified || false);
  const [campusManager,setCampusManager]=useState(user?.isCampusManager||false);
  const [selfOperated, setSelfOperated] = useState(user?.selfOperated || false);
  const [schools,setSchools]=useState<School[]>([]);
  const [isSuper,setIsSuper]=useState(false);
  const [schoolId,setSchoolId]=useState(user?.schoolId||'');
  const [campusId,setCampusId]=useState(user?.campusId||'');
  const [busy, setBusy] = useState(false);
  const emailNow = (mode === 'edit' && user ? user.email : email).trim().toLowerCase();
  const effective = adminVerified || schools.some(s=>s.emailDomains.some(d=>emailNow.endsWith(`@${d}`)));
  const selectedSchool=schools.find(s=>s.id===schoolId);
  useEffect(()=>{api<AdminContext>('/api/admin/context').then(d=>{const next=d.schools.map(s=>({id:s.id,name:s.name,emailDomains:s.emailDomains,campuses:s.campuses.filter(c=>c.active).map(c=>({id:c.id,name:c.name}))}));setSchools(next);setIsSuper(d.isSuperAdmin);setSchoolId(value=>value||next[0]?.id||'');setCampusId(value=>value||next[0]?.campuses[0]?.id||'')}).catch(()=>{})},[]);
  useEffect(()=>{if(selectedSchool&&!selectedSchool.campuses.some(c=>c.id===campusId))setCampusId(selectedSchool.campuses[0]?.id||'')},[schoolId,schools.length]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === 'create') await post('/api/admin/users', { email, password, nickname, role, adminVerified, selfOperated, schoolId,campusId });
      else {await api(`/api/admin/users/${user!.id}`, { method: 'PATCH', body: JSON.stringify({ nickname, role, adminVerified, selfOperated, schoolId,campusId }) });if(!isSuper&&user!.role==='user')await api(`/api/admin/users/${user!.id}/verification`,{method:'PATCH',body:JSON.stringify({adminVerified})});if(isSuper&&campusManager!==user!.isCampusManager)await api(`/api/admin/users/${user!.id}/campus-manager`,{method:'PUT',body:JSON.stringify({schoolId,campusId,enabled:campusManager})})}
      onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : '保存失败'); } finally { setBusy(false); }
  };
  return <div className="report-backdrop" onClick={onClose}><form className="report-modal" onSubmit={submit} onClick={e => e.stopPropagation()}>
    <div className="report-head"><div><b>{mode === 'create' ? '创建用户' : '编辑用户'}</b><small>{mode === 'create' ? '管理员直接创建账号，初始密码请自行告知对方。' : '修改昵称、角色与认证状态，保存后立即生效。'}</small></div><button type="button" onClick={onClose}><X /></button></div>
    <div className="admin-form-grid">
      {mode === 'create' && <>
        <label>邮箱地址（可选）<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com（不填则无邮箱）" /></label>
        <label>初始密码<input type="text" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="至少 8 位" /></label><div className="admin-cert-note ok">✓ 编号将随机自动生成；昵称留空时自动使用编号</div>
      </>}
      <label>昵称（可选）<input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={24} placeholder="留空则使用编号作为昵称" /></label>
      <label>学校<select value={schoolId} onChange={e=>setSchoolId(e.target.value)} required disabled={!isSuper&&Boolean(user)}>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>校区<select value={campusId} onChange={e=>setCampusId(e.target.value)} required>{selectedSchool?.campuses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {isSuper&&<label>角色<select value={role} onChange={e => setRole(e.target.value as 'user' | 'admin')}><option value="user">普通用户</option><option value="admin">管理员</option></select></label>}
      {(!user?.isSuperAdmin&&(isSuper||mode==='create'||user?.role==='user'))&&<label className="admin-check"><input type="checkbox" checked={adminVerified} onChange={e => setAdminVerified(e.target.checked)} /><span><b>管理员手动认证</b><small>校区管理员可认证自己负责校区的普通用户；勾选后可发布、评论和发送消息。</small></span></label>}
      {isSuper&&mode==='edit'&&!user?.isSuperAdmin&&<label className="admin-check"><input type="checkbox" checked={campusManager} onChange={e=>setCampusManager(e.target.checked)}/><span><b>设为所选校区负责人</b><small>无需再到学校管理设置；保存后自动获得该校区管理权限和手动认证。</small></span></label>}
      {isSuper&&<label className="admin-check"><input type="checkbox" checked={selfOperated} onChange={e => setSelfOperated(e.target.checked)} /><span><b>自营账号</b><small>勾选后该用户可发布“原石”计价的兑换商品。</small></span></label>}
      {effective && <div className="admin-cert-note ok">✓ 该用户将显示为<b>已认证</b>，可正常发布与交易</div>}
      {!effective && <div className="admin-cert-note warn">未认证：该邮箱不是受支持的校园邮箱，需勾选「管理员手动认证」后才会获得认证权限</div>}
    </div>
    <div className="report-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button></div>
  </form></div>;
}
