export class ApiError extends Error { constructor(message:string, public status:number){ super(message); } }
const basePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');

export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
  const requestPath = path.startsWith('/api/') ? `${basePath}${path}` : path;
  const response = await fetch(requestPath, { ...options, headers, credentials:'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || '请求失败，请稍后重试', response.status);
  return data as T;
}

export const post = <T>(path:string, body?:unknown) => api<T>(path,{method:'POST',body:body === undefined ? undefined : JSON.stringify(body)});
