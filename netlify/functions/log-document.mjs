import { getStore } from '@netlify/blobs';

// Only these values are ever recorded. Anything else becomes 'unknown'/'none',
// so a malformed or hostile post cannot write arbitrary strings into the store.
const DOC_TYPES = new Set(['quote', 'contract', 'renewal', 'addendum']);
const PRODUCTS = new Set(['psa', 'billing', 'tigerpaw', 'both', 'none']);

export const STORE_NAME = 'deal-desk-events';

// The key carries the facts, so reporting can aggregate from a single list call
// without fetching every blob. Slugs contain no dashes; the uuid tail may.
export function eventKey(day, docType, product, starterPack, id) {
  return `ev/${day}/${docType}-${product}-${starterPack ? 1 : 0}-${id}`;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const docType = DOC_TYPES.has(body?.docType) ? body.docType : 'unknown';
  const product = PRODUCTS.has(body?.product) ? body.product : 'none';
  const starterPack = body?.starterPack === true;

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const id = crypto.randomUUID();

  try {
    const store = getStore(STORE_NAME);
    await store.set(
      eventKey(day, docType, product, starterPack, id),
      JSON.stringify({ ts: now.toISOString(), docType, product, starterPack }),
    );
  } catch (err) {
    // Reporting is never worth failing a document over; the client ignores this
    // anyway. Log it so a broken store is visible in the function logs.
    console.error('deal-desk: could not record event', err);
    return new Response(null, { status: 202 });
  }

  return new Response(null, { status: 204 });
};

export const config = { path: '/api/log-document' };
