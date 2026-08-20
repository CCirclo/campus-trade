import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { ArrowLeft, Flag, LayoutDashboard, LogOut, Package, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import type { AdminStats } from '../types';
import AdminUsers from './AdminUsers';
import AdminItems from './AdminItems';
import AdminReports from './AdminReports';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="admin-loading">正在校验管理员权限…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/admin')}`} replace />;
  if (user.role !== 'admin') {
    return <div className="admin-denied"><ShieldCheck /><h1>需要管理员权限</h1><p>当前账号没有访问管理后台的权限。请使用管理员账号登录后再试。</p><Link className="button primary" to="/">返回首页</Link></div>;
  }
  return children;
}

function AdminDashboard({ stats }: { stats: AdminStats | null }) {
  const cards = [
    { label: '注册用户', value: stats?.users ?? '–', to: '/admin/users', icon: Users, tone: 'blue' },
    { label: '全部商品', value: stats?.items ?? '–', to: '/admin/items', icon: Package, tone: 'green' },
    { label: '举报总数', value: stats?.reports ?? '–', to: '/admin/reports', icon: Flag, tone: 'amber' },
    { label: '待处理举报', value: stats?.reportsPending ?? '–', to: '/admin/reports', icon: ShieldCheck, tone: 'rose' },
  ];
  return <div className="admin-page">
    <div className="admin-page-title"><span className="eyebrow">OVERVIEW</span><h1>管理概览</h1><p>查看平台运行情况，快速进入各项管理。</p></div>
    <div className="admin-stat-grid">{cards.map(({ label, value, to, icon: Icon, tone }) => (
      <Link className={`admin-stat-card ${tone}`} to={to} key={label}><span className="admin-stat-icon"><Icon /></span><div><b>{value}</b><small>{label}</small></div><ArrowLeft className="admin-stat-arrow" /></Link>
    ))}</div>
    <div className="admin-tip"><ShieldCheck /><span><b>权限说明</b><small>管理后台仅对 role 为 admin 的账号开放。新管理员可通过环境变量 ADMIN_EMAILS 或运行 scripts/make-admin.ts 提升。</small></span></div>
  </div>;
}

export default function AdminApp() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => { void api<AdminStats>('/api/admin/stats').then(setStats).catch(() => {}); }, []);
  return <div className="admin-app">
    <header className="admin-header">
      <Link to="/admin" className="admin-brand"><span className="admin-brand-mark">管</span><span><b>校园闲置 · 管理后台</b><small>ADMIN CONSOLE</small></span></Link>
      <nav className="admin-nav" aria-label="管理后台导航">
        <NavLink to="/admin" end><LayoutDashboard />概览</NavLink>
        <NavLink to="/admin/users"><Users />用户</NavLink>
        <NavLink to="/admin/items"><Package />商品</NavLink>
        <NavLink to="/admin/reports"><Flag />举报{stats && stats.reportsPending > 0 && <i>{stats.reportsPending}</i>}</NavLink>
      </nav>
      <div className="admin-header-actions">
        <Link className="admin-back-link" to="/"><ArrowLeft />返回主站</Link>
        <span className="admin-user-chip">{user?.nickname}</span>
        <button className="admin-logout" onClick={() => void logout()} aria-label="退出登录"><LogOut /></button>
      </div>
    </header>
    <main className="admin-main">
      <Routes>
        <Route index element={<AdminDashboard stats={stats} />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="items" element={<AdminItems />} />
        <Route path="reports" element={<AdminReports />} />
      </Routes>
    </main>
  </div>;
}
