import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, ImagePlus, MessageCircle, Plus, Send, ShieldCheck, X } from 'lucide-react';
import { api, post } from './api';
import { useAuth } from './auth';
import type { TreeholeAuthor, TreeholeComment, TreeholePost } from './types';
import { formatTimestamp } from './time';
import './treehole.css';

const fallbackAvatar = 'https://api.dicebear.com/9.x/notionists/svg?seed=campus';
const avatar = (url?: string) => url || fallbackAvatar;
const REPORT_REASONS = ['违规内容', '骚扰攻击', '泄露隐私', '虚假信息', '其他'];
const MAX_IMAGES = 9;

function authorLabel(a: TreeholeAuthor): string {
  return a.anonymous ? (a.alias || '匿名') : (a.nickname || '同学');
}

function anonBadge(a: TreeholeAuthor): string {
  if (!a.anonymous) return '';
  if (a.alias === '楼主') return '楼';
  return a.alias ? a.alias.replace(/[^0-9]/g, '') : '匿';
}

function AuthorAvatar({ author, size }: { author: TreeholeAuthor; size?: 'sm' | 'lg' }) {
  if (author.anonymous) {
    return <span className={`th-avatar anon ${size || ''}`}>{anonBadge(author)}</span>;
  }
  return <img className={`th-avatar ${size || ''}`} src={avatar(author.avatarUrl)} alt="" />;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 2600);
    return () => clearTimeout(id);
  }, [onClose]);
  return <div className="toast" role="status">{message}</div>;
}

type CommentNode = TreeholeComment & { replies: CommentNode[] };

function TreeholeCard({ post }: { post: TreeholePost }) {
  return (
    <Link className="th-card" to={`/treehole/${post.id}`}>
      {post.images.length > 0 && (
        <div className="th-card-image">{post.images[0] && <img src={post.images[0]} alt="" loading="lazy" />}</div>
      )}
      <div className="th-card-body">
        <p className="th-card-content">{post.content || '（图片）'}</p>
        <div className="th-card-meta">
          <span className={`th-card-author ${post.author.anonymous ? 'anon' : ''}`}>
            <AuthorAvatar author={post.author} size="sm" />
            <b>{authorLabel(post.author)}</b>
            {post.author.isOP && <i>楼主</i>}
          </span>
          <span className="th-card-counts">
            <span><Heart />{post.likesCount}</span>
            <span><MessageCircle />{post.commentsCount}</span>
            <time dateTime={post.createdAt}>{formatTimestamp(post.createdAt)}</time>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function TreeholePage() {
  const { user, schools, defaultScope } = useAuth();
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState<TreeholePost[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const schoolId = user?.schoolId || schools.find(s => s.id === defaultScope?.schoolId)?.id || defaultScope?.schoolId || '';
  const campusId = user?.campusId || defaultScope?.campusId || '';

  useEffect(() => {
    setLoading(true);
    setError('');
    const q = new URLSearchParams({ schoolId, campusId, page: String(page), pageSize: '20' });
    api<{ posts: TreeholePost[]; total: number; hasMore: boolean }>(`/api/treehole/posts?${q}`)
      .then(d => { setPosts(d.posts); setTotal(d.total); setHasMore(d.hasMore); })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page, schoolId, campusId, attempt]);

  const gotoPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete('page'); else next.set('page', String(p));
    setParams(next);
  };

  return (
    <div className="market-container sub-page">
      <div className="page-title">
        <span className="eyebrow">TREE HOLE</span>
        <h1>校园树洞</h1>
        <p>说出你的心里话，实名或匿名都自由。尊重他人，友善交流。</p>
      </div>
      <div className="th-toolbar">
        <p className="th-count">共 {total} 条</p>
        <Link className="button primary" to="/treehole/new"><Plus />发一条树洞</Link>
      </div>
      {loading ? <div className="page-loading"><span /><p>正在加载树洞…</p></div> :
        error ? <div className="empty-state"><span className="empty-icon">!</span><h2>暂时没能加载</h2><p>{error}</p><button className="button secondary" onClick={() => setAttempt(a => a + 1)}>重新加载</button></div> :
        posts.length ? <div className="th-list">{posts.map(p => <TreeholeCard key={p.id} post={p} />)}</div> :
        <div className="empty-state"><span className="empty-icon"><MessageCircle /></span><h2>这里还很安静</h2><p>来发第一条树洞，开启这个校区的心声。</p><Link className="button primary" to="/treehole/new">发一条树洞</Link></div>}
      {!loading && !error && total > 0 && (
        <nav className="pagination" aria-label="分页导航">
          <button className="pagination-button" type="button" disabled={page <= 1} onClick={() => gotoPage(page - 1)}><ChevronLeft />上一页</button>
          <span className="pagination-info">第 {page} 页 · 共 {total} 条</span>
          <button className="pagination-button" type="button" disabled={!hasMore} onClick={() => gotoPage(page + 1)}>下一页<ChevronRight /></button>
        </nav>
      )}
    </div>
  );
}

export function TreeholeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [postData, setPostData] = useState<TreeholePost | null>(null);
  const [comments, setComments] = useState<TreeholeComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [replyTo, setReplyTo] = useState<TreeholeComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetail, setReportDetail] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    api<{ post: TreeholePost; comments: TreeholeComment[] }>(`/api/treehole/posts/${id}`)
      .then(d => { setPostData(d.post); setComments(d.comments); })
      .catch(e => setError(e instanceof Error ? e.message : '帖子不存在'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const mustLogin = () => { navigate(`/login?next=${encodeURIComponent(`/treehole/${id}`)}`); return false; };
  const mustCampus = () => { setToast('你不是校园认证用户，当前只能浏览。'); return false; };

  const toggleLike = async () => {
    if (!user) return mustLogin();
    if (!user.campusVerified) return mustCampus();
    try {
      const d = await post<{ liked: boolean; likesCount: number }>(`/api/treehole/posts/${id}/like`);
      setPostData(p => p ? { ...p, liked: d.liked, likesCount: d.likesCount } : p);
    } catch (e) { setToast(e instanceof Error ? e.message : '操作失败'); }
  };

  const sendComment = async () => {
    if (!user) return mustLogin();
    if (!user.campusVerified) return mustCampus();
    if (comment.trim().length < 2) return;
    setBusy(true);
    try {
      await post(`/api/treehole/posts/${id}/comments`, { content: comment, anonymous, parentId: replyTo ? replyTo.id : null });
      setComment('');
      setReplyTo(null);
      load();
    } catch (e) { setToast(e instanceof Error ? e.message : '评论失败'); }
    finally { setBusy(false); }
  };

  const deleteComment = async (commentId: number) => {
    if (!window.confirm('确定删除这条评论？')) return;
    try { await api(`/api/treehole/comments/${commentId}`, { method: 'DELETE' }); load(); }
    catch (e) { setToast(e instanceof Error ? e.message : '删除失败'); }
  };

  const deletePost = async () => {
    if (!window.confirm('确定删除这条树洞帖子？评论与点赞也会一并删除。')) return;
    try { await api(`/api/treehole/posts/${id}`, { method: 'DELETE' }); navigate('/treehole'); }
    catch (e) { setToast(e instanceof Error ? e.message : '删除失败'); }
  };

  const submitReport = async () => {
    if (!user) return mustLogin();
    setReportBusy(true);
    try {
      await post('/api/treehole/reports', { targetType: 'post', targetId: Number(id), reason: reportReason, detail: reportDetail });
      setReportOpen(false);
      setReportReason('');
      setReportDetail('');
      setToast('举报已提交，感谢你的反馈');
    } catch (e) { setToast(e instanceof Error ? e.message : '举报提交失败'); }
    finally { setReportBusy(false); }
  };

  if (loading) return <div className="page-loading"><span /><p>正在加载…</p></div>;
  if (error || !postData) return <div className="market-container sub-page"><div className="empty-state"><span className="empty-icon">!</span><h2>无法查看</h2><p>{error || '帖子不存在'}</p><Link className="button secondary" to="/treehole">返回树洞</Link></div></div>;

  const byId = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];
  for (const c of comments) byId.set(c.id, { ...c, replies: [] });
  for (const node of byId.values()) {
    const parent = node.parentId != null ? byId.get(node.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  const renderComment = (node: CommentNode): ReactNode => {
    const parent = node.parentId != null ? byId.get(node.parentId) : undefined;
    return (
      <div className="th-comment" key={node.id}>
        <AuthorAvatar author={node.author} size="sm" />
        <div className="th-comment-body">
          <p className="th-comment-head">
            <b className={node.author.anonymous ? 'anon' : ''}>{authorLabel(node.author)}</b>
            {node.author.isOP && <span className="th-op-badge">楼主</span>}
            {parent && <span className="th-reply-tag">回复 @{authorLabel(parent.author)}</span>}
            <time dateTime={node.createdAt}>{formatTimestamp(node.createdAt)}</time>
          </p>
          <div className="th-comment-content">{node.content}</div>
          <div className="th-comment-actions">
            {user && <button onClick={() => { setReplyTo(node); setAnonymous(false); }}>回复</button>}
            {node.mine && <button className="danger" onClick={() => void deleteComment(node.id)}>删除</button>}
          </div>
          {node.replies.length > 0 && <div className="th-replies">{node.replies.map(r => renderComment(r))}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="detail-container">
      <Link className="back-link" to="/treehole"><ArrowLeft />返回树洞</Link>
      <article className="th-detail">
        <div className="th-detail-head">
          <span className={`th-detail-author ${postData.author.anonymous ? 'anon' : ''}`}>
            <AuthorAvatar author={postData.author} size="lg" />
            <span><b>{authorLabel(postData.author)}</b><small>{postData.campusName} · {formatTimestamp(postData.createdAt)}</small></span>
          </span>
          <span className="th-detail-tools">
            {postData.mine && <button className="report-link" onClick={() => void deletePost()}>删除</button>}
            {!postData.mine && <button className="report-link" onClick={() => setReportOpen(true)}>举报</button>}
          </span>
        </div>
        <div className="th-detail-content">{postData.content}</div>
        {postData.images.length > 0 && (
          <div className="th-detail-images">
            {postData.images.map((src, n) => <img key={src} src={src} alt={`图片 ${n + 1}`} loading="lazy" />)}
          </div>
        )}
        <div className="th-detail-actions">
          <button className={`button secondary ${postData.liked ? 'liked' : ''}`} onClick={() => void toggleLike()}><Heart fill={postData.liked ? 'currentColor' : 'none'} />{postData.liked ? '已赞' : '点赞'} {postData.likesCount}</button>
          <span className="th-detail-count"><MessageCircle />{comments.length} 条评论</span>
        </div>
      </article>

      <section className="th-comments">
        <div className="comment-head">
          <div><span className="eyebrow">REPLIES</span><h2>评论 <small>{comments.length}</small></h2></div>
        </div>
        {user && !user.campusVerified ? (
          <div className="inline-campus-lock"><ShieldCheck /><span><b>你不是校园认证用户，不能评论</b><small>评论仅对校园认证账号开放。</small></span></div>
        ) : (
          <div className="th-composer">
            {replyTo && (
              <div className="th-reply-bar">
                <span>回复 @{authorLabel(replyTo.author)}</span>
                <button type="button" onClick={() => setReplyTo(null)}><X /></button>
              </div>
            )}
            <div className="th-anon-toggle">
              <span>身份</span>
              <button type="button" className={!anonymous ? 'active' : ''} onClick={() => setAnonymous(false)}>实名</button>
              <button type="button" className={anonymous ? 'active' : ''} onClick={() => setAnonymous(true)}>匿名</button>
            </div>
            <div className="comment-composer">
              <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={500} placeholder={replyTo ? `回复 ${authorLabel(replyTo.author)}…` : '写下你的想法，实名或匿名都可以'} />
              <button onClick={() => void sendComment()} disabled={busy || comment.trim().length < 2}><Send /></button>
            </div>
          </div>
        )}
        <div className="th-comment-list">
          {roots.length ? roots.map(root => renderComment(root)) : <p className="muted center">还没有评论，来抢沙发。</p>}
        </div>
      </section>

      {reportOpen && (
        <div className="report-backdrop" onClick={() => setReportOpen(false)}>
          <div className="report-modal" onClick={e => e.stopPropagation()}>
            <div className="report-head">
              <div><b>举报这条树洞</b><small>请选择原因并补充说明，我们会尽快核实处理。</small></div>
              <button onClick={() => setReportOpen(false)}><X /></button>
            </div>
            <div className="report-reasons">{REPORT_REASONS.map(r => <label key={r} className={reportReason === r ? 'active' : ''}><input type="radio" name="th-report-reason" value={r} checked={reportReason === r} onChange={() => setReportReason(r)} /><span>{r}</span></label>)}</div>
            <textarea value={reportDetail} onChange={e => setReportDetail(e.target.value)} maxLength={500} placeholder="补充说明（选填，方便核实）" />
            <div className="report-actions">
              <button className="button secondary" onClick={() => setReportOpen(false)}>取消</button>
              <button className="button primary" disabled={reportBusy || !reportReason} onClick={() => void submitReport()}>{reportBusy ? '提交中…' : '提交举报'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

export function TreeholeFormPage() {
  const { user, schools } = useAuth();
  const navigate = useNavigate();
  const currentSchool = schools.find(s => s.id === user?.schoolId);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [campusId, setCampusId] = useState(user?.campusId || '');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!campusId && user?.campusId) setCampusId(user.campusId); }, [user?.campusId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    try {
      const data = new FormData();
      Array.from(files).slice(0, MAX_IMAGES - images.length).forEach(f => data.append('images', f));
      const result = await api<{ urls: string[] }>('/api/uploads', { method: 'POST', body: data });
      setImages(prev => [...prev, ...result.urls].slice(0, MAX_IMAGES));
    } catch (e) { setError(e instanceof Error ? e.message : '上传失败'); }
    finally { setUploading(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !images.length) { setError('请填写文字或至少添加一张图片'); return; }
    setBusy(true);
    setError('');
    try {
      const d = await post<{ id: number }>('/api/treehole/posts', { content, images, anonymous, campusId });
      navigate(`/treehole/${d.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : '发布失败'); }
    finally { setBusy(false); }
  };

  return (
    <div className="form-page">
      <div className="page-title">
        <span className="eyebrow">TREE HOLE</span>
        <h1>发一条树洞</h1>
        <p>文字、图片都可以；实名或匿名，由你自己决定。</p>
      </div>
      <form className="publish-form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <section>
          <div className="field-heading"><b>发布范围</b><small>树洞内容仅同校区同学可见</small></div>
          <div className="two-fields">
            <label>学校（不可修改）<input value={currentSchool?.name || user?.schoolName || ''} readOnly aria-readonly="true" /></label>
            <label>校区 *<select value={campusId} onChange={e => setCampusId(e.target.value)} required>{currentSchool?.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <p className="th-scope-note">学校由你的校园邮箱确定，普通用户不可修改；帖子只展示给你所选校区的同学。</p>
        </section>
        <section>
          <div className="field-heading"><b>树洞内容</b><small>文字和/或图片，最多 {MAX_IMAGES} 张图片</small></div>
          <label>想说点什么<textarea value={content} onChange={e => setContent(e.target.value)} maxLength={1000} rows={6} placeholder="在这里写下你的心里话…" /><small>{content.length}/1000</small></label>
          <div className="upload-grid">
            {images.map((src, n) => (
              <div className="upload-preview" key={src}>
                <img src={src} alt={`图片 ${n + 1}`} />
                <button type="button" onClick={() => setImages(images.filter((_, i) => i !== n))}><X /></button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label className="upload-button">
                <ImagePlus /><span>{uploading ? '上传中…' : '添加图片'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={e => void upload(e.target.files)} disabled={uploading} />
              </label>
            )}
          </div>
        </section>
        <section>
          <div className="field-heading"><b>发布身份</b><small>匿名时显示为「楼主」，评论区匿名者按 匿名1号/2号 区分</small></div>
          <div className="th-anon-toggle">
            <button type="button" className={!anonymous ? 'active' : ''} onClick={() => setAnonymous(false)}>实名发布（展示昵称）</button>
            <button type="button" className={anonymous ? 'active' : ''} onClick={() => setAnonymous(true)}>匿名发布（显示楼主）</button>
          </div>
        </section>
        <button className="button primary wide submit-publish" disabled={busy}>{busy ? '发布中…' : '发布'}</button>
      </form>
      <div className="th-privacy-note"><ShieldCheck /><span><b>友善提醒</b><small>即使匿名，平台仍会记录真实账号用于必要的内容治理；请勿发布违法、攻击或泄露他人隐私的内容。</small></span></div>
    </div>
  );
}
