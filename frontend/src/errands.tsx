import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronRight, Clock, Edit3, HelpCircle, MapPin, MessageCircle, Package, Plus, ShieldCheck, Truck, X } from 'lucide-react';
import { api, post } from './api';
import { useAuth } from './auth';
import type { Errand, ErrandLocations, ErrandSide } from './types';
import './errands.css';

const fallbackAvatar = 'https://api.dicebear.com/9.x/notionists/svg?seed=campus';
const avatar = (url?: string) => url || fallbackAvatar;

const SIDES: { value: ErrandSide; label: string }[] = [
  { value: 'supply', label: '代取服务' },
  { value: 'demand', label: '取件需求' },
];
const CARGO_OPTIONS = ['快递', '外卖', '其他'];
const TRANSPORT_OPTIONS = ['步行', '自行车', '电瓶车', '摩托车'];
const TRANSPORT_SYMBOL: Record<string, string> = { '步行': '🚶', '自行车': '🚲', '电瓶车': '🛵', '摩托车': '🏍️' };
const transportLabel = (t: string) => `${TRANSPORT_SYMBOL[t] || ''} ${t}`;

const sideLabel = (s: string) => (s === 'supply' ? '代取服务' : '取件需求');

function priceRange(e: Errand): string {
  if (e.priceMin != null && e.priceMax != null) return e.priceMin === e.priceMax ? `¥${e.priceMin}` : `¥${e.priceMin} ~ ¥${e.priceMax}`;
  if (e.priceMin != null) return `¥${e.priceMin} 起`;
  if (e.priceMax != null) return `¥${e.priceMax} 以内`;
  return '价格面议';
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWindow(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '时间未知';
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const date = d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusTone(status: string): string {
  if (status === '进行中') return 'active';
  if (status === '未开始') return 'upcoming';
  if (status === '已过期' || status === '已关闭' || status === '已下架') return 'gray';
  if (status === '已完成') return 'done';
  return 'gray';
}

function ErrandCard({ errand, mine }: { errand: Errand; mine: boolean }) {
  const { user } = useAuth();
  const clickable = mine || user?.id === errand.userId || errand.status === '进行中' || errand.status === '未开始';
  const body = (
    <>
      <div className="errand-card-top">
        <span className={`errand-side ${errand.side}`}>{sideLabel(errand.side)}</span>
        <span className="errand-cargo">{errand.cargoType}</span>
        <span className={`errand-status ${statusTone(errand.status)}`}>{errand.status}</span>
      </div>
      <h3>{errand.title}</h3>
      {errand.description && <p className="errand-desc">{errand.description}</p>}
      <div className="errand-route">
        <span><small>取</small>{errand.pickupLocations.join('、')}</span>
        <ChevronRight className="route-arrow" />
        <span><small>送</small>{errand.deliveryLocations.join('、')}</span>
      </div>
      <div className="errand-meta">
        <b>{priceRange(errand)}</b>
        {errand.transportMethod && <span className="errand-transport">{transportLabel(errand.transportMethod)}</span>}
        <span className="errand-time"><Clock />{formatWindow(errand.startsAt)} 起 · {formatWindow(errand.endsAt)} 止</span>
      </div>
    </>
  );
  if (clickable) return <Link className={`errand-card ${errand.side}`} to={`/errands/${errand.id}`}>{body}</Link>;
  return <div className={`errand-card ${errand.side} disabled`}>{body}</div>;
}

export function ErrandsPage() {
  const { user, schools, defaultScope } = useAuth();
  const [params, setParams] = useSearchParams();
  const [errands, setErrands] = useState<Errand[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const side = params.get('side') || '';
  const cargoType = params.get('cargoType') || '';
  const mine = params.get('mine') === '1';
  const schoolId = user?.schoolId || schools.find(s => s.id === defaultScope?.schoolId)?.id || defaultScope?.schoolId || '';
  const campusId = user?.campusId || defaultScope?.campusId || '';

  useEffect(() => {
    setLoading(true);
    setError('');
    const q = new URLSearchParams({ schoolId, campusId });
    if (side) q.set('side', side);
    if (cargoType) q.set('cargoType', cargoType);
    if (mine) q.set('mine', '1');
    api<{ errands: Errand[]; total: number }>(`/api/errands?${q}`)
      .then(d => { setErrands(d.errands); setTotal(d.total); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [side, cargoType, mine, schoolId, campusId]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  return (
    <div className="market-container sub-page">
      <div className="page-title">
        <span className="eyebrow">CAMPUS ERRAND</span>
        <h1>{mine ? '我的代取' : '快递代取'}</h1>
        <p>{mine ? '管理你发布的代取服务与取件需求。' : '找人代取快递/外卖，或帮同学代取赚零花钱。'}</p>
      </div>
      <div className="errand-toolbar">
        <div className="errand-tabs">
          <button className={!side ? 'active' : ''} onClick={() => setFilter('side', '')}>全部</button>
          {SIDES.map(s => <button key={s.value} className={side === s.value ? 'active' : ''} onClick={() => setFilter('side', s.value)}>{s.label}</button>)}
        </div>
        <div className="errand-tabs cargo">
          <button className={!cargoType ? 'active' : ''} onClick={() => setFilter('cargoType', '')}>全部货物</button>
          {CARGO_OPTIONS.map(c => <button key={c} className={cargoType === c ? 'active' : ''} onClick={() => setFilter('cargoType', c)}>{c}</button>)}
        </div>
        {user && (mine ? <button className="button secondary" onClick={() => setFilter('mine', '')}>返回全部</button> : <button className="button secondary" onClick={() => setFilter('mine', '1')}>我的代取</button>)}
        {!mine && <Link className="button primary" to="/errands/new"><Plus />发布代取/需求</Link>}
      </div>
      <p className="errand-count">共 {total} 条</p>
      {loading ? <div className="page-loading"><span /><p>正在加载代取单…</p></div> :
        error ? <div className="empty-state"><span className="empty-icon">!</span><h2>暂时没能加载</h2><p>{error}</p></div> :
        errands.length ? <div className="errand-grid">{errands.map(e => <ErrandCard key={e.id} errand={e} mine={mine} />)}</div> :
        <div className="empty-state"><span className="empty-icon"><Package /></span><h2>暂无代取单</h2><p>{mine ? '你还没有发布过代取单。' : '当前校区还没有人发布，来发第一单吧。'}</p>{!mine && <Link className="button primary" to="/errands/new">发布代取/需求</Link>}</div>}
    </div>
  );
}

export function ErrandDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [errand, setErrand] = useState<Errand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    api<{ errand: Errand }>(`/api/errands/${id}`)
      .then(d => setErrand(d.errand))
      .catch(e => setError(e instanceof Error ? e.message : '代取单不存在'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const act = async (action: 'close' | 'complete' | 'delete') => {
    if (action === 'delete' && !window.confirm('确定删除这条代取单？')) return;
    if (action === 'complete' && !window.confirm('确认这条代取单已经完成？')) return;
    try {
      if (action === 'delete') { await api(`/api/errands/${id}`, { method: 'DELETE' }); navigate('/errands?mine=1'); return; }
      await post(`/api/errands/${id}/${action}`);
      setToast(action === 'complete' ? '已标记完成' : '已关闭');
      load();
    } catch (e) { setToast(e instanceof Error ? e.message : '操作失败'); }
  };

  const chat = async () => {
    try {
      const d = await post<{ id: number }>('/api/conversations', { errandId: Number(id) });
      navigate(`/messages/${d.id}`);
    } catch (e) { setToast(e instanceof Error ? e.message : '无法发起会话'); }
  };

  if (loading) return <div className="page-loading"><span /><p>正在加载…</p></div>;
  if (error || !errand) return <div className="market-container sub-page"><div className="empty-state"><span className="empty-icon">!</span><h2>无法查看</h2><p>{error || '代取单不存在'}</p><Link className="button secondary" to="/errands">返回代取列表</Link></div></div>;

  const mine = user?.id === errand.userId;
  return (
    <div className="detail-container">
      <Link className="back-link" to="/errands"><ArrowLeft />返回代取列表</Link>
      <div className="detail-layout">
        <section className="detail-summary errand-detail">
          <div className="errand-card-top">
            <span className={`errand-side ${errand.side}`}>{sideLabel(errand.side)}</span>
            <span className="errand-cargo">{errand.cargoType}</span>
            <span className={`errand-status ${statusTone(errand.status)}`}>{errand.status}</span>
          </div>
          <h1>{errand.title}</h1>
          <div className="errand-detail-price">{priceRange(errand)}</div>
          <div className="errand-detail-time"><Clock />{formatWindow(errand.startsAt)} 至 {formatWindow(errand.endsAt)}</div>
          {errand.description && <p className="description-text">{errand.description}</p>}
          <div className="spec-grid">
            <span><small>取件地点</small><b>{errand.pickupLocations.join('、')}</b></span>
            <span><small>收件地点</small><b>{errand.deliveryLocations.join('、')}</b></span>
            {errand.transportMethod && <span><small>运输方式</small><b>{transportLabel(errand.transportMethod)}</b></span>}
            {errand.weightLimit && <span><small>载重上限</small><b>{errand.weightLimit}</b></span>}
            {errand.transportTime && <span><small>参考时间</small><b>{errand.transportTime}</b></span>}
          </div>
          <Link className="seller-box" to={`/users/${errand.userId}`}>
            <img src={avatar(errand.publisher.avatarUrl)} alt="" />
            <span><b>{errand.publisher.nickname}</b><small>{errand.schoolName} · {errand.campusName} · 查看主页</small></span>
            <ChevronRight />
          </Link>
          {mine ? (
            <div className="detail-actions">
              <Link className="button secondary" to={`/errands/${errand.id}/edit`}><Edit3 />编辑</Link>
              {errand.status !== '已完成' && errand.status !== '已关闭' && <button className="button secondary" onClick={() => void act('complete')}><CheckCircle2 />标记完成</button>}
              {errand.status !== '已完成' && errand.status !== '已关闭' && <button className="button secondary" onClick={() => void act('close')}><X />关闭</button>}
              <button className="report-link" onClick={() => void act('delete')}>删除</button>
            </div>
          ) : (
            <div className="detail-actions">
              <button className="button primary wide" onClick={() => void chat()}><MessageCircle />联系 TA</button>
              <Link className="button secondary" to={`/users/${errand.userId}`}>查看发布者主页</Link>
            </div>
          )}
        </section>
        <aside className="safety-card">
          <ShieldCheck />
          <h3>线下自行协商与交付</h3>
          <p>本平台只提供信息与展示，不参与资金交易。请线下当面协商价格并完成交接。</p>
          <Link to="/errands/help">查看代取说明 <ChevronRight /></Link>
        </aside>
      </div>
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

type ErrandFormState = {
  side: ErrandSide;
  cargoType: string;
  title: string;
  description: string;
  priceMin: string;
  priceMax: string;
  pickupLocations: string[];
  deliveryLocations: string[];
  transportMethod: string;
  weightLimit: string;
  transportTime: string;
  startsAt: string;
  endsAt: string;
  campusId: string;
};

export function ErrandFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, schools } = useAuth();
  const editing = Boolean(id);
  const currentSchool = schools.find(s => s.id === user?.schoolId);

  const [locations, setLocations] = useState<ErrandLocations | null>(null);
  const [customPickup, setCustomPickup] = useState('');
  const [customDelivery, setCustomDelivery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const startDefault = new Date(Math.ceil(now.getTime() / 600000) * 600000);
  const endDefault = new Date(startDefault.getTime() + 2 * 3600_000);
  const [form, setForm] = useState<ErrandFormState>({
    side: 'supply',
    cargoType: '快递',
    title: '',
    description: '',
    priceMin: '',
    priceMax: '',
    pickupLocations: [],
    deliveryLocations: [],
    transportMethod: '步行',
    weightLimit: '',
    transportTime: '',
    startsAt: toLocalInput(startDefault),
    endsAt: toLocalInput(endDefault),
    campusId: user?.campusId || '',
  });

  useEffect(() => {
    setLocations(null);
    api<ErrandLocations>(`/api/errands/locations?campusId=${form.campusId || ''}`).then(setLocations).catch(() => {});
  }, [form.campusId]);

  useEffect(() => {
    if (!form.campusId && user?.campusId) setForm(f => ({ ...f, campusId: user.campusId }));
  }, [user?.campusId]);

  useEffect(() => {
    if (editing) {
      api<{ errand: Errand }>(`/api/errands/${id}`).then(({ errand }) => {
        setForm({
          side: errand.side,
          cargoType: errand.cargoType,
          title: errand.title,
          description: errand.description,
          priceMin: errand.priceMin != null ? String(errand.priceMin) : '',
          priceMax: errand.priceMax != null ? String(errand.priceMax) : '',
          pickupLocations: errand.pickupLocations,
          deliveryLocations: errand.deliveryLocations,
          transportMethod: errand.transportMethod || '步行',
          weightLimit: errand.weightLimit,
          transportTime: errand.transportTime,
          startsAt: toLocalInput(new Date(errand.startsAt)),
          endsAt: toLocalInput(new Date(errand.endsAt)),
          campusId: errand.campusId,
        });
      }).catch(e => setError(e instanceof Error ? e.message : '加载失败'));
    }
  }, [id, editing]);

  const set = <K extends keyof ErrandFormState>(key: K, value: ErrandFormState[K]) => setForm(f => ({ ...f, [key]: value }));
  const toggle = (key: 'pickupLocations' | 'deliveryLocations', value: string) =>
    setForm(f => ({ ...f, [key]: f[key].includes(value) ? f[key].filter(v => v !== value) : [...f[key], value] }));
  const addCustom = (key: 'pickupLocations' | 'deliveryLocations') => {
    const text = key === 'pickupLocations' ? customPickup.trim() : customDelivery.trim();
    if (!text) return;
    if (!form[key].includes(text)) set(key, [...form[key], text]);
    key === 'pickupLocations' ? setCustomPickup('') : setCustomDelivery('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      side: form.side,
      cargoType: form.cargoType,
      title: form.title,
      description: form.description,
      priceMin: form.priceMin === '' ? null : form.priceMin,
      priceMax: form.priceMax === '' ? null : form.priceMax,
      pickupLocations: form.pickupLocations,
      deliveryLocations: form.deliveryLocations,
      transportMethod: form.side === 'supply' ? form.transportMethod : null,
      weightLimit: form.weightLimit,
      transportTime: form.transportTime,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      campusId: form.campusId,
    };
    try {
      if (editing) {
        await api(`/api/errands/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        navigate(`/errands/${id}`);
      } else {
        const d = await post<{ id: number }>('/api/errands', payload);
        navigate(`/errands/${d.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发布失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-page">
      <div className="page-title">
        <span className="eyebrow">CAMPUS ERRAND</span>
        <h1>{editing ? '编辑代取单' : '发布代取/需求'}</h1>
        <p>供给与需求同列展示，用颜色区分；发布后设好时限，超时自动灰显与下架。</p>
      </div>
      <form className="publish-form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <section>
          <div className="field-heading"><b>发布身份</b><small>代取服务 = 我帮别人取；取件需求 = 我需要别人帮我取</small></div>
          <div className="errand-side-picker">
            {SIDES.map(s => (
              <button type="button" key={s.value} className={`${s.value} ${form.side === s.value ? 'active' : ''}`} onClick={() => set('side', s.value)}>
                {s.value === 'supply' ? <Truck /> : <Package />}<span>{s.label}</span>
              </button>
            ))}
          </div>
          <div className="two-fields">
            <label>货物类型 *<select value={form.cargoType} onChange={e => set('cargoType', e.target.value)} required>{CARGO_OPTIONS.map(c => <option key={c}>{c}</option>)}</select></label>
            <label>发布校区 *<select value={form.campusId} onChange={e => set('campusId', e.target.value)} required>{currentSchool?.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <label>标题（可选）<input value={form.title} onChange={e => set('title', e.target.value)} maxLength={80} placeholder="不填将自动生成，如「快递代取」" /></label>
          <label>补充说明（可选）<textarea value={form.description} onChange={e => set('description', e.target.value)} maxLength={500} placeholder="货物信息、时间安排等补充说明" /></label>
        </section>
        <section>
          <div className="field-heading"><b>价格</b><small>可只填范围或留空（面议）</small></div>
          <div className="two-fields">
            <label>最低价（元）<input inputMode="decimal" value={form.priceMin} onChange={e => set('priceMin', e.target.value)} placeholder="如 3" /></label>
            <label>最高价（元）<input inputMode="decimal" value={form.priceMax} onChange={e => set('priceMax', e.target.value)} placeholder="如 5" /></label>
          </div>
        </section>
        <section>
          <div className="field-heading"><b>取件地点 *</b><small>多选；可自定义</small></div>
          {locations && <div className="location-options">{locations.pickup.map(loc => (
            <button type="button" key={loc} className={form.pickupLocations.includes(loc) ? 'active' : ''} onClick={() => toggle('pickupLocations', loc)}>{loc}</button>
          ))}</div>}
          <div className="custom-location">
            <input value={customPickup} onChange={e => setCustomPickup(e.target.value)} maxLength={120} placeholder="自定义取件地点" />
            <button type="button" className="button secondary compact" onClick={() => addCustom('pickupLocations')}>添加</button>
          </div>
          <div className="chip-row">{form.pickupLocations.map(loc => <span key={loc} className="loc-chip">{loc}<button type="button" onClick={() => toggle('pickupLocations', loc)}><X /></button></span>)}</div>
        </section>
        <section>
          <div className="field-heading"><b>收件地点 *</b><small>多选；可自定义</small></div>
          {locations && <div className="location-options">{locations.delivery.map(loc => (
            <button type="button" key={loc} className={form.deliveryLocations.includes(loc) ? 'active' : ''} onClick={() => toggle('deliveryLocations', loc)}>{loc}</button>
          ))}</div>}
          <div className="custom-location">
            <input value={customDelivery} onChange={e => setCustomDelivery(e.target.value)} maxLength={120} placeholder="自定义收件地点" />
            <button type="button" className="button secondary compact" onClick={() => addCustom('deliveryLocations')}>添加</button>
          </div>
          <div className="chip-row">{form.deliveryLocations.map(loc => <span key={loc} className="loc-chip">{loc}<button type="button" onClick={() => toggle('deliveryLocations', loc)}><X /></button></span>)}</div>
          <p className="errand-help-link"><HelpCircle />地点说明与安全提示 <Link to="/errands/help">查看说明</Link></p>
        </section>
        {form.side === 'supply' && (
          <section>
            <div className="field-heading"><b>运输信息</b><small>供给方可选填</small></div>
            <label>运输方式<select value={form.transportMethod} onChange={e => set('transportMethod', e.target.value)}>{TRANSPORT_OPTIONS.map(t => <option key={t} value={t}>{transportLabel(t)}</option>)}</select></label>
            <div className="two-fields">
              <label>载重上限（可选）<input value={form.weightLimit} onChange={e => set('weightLimit', e.target.value)} maxLength={40} placeholder="如 10kg" /></label>
              <label>参考运输时间（可选）<input value={form.transportTime} onChange={e => set('transportTime', e.target.value)} maxLength={40} placeholder="如 15 分钟" /></label>
            </div>
          </section>
        )}
        <section>
          <div className="field-heading"><b>生效时限 *</b><small>超过结束时间会灰显，再超过 24 小时自动下架</small></div>
          <div className="two-fields">
            <label>开始时间 *<input type="datetime-local" value={form.startsAt} onChange={e => set('startsAt', e.target.value)} required /></label>
            <label>结束时间 *<input type="datetime-local" value={form.endsAt} onChange={e => set('endsAt', e.target.value)} required /></label>
          </div>
        </section>
        <button className="button primary wide submit-publish" disabled={busy}>{busy ? '提交中…' : editing ? '保存修改' : '发布'}</button>
      </form>
    </div>
  );
}

export function ErrandHelpPage() {
  return (
    <div className="safety-page">
      <div className="safety-intro">
        <Package />
        <span className="eyebrow light">CAMPUS ERRAND</span>
        <h1>快递代取说明</h1>
        <p>找人代取，或帮同学代取。平台只提供信息与展示，不参与资金交易。</p>
      </div>
      <div className="safety-list">
        <article><b>01</b><div><h2>如何看懂地点符号</h2><p>📦 快递站 · 📪 快递柜 · 🍱 外卖柜；收件地点为 🏫 教学楼、🏠 公寓楼等。地点旁的问号会跳转到本页。</p></div></article>
        <article><b>02</b><div><h2>供给方（代取服务）</h2><p>发布你能代取的服务，设置取件/收件地点、运输方式、载重上限与参考时间，并给出价格范围。</p></div></article>
        <article><b>03</b><div><h2>需求方（取件需求）</h2><p>发布你需要代取的货物，说明货物类型与送达地点，等同学联系你协商。</p></div></article>
        <article><b>04</b><div><h2>线下交付，注意安全</h2><p>建议当面交接、当面确认，不提前转账、不点陌生链接。完成后由发布者标记完成。</p></div></article>
      </div>
      <Link className="button primary" to="/errands">返回代取列表</Link>
    </div>
  );
}
