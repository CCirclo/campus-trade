import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, X } from 'lucide-react';
import { api } from '../api';
import { formatTimestamp } from '../time';
import type { Report } from '../types';

const statuses = ['待处理', '已处理', '已驳回'];
const pageSize = 20;

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    api<{ reports: Report[]; total: number }>(`/api/admin/reports?${params}`)
      .then(d => { setReports(d.reports); setTotal(d.total); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page, status]);
  useEffect(load, [load]);

  const handle = async (report: Report, next: string) => {
    try { await api(`/api/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : '处理失败'); }
  };

  return <div className="admin-page">
    <div className="admin-page-title"><span className="eyebrow">REPORTS</span><h1>举报处理</h1><p>共 {total} 条举报，优先处理待处理项。</p></div>
    <div className="admin-toolbar">
      <div className="admin-filters">
        <button className={!status ? 'active' : ''} onClick={() => { setStatus(''); setPage(1); }}>全部</button>
        {statuses.map(s => <button key={s} className={status === s ? 'active' : ''} onClick={() => { setStatus(s); setPage(1); }}>{s}</button>)}
        <button className="admin-refresh" onClick={() => load()} title="刷新"><RefreshCw /></button>
      </div>
    </div>
    {error && <div className="form-error">{error}</div>}
    <div className="admin-report-list">
      {loading ? <div className="admin-table-empty">加载中…</div> :
        !reports.length ? <div className="admin-table-empty">没有找到符合条件的举报</div> :
        reports.map(r => (
          <article className={`admin-report-card ${r.status === '待处理' ? 'pending' : ''}`} key={r.id}>
            <Link to={`/items/${r.item.id}`} className="admin-report-item" target="_blank" rel="noreferrer">
              <img src={r.item.image || ''} alt="" /><span><b>{r.item.title}</b><small>¥{r.item.price} · 当前状态：{r.item.status}</small></span><ExternalLink />
            </Link>
            <div className="admin-report-meta">
              <span className="admin-pill admin">{r.schoolName} · {r.campusName}</span>
              <span className="admin-pill muted">举报人：{r.reporter.nickname}（{r.reporter.email}）</span>
              <span className="admin-pill reason">{r.reason}</span>
              <span className="admin-pill ok">提交于 {formatTimestamp(r.createdAt)}</span>
            </div>
            {r.detail && <p className="admin-report-detail">{r.detail}</p>}
            <div className="admin-report-foot">
              <span className={`admin-pill ${r.status === '待处理' ? 'pending' : r.status === '已处理' ? 'ok' : 'muted'}`}>{r.status}{r.handlerNickname ? ` · 由 ${r.handlerNickname} 处理` : ''}</span>
              {r.status === '待处理' ? <div className="admin-row-actions">
                <button className="button secondary compact" onClick={() => void handle(r, '已驳回')}><X />驳回（不违规）</button>
                <button className="button primary compact" onClick={() => void handle(r, '已处理')}><Check />处理完成</button>
              </div> : <div className="admin-row-actions"><button className="button secondary compact" onClick={() => void handle(r, '待处理')}>重新打开</button></div>}
            </div>
          </article>
        ))}
    </div>
    {totalPages > 1 && <div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft />上一页</button><span>{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight /></button></div>}
  </div>;
}
