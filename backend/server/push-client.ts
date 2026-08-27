import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:http2';

// 真实 APNs 送达：仅当 push.ts 判定配置齐备后才被惰性 import。
// 依赖 Apple team / APNs 凭据（.p8 key + key id + team id + topic），
// 其成功送达属于外部验收项；本模块提供 ES256 JWT 签名与 HTTP/2 请求实现。

type ApnsCredentials = { keyId: string; teamId: string; topic: string };

function buildJwt(authKey: string, { keyId, teamId }: ApnsCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId };
  const claims = { iss: teamId, iat: now };
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const sign = createSign('sha256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign({ key: authKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * 发送一条 APNs 推送。authKeyBase64 优先于 authKeyPath。
 * 返回布尔值；任何失败（密钥解析、网络、服务端拒绝）都只返回 false 并记录，不抛出。
 */
export async function sendApnsPush(
  authKeyPath: string | undefined,
  authKeyBase64: string | undefined,
  token: string,
  payload: unknown,
  creds: ApnsCredentials,
): Promise<boolean> {
  try {
    const authKey = authKeyBase64
      ? Buffer.from(authKeyBase64, 'base64').toString('utf8')
      : authKeyPath
        ? readFileSync(authKeyPath, 'utf8')
        : null;
    if (!authKey) return false;
    const jwt = buildJwt(authKey, creds);
    const body = JSON.stringify(payload);
    return await new Promise<boolean>((resolve) => {
      const client = connect('https://api.push.apple.com');
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        client.close();
        resolve(value);
      };
      client.once('error', (error) => {
        console.error('[push] apns connection failed:', error.message);
        finish(false);
      });
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token.trim()}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': creds.topic,
        'apns-push-type': 'alert',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      });
      req.once('response', (headers) => finish(Number(headers[':status']) === 200));
      req.once('error', (error) => {
        console.error('[push] apns request failed:', error.message);
        finish(false);
      });
      req.end(body);
    });
  } catch (error) {
    console.error('[push] unable to send apns push:', error instanceof Error ? error.message : error);
    return false;
  }
}
