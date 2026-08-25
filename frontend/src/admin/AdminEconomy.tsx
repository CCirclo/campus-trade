import { useEffect, useState } from 'react';
import { Coins, Package, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { api } from '../api';

type Buckets = { zero: number; b1_50: number; b51_100: number; b101_500: number; b500p: number };
type Holder = { nickname: string; email: string; campusName: string; balance: number };
type EconomyData = {
  users: { total: number; last24h: number };
  items: { total: number; last24h: number };
  orders: { total: number; done: number; doneAmount: number; last24h: number };
  balances: { currency: string; total: number }[];
  distribution: { lungmen: Buckets; originium: Buckets };
  topHolders: { lungmen: Holder[]; originium: Holder[] };
};

const bucketDefs: { key: keyof Buckets; label: string }[] = [
  { key: 'zero', label: '0' },
  { key: 'b1_50', label: '1–50' },
  { key: 'b51_100', label: '51–100' },
  { key: 'b101_500', label: '101–500' },
  { key: 'b500p', label: '>500' },
];

const fmt = (n: number) => n.toLocaleString('zh-CN');

function Distribution({ title, buckets }: { title: string; buckets: Buckets }) {
  const values = bucketDefs.map(b => buckets[b.key]);
  const max = Math.max(1, ...values);
  return <section className="admin-section">
    <div className="admin-section-head"><Coins /><div><b>{title}分布</b><small>按余额区间统计用户数</small></div></div>
    <div className="dist-list">{bucketDefs.map(b => <div className="dist-row" key={b.key}><span className="dist-label">{b.label}</span><span className="dist-bar-wrap"><i className="dist-bar" style={{ width: `${Math.round(buckets[b.key] / max * 100)}%` }} /></span><span className="dist-value">{buckets[b.key]}</span></div>)}</div>
  </section>;
}

function TopHolders({ title, holders }: { title: string; holders: Holder[] }) {
  return <section className="admin-section">
    <div className="admin-section-head"><TrendingUp /><div><b>{title}排行榜</b><small>持有量前 10 名</small></div></div>
    {holders.length ? <table className="admin-table"><thead><tr><th>用户</th><th>校区</th><th>持有</th></tr></thead><tbody>{holders.map((h, i) => <tr key={h.email}><td><b>{i + 1}. {h.nickname}</b><small className="admin-muted" style={{ display: 'block' }}>{h.email}</small></td><td>{h.campusName}</td><td>{fmt(h.balance)}</td></tr>)}</tbody></table> : <p className="admin-table-empty">暂无数据</p>}
  </section>;
}

export default function AdminEconomy() {
  const [data, setData] = useState<EconomyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api<EconomyData>('/api/admin/economy').then(setData).catch(e => setError(e instanceof Error ? e.message : '加载失败')).finally(() => setLoading(false)); }, []);
  const lungmen = data?.balances.find(b => b.currency === 'lungmen')?.total ?? 0;
  const originium = data?.balances.find(b => b.currency === 'originium')?.total ?? 0;
  const cards = [
    { label: '注册用户', value: data ? fmt(data.users.total) : '–', sub: data ? `近24h +${data.users.last24h}` : '', icon: Users, tone: 'blue' },
    { label: '发布商品', value: data ? fmt(data.items.total) : '–', sub: data ? `近24h +${data.items.last24h}` : '', icon: Package, tone: 'green' },
    { label: '交易订单', value: data ? fmt(data.orders.total) : '–', sub: data ? `近24h +${data.orders.last24h}` : '', icon: ShoppingBag, tone: 'amber' },
    { label: '成交额（已完成）', value: data ? fmt(data.orders.doneAmount) : '–', sub: data ? `${data.orders.done} 笔已完成` : '', icon: TrendingUp, tone: 'rose' },
    { label: '总原石', value: fmt(lungmen), sub: 'lungmen', icon: Coins, tone: 'blue' },
    { label: '总创世结晶', value: fmt(originium), sub: 'originium', icon: Coins, tone: 'green' },
  ];
  return <div className="admin-page">
    <div className="admin-page-title"><span className="eyebrow">ECONOMY</span><h1>经济监视</h1><p>你管辖范围内用户的代币总量、分布与交易概况。</p></div>
    {error && <div className="form-error">{error}</div>}
    {loading ? <p className="admin-table-empty">加载中…</p> : data ? <>
      <div className="admin-stat-grid">{cards.map(({ label, value, sub, icon: Icon, tone }) => <div className={`admin-stat-card ${tone}`} key={label}><span className="admin-stat-icon"><Icon /></span><div><b>{value}</b><small>{label}{sub ? ` · ${sub}` : ''}</small></div></div>)}</div>
      <div className="economy-grid">
        <Distribution title="原石" buckets={data.distribution.lungmen} />
        <Distribution title="创世结晶" buckets={data.distribution.originium} />
        <TopHolders title="原石" holders={data.topHolders.lungmen} />
        <TopHolders title="创世结晶" holders={data.topHolders.originium} />
      </div>
    </> : null}
  </div>;
}
