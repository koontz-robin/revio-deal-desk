import { getStore } from '@netlify/blobs';
import { STORE_NAME } from './log-document.mjs';

const DAY_MS = 86400000;

function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Pure so it can be tested without a live blob store. Keys look like
// ev/2026-10-05/contract-psa-0-<uuid>; the uuid tail also contains dashes, so
// only the first three dash-separated fields are read.
export function aggregate(keys, today = new Date()) {
  const byType = {};
  const byProduct = {};
  const byDay = {};
  let total = 0;
  let starterPack = 0;

  for (const key of keys) {
    const parts = String(key).split('/');
    if (parts.length !== 3 || parts[0] !== 'ev') continue;
    const day = parts[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const [docType, product, starterFlag] = parts[2].split('-');
    if (!docType || !product) continue;

    total++;
    byType[docType] = (byType[docType] || 0) + 1;
    byProduct[product] = (byProduct[product] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;
    if (starterFlag === '1') starterPack++;
  }

  const end = new Date(isoDay(today) + 'T00:00:00Z').getTime();
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const day = isoDay(end - i * DAY_MS);
    series.push({ day, count: byDay[day] || 0 });
  }

  const month = isoDay(today).slice(0, 7);
  const thisMonth = Object.entries(byDay)
    .filter(([day]) => day.startsWith(month))
    .reduce((sum, [, n]) => sum + n, 0);
  const last7 = series.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const last30 = series.reduce((sum, d) => sum + d.count, 0);

  const sorted = (obj) =>
    Object.entries(obj)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return {
    total,
    thisMonth,
    last7,
    last30,
    starterPack,
    byType: sorted(byType),
    byProduct: sorted(byProduct),
    series,
    firstDay: Object.keys(byDay).sort()[0] || null,
  };
}

export default async () => {
  let keys = [];
  try {
    const store = getStore(STORE_NAME);
    const { blobs } = await store.list({ prefix: 'ev/' });
    keys = blobs.map((b) => b.key);
  } catch (err) {
    console.error('deal-desk: could not read events', err);
    return new Response(JSON.stringify({ error: 'unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(aggregate(keys)), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

export const config = { path: '/api/stats' };
