const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const service = 'astrix-destiny-backend';

if (!token || !accountId) {
  throw new Error('Cloudflare diagnostics credentials are unavailable');
}

const now = Date.now();
const from = now - (3 * 24 * 60 * 60 * 1000);
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`;
const keysEndpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/keys`;

async function query(name, parameters, limit = 2000) {
  const { view = 'calculations', ...queryParameters } = parameters;
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
      view,
      parameters: queryParameters,
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

const serviceFilter = {
  key: '$metadata.service',
  operation: 'eq',
  type: 'string',
  value: service,
};

const keysResponse = await fetch(keysEndpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    datasets: [],
    filters: [serviceFilter],
    from,
    to: now,
    limit: 2000,
  }),
});
const keysBody = await keysResponse.json().catch(() => ({}));
if (!keysResponse.ok || keysBody.success === false || keysBody.errors?.length) {
  const message = keysBody.errors?.map((entry) => entry.message).join('; ') || `HTTP ${keysResponse.status}`;
  throw new Error(`keys query failed: ${message}`);
}

const recent = await query('recent-events', {
  view: 'events',
  datasets: [],
  filterCombination: 'and',
  filters: [serviceFilter],
  limit: 20,
}, 20);

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
    { type: 'string', value: '$workers.event.path' },
  ],
  orderBy: { value: 'max_wall_ms', order: 'desc' },
  limit: 100,
}, 100);

function eventRows(result) {
  const queue = [result.events];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      const rows = value.filter((entry) => entry && typeof entry === 'object');
      if (rows.length) return rows;
      continue;
    }
    for (const key of ['events', 'results', 'data', 'rows', 'items']) {
      if (key in value) queue.push(value[key]);
    }
  }
  return [];
}

function eventShape(result) {
  const value = result.events;
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (!value || typeof value !== 'object') return { type: typeof value };
  return {
    type: 'object',
    keys: Object.keys(value),
    children: Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      Array.isArray(child)
        ? { type: 'array', length: child.length }
        : { type: typeof child, keys: child && typeof child === 'object' ? Object.keys(child) : [] },
    ])),
  };
}

function text(value, limit = 240) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function safeEvent(event) {
  const metadata = event.$metadata || event.metadata || {};
  const workers = event.$workers || event.workers || {};
  const workerEvent = workers.event || event.event || {};
  const request = workerEvent.request || {};
  const response = workerEvent.response || {};
  let urlPath = null;
  try {
    urlPath = request.url ? new URL(request.url).pathname : null;
  } catch {}
  return {
    timestamp: metadata.timestamp || event.timestamp || null,
    service: metadata.service || workers.scriptName || service,
    requestId: workers.requestId || metadata.requestId || null,
    method: request.method || null,
    path: workerEvent.path || request.path || urlPath,
    status: response.status || null,
    outcome: workers.outcome || metadata.outcome || null,
    wallTimeMs: workers.wallTimeMs ?? null,
    cpuTimeMs: workers.cpuTimeMs ?? null,
    error: text(metadata.error || event.error || event.exceptions?.[0]?.message || ''),
    message: text(metadata.message || event.message || ''),
  };
}

function compactCalculations(result) {
  const calculations = Array.isArray(result.calculations) ? result.calculations : [];
  return calculations.map((calculation) => {
    const compact = {};
    for (const key of ['alias', 'operator', 'aggregates', 'groups']) {
      if (calculation[key] !== undefined) compact[key] = calculation[key];
    }
    const series = Array.isArray(calculation.series) ? calculation.series : [];
    if (series.length) {
      compact.slowSeries = series.filter((entry) => {
        const value = Number(entry?.value ?? entry?.values?.[0] ?? 0);
        return Number.isFinite(value) && value >= 5000;
      });
    }
    return compact;
  });
}

console.log(`CLOUDFLARE_DIAGNOSTICS_SERVICE=${service}`);
console.log(`CLOUDFLARE_DIAGNOSTICS_FROM=${new Date(from).toISOString()}`);
console.log(`CLOUDFLARE_DIAGNOSTICS_TO=${new Date(now).toISOString()}`);
console.log(`CLOUDFLARE_SERVICE_COUNTS=${JSON.stringify(services.calculations || [])}`);
console.log(`CLOUDFLARE_RELEVANT_KEYS=${JSON.stringify((keysBody.result || []).filter((entry) => /wall|cpu|duration|path|error|outcome|status|request|response|memory/i.test(entry.key)))}`);
console.log(`CLOUDFLARE_RECENT_RESULT_KEYS=${JSON.stringify(Object.keys(recent))}`);
console.log(`CLOUDFLARE_RECENT_EVENT_SHAPE=${JSON.stringify(eventShape(recent))}`);
console.log(`CLOUDFLARE_MEMORY_EVENT_SHAPE=${JSON.stringify(eventShape(failures))}`);
console.log(`CLOUDFLARE_SLOW_EVENT_SHAPE=${JSON.stringify(eventShape(slow))}`);
console.log(`CLOUDFLARE_RECENT_EVENTS=${JSON.stringify(eventRows(recent).map(safeEvent))}`);
console.log(`CLOUDFLARE_MEMORY_EVENTS=${JSON.stringify(eventRows(failures).map(safeEvent))}`);
console.log(`CLOUDFLARE_SLOW_EVENTS=${JSON.stringify(eventRows(slow).map(safeEvent))}`);
console.log(`CLOUDFLARE_LATENCY_PERCENTILES=${JSON.stringify(compactCalculations(percentiles))}`);
