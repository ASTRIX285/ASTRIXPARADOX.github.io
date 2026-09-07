const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const service = 'astrix-destiny-backend';

if (!token || !accountId) {
  throw new Error('Cloudflare diagnostics credentials are unavailable');
}

const now = Date.now();
const from = now - (3 * 24 * 60 * 60 * 1000);
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`;

async function query(name, parameters, limit = 2000) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queryId: `forge-${name}-${now}`,
      timeframe: { from, to: now },
      dry: true,
      limit,
      parameters,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false || body.errors?.length) {
    const message = body.errors?.map((entry) => entry.message).join('; ') || `HTTP ${response.status}`;
    throw new Error(`${name} query failed: ${message}`);
  }
  return body.result || {};
}

const services = await query('service-counts', {
  view: 'calculations',
  datasets: [],
  calculations: [
    { operator: 'count', alias: 'requests' },
  ],
  groupBys: [
    { type: 'string', value: '$metadata.service' },
  ],
  orderBy: { value: 'requests', order: 'desc' },
  limit: 100,
}, 100);

const slow = await query('slow-events', {
  view: 'events',
  datasets: [],
  filterCombination: 'and',
  filters: [
    {
      key: '$workers.wallTimeMs',
      operation: 'gte',
      type: 'number',
      value: 5000,
    },
  ],
  limit: 2000,
});

const failures = await query('memory-events', {
  view: 'events',
  datasets: [],
  needle: {
    value: 'Exceeded Memory',
    isRegex: false,
    matchCase: false,
  },
  limit: 2000,
});

const percentiles = await query('latency-percentiles', {
  view: 'calculations',
  datasets: [],
  calculations: [
    { operator: 'count', alias: 'requests' },
    { operator: 'p99', alias: 'p99_wall_ms', key: '$workers.wallTimeMs', keyType: 'number' },
    { operator: 'p999', alias: 'p999_wall_ms', key: '$workers.wallTimeMs', keyType: 'number' },
    { operator: 'max', alias: 'max_wall_ms', key: '$workers.wallTimeMs', keyType: 'number' },
  ],
  groupBys: [
    { type: 'string', value: '$metadata.service' },
    { type: 'string', value: '$workers.event.request.path' },
  ],
  orderBy: { value: 'max_wall_ms', order: 'desc' },
  limit: 100,
}, 100);

function eventRows(result) {
  return Array.isArray(result.events) ? result.events : [];
}

function text(value, limit = 240) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function safeEvent(event) {
  const metadata = event.$metadata || event.metadata || {};
  const workers = event.$workers || event.workers || {};
  const request = workers.event?.request || event.event?.request || {};
  const response = workers.event?.response || event.event?.response || {};
  return {
    timestamp: metadata.timestamp || event.timestamp || null,
    service: metadata.service || workers.scriptName || service,
    requestId: workers.requestId || metadata.requestId || null,
    method: request.method || null,
    path: request.path || null,
    status: response.status || null,
    outcome: workers.outcome || metadata.outcome || null,
    wallTimeMs: workers.wallTimeMs ?? null,
    cpuTimeMs: workers.cpuTimeMs ?? null,
    error: text(metadata.error || event.error || event.exceptions?.[0]?.message || ''),
    message: text(metadata.message || event.message || ''),
  };
}

console.log(`CLOUDFLARE_DIAGNOSTICS_SERVICE=${service}`);
console.log(`CLOUDFLARE_DIAGNOSTICS_FROM=${new Date(from).toISOString()}`);
console.log(`CLOUDFLARE_DIAGNOSTICS_TO=${new Date(now).toISOString()}`);
console.log(`CLOUDFLARE_SERVICE_COUNTS=${JSON.stringify(services.calculations || [])}`);
console.log(`CLOUDFLARE_MEMORY_EVENTS=${JSON.stringify(eventRows(failures).map(safeEvent))}`);
console.log(`CLOUDFLARE_SLOW_EVENTS=${JSON.stringify(eventRows(slow).map(safeEvent))}`);
console.log(`CLOUDFLARE_LATENCY_PERCENTILES=${JSON.stringify(percentiles.calculations || [])}`);
