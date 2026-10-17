// One-time Lithic setup: points Auth Stream Access at this API and prints the HMAC secret for .env.
//   LITHIC_API_KEY=... pnpm lithic:setup https://femate-api.usm0n.uz/api/v1/lithic/asa
const apiKey = process.env.LITHIC_API_KEY;
const env = process.env.LITHIC_ENV === 'production' ? 'production' : 'sandbox';
const url = process.argv[2];
if (!apiKey || !url) {
  console.error('Usage: LITHIC_API_KEY=... pnpm lithic:setup <public ASA url, ending in /api/v1/lithic/asa>');
  process.exit(1);
}
const base = env === 'production' ? 'https://api.lithic.com' : 'https://sandbox.lithic.com';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: apiKey!, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const enrolled = await call<{ enrolled?: boolean }>('POST', '/v1/responder_endpoints', { type: 'AUTH_STREAM_ACCESS', url });
console.log(`ASA endpoint (${env}): ${enrolled.enrolled ? 'enrolled' : 'not confirmed'} -> ${url}`);
// The secret can take a few minutes to appear after enrolling.
try {
  const { secret } = await call<{ secret?: string }>('GET', '/v1/auth_stream/secret');
  if (secret) console.log(`Add to .env:\nLITHIC_ASA_SECRET=${secret}`);
  else console.log('No ASA secret yet; run this again in a few minutes.');
} catch (err) {
  console.log(`No ASA secret yet (${(err as Error).message}); run this again in a few minutes.`);
}
