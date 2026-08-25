import { useEffect, useState, type FormEvent } from 'react';
import { Check, Coins, Search, Send, ShieldAlert } from 'lucide-react';
import { api } from '../api';
import type { RewardSettings } from '../types';

const walletCurrencies = [
  { code: 'lungmen', name: '原石' },
  { code: 'originium', name: '创世结晶' },
];

type UserWallet = {
  user: { id: number; email: string; nickname: string };
  balances: { currency: string; balance: number }[];
  entries: { id: number; currency: string; amount: number; balanceAfter: number; reason: string; operator: string; createdAt: string }[];
};

type RiskFlag = { id: number; userId: number; email: string; nickname: string; kind: string; detail: string; reviewed: boolean; createdAt: string };

const defaultSettings: RewardSettings = {
  signupEnabled: true,
  signupCampusOnly: false,
  signupBonus: { lungmen: 100, originium: 1 },
  publishReward: 100,
  purchaseReward: 100,
};

export default function AdminReward() {
  const [settings, setSettings] = useState<RewardSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [currency, setCurrency] = useState('lungmen');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);

  const [lookupEmail, setLookupEmail] = useState('');
  const [lookup, setLookup] = useState<UserWallet | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [riskFlags, setRiskFlags] = useState<RiskFlag[] | null>(null);

  useEffect(() => {
    setLoading(true); setError('');
    api<{ settings: RewardSettings }>('/api/admin/settings/reward')
      .then(d => setSettings(d.settings))
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api<{ flags: RiskFlag[] }>('/api/admin/risk-flags').then(d => setRiskFlags(d.flags)).catch(() => setRiskFlags(null));
  }, []);

  const markReviewed = async (id: number) => {
    try {
      await api(`/api/admin/risk-flags/${id}`, { method: 'PATCH', body: JSON.stringify({ reviewed: true }) });
      setRiskFlags(flags => flags ? flags.map(f => f.id === id ? { ...f, reviewed: true } : f) : flags);
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setMessage(''); setError('');
    try {
      const d = await api<{ settings: RewardSettings }>('/api/admin/settings/reward', { method: 'PUT', body: JSON.stringify(settings) });
      setSettings(d.settings); setMessage('奖励设置已保存');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); } finally { setSaving(false); }
  };

  const grant = async (e: FormEvent) => {
    e.preventDefault(); setGrantBusy(true); setMessage(''); setError('');
    try {
      const r = await api<{ balanceAfter: number }>('/api/admin/wallet/grant', { method: 'POST', body: JSON.stringify({ email, currency, amount: Number(amount), reason }) });
      setMessage(`已发放 ${amount} ${walletCurrencies.find(c => c.code === currency)?.name}，当前余额 ${r.balanceAfter}`);
      setAmount(''); setReason('');
    } catch (e) { setError(e instanceof Error ? e.message : '发放失败'); } finally { setGrantBusy(false); }
  };

  const doLookup = async (e: FormEvent) => {
    e.preventDefault(); setLookupBusy(true); setError(''); setLookup(null);
    try {
      const list = await api<{ users: { id: number; email: string }[] }>('/api/admin/users?q=' + encodeURIComponent(lookupEmail.trim()));
      const found = list.users.find(u => u.email.toLowerCase() === lookupEmail.trim().toLowerCase());
      if (!found) { setError('未找到该用户'); return; }
      setLookup(await api<UserWallet>('/api/admin/users/' + found.id + '/wallet'));
    } catch (e) { setError(e instanceof Error ? e.message : '查询失败'); } finally { setLookupBusy(false); }
  };

  return <div className="admin-page">
    <div className="admin-page-title"><span className="eyebrow">REWARD</span><h1>奖励机制设置</h1><p>配置注册奖励、发布/购买奖励，并手动发放原石 / 创世结晶。</p></div>
    {error && <div className="form-error">{error}</div>}
    {message && <div className="form-success">{message}</div>}
    {loading ? <p className="admin-table-empty">加载中…</p> : <>
      <form className="admin-section" onSubmit={save}>
        <div className="admin-section-head"><Coins /><div><b>注册奖励</b><small>新用户注册后自动发放</small></div></div>
        <div className="admin-form-grid">
          <label className="admin-check"><input type="checkbox" checked={settings.signupEnabled} onChange={e => setSettings(s => ({ ...s, signupEnabled: e.target.checked }))} /><span><b>启用注册奖励</b><small>关闭后新注册用户不再自动获得奖励</small></span></label>
          <label className="admin-check"><input type="checkbox" checked={settings.signupCampusOnly} onChange={e => setSettings(s => ({ ...s, signupCampusOnly: e.target.checked }))} /><span><b>仅校园认证用户</b><small>仅 @ruc.edu.cn 邮箱注册的用户获得奖励</small></span></label>
          <div className="admin-section-head"><Coins /><div><b>临时经济政策（当前生效）</b><small>分级递减 · 每日限次 · 前 100 名创世结晶</small></div></div>
          <div className="reward-policy-note">
            <p><b>注册 / 发布 / 完成购买</b>：按该类型活动的累计次数分级递减，每发生 200 次后减半（100 → 50 → 25 → …），单次低于 1 原石时停止。</p>
            <p><b>创世结晶</b>：仅注册时发放，且仅限前 100 个注册用户。</p>
            <p><b>每日限次</b>：同一账号每天仅前 3 次发布 / 购买计入奖励。</p>
          </div>
          <button className="button primary" disabled={saving}>{saving ? '保存中…' : '保存设置'}</button>
        </div>
      </form>

      <div className="admin-section">
        <div className="admin-section-head"><Send /><div><b>手动发放奖励</b><small>向指定用户发放原石 / 创世结晶</small></div></div>
        <form className="admin-form-grid" onSubmit={grant}>
          <label>用户邮箱<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@ruc.edu.cn" /></label>
          <div className="admin-form-grid two">
            <label>币种<select value={currency} onChange={e => setCurrency(e.target.value)}>{walletCurrencies.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label>数量<input type="number" min={1} max={1000000} value={amount} onChange={e => setAmount(e.target.value)} required placeholder="正整数" /></label>
          </div>
          <label>发放原因<input value={reason} onChange={e => setReason(e.target.value)} minLength={2} maxLength={200} required placeholder="例如：社区贡献奖励" /></label>
          <button className="button primary" disabled={grantBusy}>{grantBusy ? '发放中…' : '确认发放'}</button>
        </form>
      </div>

      <div className="admin-section">
        <div className="admin-section-head"><Search /><div><b>查询用户钱包</b><small>按邮箱查询余额与最近流水</small></div></div>
        <form className="admin-search" onSubmit={doLookup}><Search /><input value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} placeholder="输入用户邮箱" /><button disabled={lookupBusy}>{lookupBusy ? '查询中…' : '查询'}</button></form>
        {lookup && <div className="wallet-lookup-result">
          <p><b>{lookup.user.nickname}</b> <small>{lookup.user.email}</small></p>
          <div className="admin-stat-grid">{lookup.balances.length ? lookup.balances.map(b => <div className="admin-stat-card" key={b.currency}><span className="admin-stat-icon"><Coins /></span><div><b>{b.balance}</b><small>{walletCurrencies.find(c => c.code === b.currency)?.name || b.currency}</small></div></div>) : <div className="admin-stat-card"><span className="admin-stat-icon"><Coins /></span><div><b>0</b><small>暂无余额</small></div></div>}</div>
          {lookup.entries.length > 0 && <table className="admin-table"><thead><tr><th>时间</th><th>币种</th><th>金额</th><th>余额</th><th>原因</th><th>操作者</th></tr></thead><tbody>{lookup.entries.map(e => <tr key={e.id}><td className="admin-muted">{new Date(e.createdAt).toLocaleString()}</td><td>{walletCurrencies.find(c => c.code === e.currency)?.name || e.currency}</td><td>{e.amount>0?'+':''}{e.amount}</td><td>{e.balanceAfter}</td><td>{e.reason}</td><td>{e.operator}</td></tr>)}</tbody></table>}
        </div>}
      </div>

      <div className="admin-section">
        <div className="admin-section-head"><ShieldAlert /><div><b>风控异常</b><small>检测到的可疑批量发布等异常行为</small></div></div>
        {riskFlags === null ? <p className="admin-table-empty">仅平台总管理员可查看</p> :
          riskFlags.length === 0 ? <p className="admin-table-empty">暂无风控异常</p> :
          <table className="admin-table"><thead><tr><th>用户</th><th>类型</th><th>详情</th><th>时间</th><th>操作</th></tr></thead><tbody>{riskFlags.map(f => <tr key={f.id}><td><div><b>{f.nickname}</b><small className="admin-muted" style={{display:'block'}}>{f.email}</small></div></td><td>{f.kind}</td><td>{f.detail}</td><td className="admin-muted">{new Date(f.createdAt).toLocaleString()}</td><td>{f.reviewed ? <span className="admin-pill ok">已处理</span> : <button className="admin-icon-btn" title="标记已处理" onClick={() => markReviewed(f.id)}><Check /></button>}</td></tr>)}</tbody></table>}
      </div>
    </>}
  </div>;
}
