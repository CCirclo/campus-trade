import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Trash2, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatTimestamp } from '../time';
import type { AdminTreeholePost, AdminTreeholeReport } from '../types';
import '../treehole.css';

const pageSize = 20;
const statuses = ['待处理', '已处理', '已驳回'];

export default function AdminTreehole() {
  const [tab, setTab] = useState<'posts' | 'reports'>('posts');
  const [posts, setPosts] = useState<AdminTreeholePost[]>([]);
  const [reports, setReports] = useState<AdminTreeholeReport[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [reportTotal, setReportTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPosts = useCallback(() => {
    setLoading(true); setError('');
    api<{ posts: AdminTreeholePost[]; total: number }>(`/api/admin/treehole/posts?page=${page}`)
      .then(d => { setPosts(d.posts); setPostTotal(d.total); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page]);

  const loadReports = useCallback(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    api<{ reports: AdminTreeholeReport[]; total: number }>(`/api/admin/treehole/reports?${params}`)
      .then(d => { setReports(d.reports); setReportTotal(d.total); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(() => { if (tab === 'posts') loadPosts(); else loadReports(); }, [tab, loadPosts, loadReports]);

  const switchTab = (next: 'posts' | 'reports') => { setTab(next); setPage(1); setStatus(''); };

  const deletePost = async (p: AdminTreeholePost) => {
    if (!window.confirm('确定删除这条树洞帖子？评论与点赞会一并删除，且不可恢复。')) return;
    try { await api(`/api/admin/treehole/posts/${p.id}`, { method: 'DELETE' }); loadPosts(); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
  };

  const handleReport = async (r: AdminTreeholeReport, next: string) => {
    try { await api(`/api/admin/treehole/reports/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); loadReports(); }
    catch (e) { setError(e instanceof Error ? e.message : '处理失败'); }
  };

  return <div className="admin-page">
    <div className="admin-page-title"><span className="eyebrow">TREE HOLE</span><h1>树洞管理</h1><p>浏览与处置校园树洞内容；管理员可查看匿名内容的真实身份用于治理。</p></div>
    <div className="admin-toolbar">
      <div className="admin-filters">
        <button className={tab === 'posts' ? 'active' : ''} onClick={() => switchTab('posts')}>帖子</button>
        <button className={tab === 'reports' ? 'active' : ''} onClick={() => switchTab('reports')}>举报</button>
        {tab === 'reports' && statuses.map(s => <button key={s} className={status === s ? 'active' : ''} onClick={() => { setStatus(s); setPage(1); }}>{s}</button>)}
        <button className="admin-refresh" onClick={() => (tab === 'posts' ? loadPosts() : loadReports())} title="刷新"><RefreshCw /></button>
      </div>
    </div>
    {error && <div className="form-error">{error}</div>}

    {tab === 'posts' && (
      <div className="admin-report-list">
        <p className="admin-page-sub">共 {postTotal} 条树洞帖子</p>
        {loading ? <div className="admin-table-empty">加载中…</div> :
          !posts.length ? <div className="admin-table-empty">没有找到树洞帖子</div> :
          posts.map(p => (
            <article className="admin-report-card" key={p.id}>
              <div className="admin-report-meta">
                <span className={`admin-pill ${p.anonymous ? 'reason' : 'admin'}`}>{p.anonymous ? '匿名' : '实名'}</span>
                <span className="admin-pill muted">{p.schoolName} · {p.campusName}</span>
                <span className="admin-pill muted">真实作者：{p.author.nickname}（{p.author.email || '未绑定邮箱'}）</span>
                <span className="admin-pill ok">{p.likesCount} 赞 · {p.commentsCount} 评 · {formatTimestamp(p.createdAt)}</span>
              </div>
              <p className="admin-report-detail">{p.content || '（纯图片）'}</p>
              {p.images.length > 0 && <div className="admin-th-images">{p.images.map(src => <img key={src} src={src} alt="" />)}</div>}
              <div className="admin-report-foot">
                <Link className="button secondary compact" to={`/treehole/${p.id}`} target="_blank" rel="noreferrer"><ExternalLink />查看帖子</Link>
                <button className="button primary compact danger" onClick={() => void deletePost(p)}><Trash2 />删除帖子</button>
              </div>
            </article>
          ))}
      </div>
    )}

    {tab === 'reports' && (
      <div className="admin-report-list">
        <p className="admin-page-sub">共 {reportTotal} 条树洞举报</p>
        {loading ? <div className="admin-table-empty">加载中…</div> :
          !reports.length ? <div className="admin-table-empty">没有找到符合条件的举报</div> :
          reports.map(r => (
            <article className={`admin-report-card ${r.status === '待处理' ? 'pending' : ''}`} key={r.id}>
              <div className="admin-report-meta">
                <span className={`admin-pill ${r.targetType === 'post' ? 'admin' : 'reason'}`}>{r.targetType === 'post' ? '举报帖子' : '举报评论'}</span>
                <span className="admin-pill muted">{r.schoolName} · {r.campusName}</span>
                <span className="admin-pill muted">举报人：{r.reporter.nickname}（{r.reporter.email}）</span>
                <span className="admin-pill reason">{r.reason}</span>
                <span className="admin-pill ok">提交于 {formatTimestamp(r.createdAt)}</span>
              </div>
              <p className="admin-report-detail">{r.targetContent || '（图片内容，请打开帖子查看）'}</p>
              {r.detail && <p className="admin-report-detail muted">说明：{r.detail}</p>}
              <div className="admin-report-foot">
                <span className={`admin-pill ${r.status === '待处理' ? 'pending' : r.status === '已处理' ? 'ok' : 'muted'}`}>{r.status}{r.handlerNickname ? ` · 由 ${r.handlerNickname} 处理` : ''}</span>
                {r.status === '待处理' ? <div className="admin-row-actions">
                  <Link className="button secondary compact" to={`/treehole/${r.postId}`} target="_blank" rel="noreferrer"><ExternalLink />查看</Link>
                  <button className="button secondary compact" onClick={() => void handleReport(r, '已驳回')}><X />驳回（不违规）</button>
                  <button className="button primary compact" onClick={() => void handleReport(r, '已处理')}><Check />处理完成</button>
                </div> : <div className="admin-row-actions"><button className="button secondary compact" onClick={() => void handleReport(r, '待处理')}>重新打开</button></div>}
              </div>
            </article>
          ))}
      </div>
    )}

    {((tab === 'posts' && Math.ceil(postTotal / pageSize) > 1) || (tab === 'reports' && Math.ceil(reportTotal / pageSize) > 1)) && (
      <div className="admin-pagination">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft />上一页</button>
        <span>{page} / {Math.max(1, Math.ceil((tab === 'posts' ? postTotal : reportTotal) / pageSize))}</span>
        <button disabled={page >= Math.ceil((tab === 'posts' ? postTotal : reportTotal) / pageSize)} onClick={() => setPage(p => p + 1)}>下一页<ChevronRight /></button>
      </div>
    )}
  </div>;
}
