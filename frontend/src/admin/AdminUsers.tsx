import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { api, post } from '../api';
import { formatTimestamp } from '../time';
import type { AdminUser } from '../types';

const fallbackAvatar = 'https://api.dicebear.com/9.x/notionists/svg?seed=campus';
const pageSize = 20;

function authBadge(u: AdminUser): { text: string; cls: string; title: string } {
  if (u.campusVerified) return { text: u.adminVerified ? '手动认证' : '校园认证', cls: 'ok', title: u.adminVerified ? '管理员手动认证，可发布商品、评论与发消息' : '已通过 @ruc.edu.cn 邮箱验证，可发布商品、评论与发消息' };
  if (u.emailVerified) return { text: '邮箱已验证', cls: 'muted', title: '邮箱已验证，但非 @ruc.edu.cn 且未手动认证，暂不能发布' };
  return { text: '未认证', cls: 'muted', title: '未认证，暂不能发布商品、评论与发消息' };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ mode: 'create' } | { mode: 'edit'; user: AdminUser } | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (keyword) params.set('q', keyword);
    if (role) params.set('role', role);
    api<{ users: AdminUser[]; total: number }>(`/api/admin/users?${params}`)
      .then(d => { setUsers(d.users); setTotal(d.total); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page, keyword, role]);
  useEffect(load, [load]);

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`确定删除用户「${u.nickname}」（${u.email}）？该用户的商品、评论等数据会一并删除，且无法恢复。`)) return;
    try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); setEditor(null); load(); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
  };

  return <div className="admin-page">
    <div className="admin-page-title admin-title-row"><div><span className="eyebrow">USERS</span><h1>用户管理</h1><p>共 {total} 位用户，可创建、编辑或删除账号。</p></div><button className="button primary" onClick={() => setEditor({ mode: 'create' })}><Plus />创建用户</button></div>
    <div className="admin-toolbar">
      <form className="admin-search" onSubmit={e => { e.preventDefault(); setPage(1); setKeyword(q); }}><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索邮箱或昵称" /><button>搜索</button></form>
      <div className="admin-filters">
        <button className={!role ? 'active' : ''} onClick={() => { setRole(''); setPage(1); }}>全部</button>
        <button className={role === 'user' ? 'active' : ''} onClick={() => { setRole('user'); setPage(1); }}>普通用户</button>
        <button className={role === 'admin' ? 'active' : ''} onClick={() => { setRole('admin'); setPage(1); }}>管理员</button>
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
              <td><div className="admin-cell-user"><img src={u.avatarUrl || fallbackAvatar} alt="" /><span><b>{u.nickname}</b><small>{u.email}</small></span></div></td>
              <td><span className={`admin-pill ${u.role === 'admin' ? 'admin' : 'user'}`}>{u.role === 'admin' ? '管理员' : '用户'}</span></td>
              <td><span className={`admin-pill ${authBadge(u).cls}`} title={authBadge(u).title}>{authBadge(u).text}</span></td>
              <td>{u.itemCount}</td>
              <td className="admin-muted">{formatTimestamp(u.createdAt)}</td>
              <td><div className="admin-row-actions"><button className="admin-icon-btn" title="编辑" onClick={() => setEditor({ mode: 'edit', user: u })}><Pencil /></button><button className="admin-icon-btn danger" title="删除" onClick={() => void remove(u)}><Trash2 /></button></div></td>
            </tr>)}
        </tbody>
      </table>
    </div>
    {totalPages > 1 && <div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft />上一页</button><span>{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight /></button></div>}
    {editor && <UserEditor key={editor.mode === 'edit' ? editor.user.id : 'new'} mode={editor.mode} user={editor.mode === 'edit' ? editor.user : undefined} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} onError={setError} />}
  </div>;
}

function UserEditor({ mode, user, onClose, onSaved, onError }: { mode: 'create' | 'edit'; user?: AdminUser; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [role, setRole] = useState<'user' | 'admin'>(user?.role || 'user');
  const [adminVerified, setAdminVerified] = useState(user?.adminVerified || false);
  const [busy, setBusy] = useState(false);
  const emailNow = (mode === 'edit' && user ? user.email : email).trim().toLowerCase();
  const effective = adminVerified || emailNow.endsWith('@ruc.edu.cn');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === 'create') await post('/api/admin/users', { email, password, nickname, role, adminVerified });
      else await api(`/api/admin/users/${user!.id}`, { method: 'PATCH', body: JSON.stringify({ nickname, role, adminVerified }) });
      onSaved();
    } catch (e) { onError(e instanceof Error ? e.message : '保存失败'); } finally { setBusy(false); }
  };
  return <div className="report-backdrop" onClick={onClose}><form className="report-modal" onSubmit={submit} onClick={e => e.stopPropagation()}>
    <div className="report-head"><div><b>{mode === 'create' ? '创建用户' : '编辑用户'}</b><small>{mode === 'create' ? '管理员直接创建账号，初始密码请自行告知对方。' : '修改昵称、角色与认证状态，保存后立即生效。'}</small></div><button type="button" onClick={onClose}><X /></button></div>
    <div className="admin-form-grid">
      {mode === 'create' && <>
        <label>邮箱地址<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@example.com" /></label>
        <label>初始密码<input type="text" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="至少 8 位" /></label>
      </>}
      <label>昵称<input value={nickname} onChange={e => setNickname(e.target.value)} required minLength={2} maxLength={24} /></label>
      <label>角色<select value={role} onChange={e => setRole(e.target.value as 'user' | 'admin')}><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
      <label className="admin-check"><input type="checkbox" checked={adminVerified} onChange={e => setAdminVerified(e.target.checked)} /><span><b>管理员手动认证</b><small>勾选后该用户获得发布、评论、发消息等认证权限，可随时取消；@ruc.edu.cn 校园邮箱用户默认已认证。</small></span></label>
      {effective && <div className="admin-cert-note ok">✓ 该用户将显示为<b>已认证</b>，可正常发布与交易</div>}
      {!effective && <div className="admin-cert-note warn">未认证：该邮箱不是 @ruc.edu.cn 校园邮箱，需勾选「管理员手动认证」后才会获得认证权限</div>}
    </div>
    <div className="report-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button></div>
  </form></div>;
}
