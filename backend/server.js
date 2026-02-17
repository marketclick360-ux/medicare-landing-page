import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.ndjson');
const CHECKLISTS_FILE = path.join(DATA_DIR, 'checklists.ndjson');
const FAILURES_FILE = path.join(DATA_DIR, 'failed-submissions.ndjson');
const STATUS_FILE = path.join(DATA_DIR, 'lead-status.ndjson');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.ndjson');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const NOTIFY_EMAIL_PROVIDER = (process.env.NOTIFY_EMAIL_PROVIDER || 'none').toLowerCase();
const NOTIFY_SMS_PROVIDER = (process.env.NOTIFY_SMS_PROVIDER || 'none').toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || '';
const RESEND_TO = process.env.RESEND_TO || '';
const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL || '';
const SMS_WEBHOOK_URL = process.env.SMS_WEBHOOK_URL || '';
const NOTIFY_WEBHOOK_SECRET = process.env.NOTIFY_WEBHOOK_SECRET || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';
const TWILIO_TO = process.env.TWILIO_TO || '';
const ALLOWED_SERVICES = new Set(['medicare', 'aca', 'life', 'tax']);
const ALLOWED_STATUSES = new Set(['new', 'contacted', 'qualified', 'closed']);
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'yopmail.com',
  'trashmail.com'
]);

function json(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(JSON.stringify(payload));
}

function webhookHeaders(extra = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra);
  if (NOTIFY_WEBHOOK_SECRET) {
    headers['X-Notify-Secret'] = NOTIFY_WEBHOOK_SECRET;
  }
  return headers;
}

function parseBasicAuth(header) {
  if (!header || !header.startsWith('Basic ')) return { user: '', pass: '' };
  const encoded = header.slice(6).trim();
  let decoded = '';
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return { user: '', pass: '' };
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return { user: '', pass: '' };
  return {
    user: decoded.slice(0, sep),
    pass: decoded.slice(sep + 1)
  };
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function emailDomain(email) {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '';
  return email.slice(at + 1).toLowerCase();
}

function isLikelySpam(payload) {
  if (payload.honeypot && String(payload.honeypot).trim() !== '') {
    return 'Honeypot triggered';
  }

  const startedAt = Number(payload.form_started_at || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return 'Missing form_started_at';
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < 2500) return 'Submitted too fast';
  if (elapsedMs > 7 * 24 * 60 * 60 * 1000) return 'Stale form';

  const email = String(payload.email || '').trim().toLowerCase();
  if (email) {
    const domain = emailDomain(email);
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return 'Disposable email domain blocked';
    }
  }

  return '';
}

function validateLead(payload) {
  const service = String(payload.service_interest || '').toLowerCase();
  if (!ALLOWED_SERVICES.has(service)) return 'Invalid service_interest';

  const type = String(payload.type || '').toLowerCase();
  if (type === 'prequal') {
    const consent = String(payload.contactConsent || payload.consent || '').toLowerCase();
    const zip = String(payload.zip || '').trim();
    if (!zip) return 'Missing zip';
    if (consent !== 'yes') return 'Missing consent';
    return '';
  }

  const name = String(payload.fullName || payload.name || '').trim();
  const phone = String(payload.phone || '').trim();
  const consent = String(payload.contactConsent || payload.consent || '').toLowerCase();

  if (!name) return 'Missing fullName';
  if (!phone) return 'Missing phone';
  if (consent !== 'yes') return 'Missing consent';

  const email = String(payload.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Invalid email format';
  }

  return '';
}

function validateChecklist(payload) {
  const service = String(payload.service_interest || '').toLowerCase();
  if (!ALLOWED_SERVICES.has(service)) return 'Invalid service_interest';

  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim();
  const consent = String(payload.consent || '').toLowerCase();

  if (!name) return 'Missing name';
  if (!email) return 'Missing email';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email';
  if (consent !== 'yes') return 'Missing consent';

  return '';
}

async function appendRecord(filePath, record) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(filePath, JSON.stringify(record) + '\n', 'utf8');
}

async function appendStatusEvent(id, status, note = '') {
  const event = {
    id,
    status,
    note,
    updatedAt: new Date().toISOString()
  };
  await appendRecord(STATUS_FILE, event);
}

function readNdjsonRows(filePath, maxRows = 200) {
  if (!existsSync(filePath)) return [];
  return readFile(filePath, 'utf8')
    .then((raw) =>
      raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-maxRows)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    )
    .catch(() => []);
}

async function readStatusMap() {
  const events = await readNdjsonRows(STATUS_FILE, 10000);
  const map = new Map();
  events.forEach((event) => {
    if (event?.id) {
      map.set(event.id, {
        status: event.status || 'new',
        statusNote: event.note || '',
        statusUpdatedAt: event.updatedAt || ''
      });
    }
  });
  return map;
}

function attachStatuses(rows, statusMap) {
  return rows.map((row) => {
    const status = statusMap.get(row.id) || { status: 'new', statusNote: '', statusUpdatedAt: '' };
    return Object.assign({}, row, status);
  });
}

function formatLeadSummary(record) {
  const payload = record.payload || {};
  return [
    `Lead ID: ${record.id}`,
    `Type: ${record.kind}`,
    `Service: ${payload.service_interest || 'n/a'}`,
    `Name: ${payload.fullName || payload.name || 'n/a'}`,
    `Email: ${payload.email || 'n/a'}`,
    `Phone: ${payload.phone || 'n/a'}`,
    `ZIP: ${payload.zip || payload.zipCode || 'n/a'}`,
    `Created: ${record.createdAt}`,
    `Source: ${payload.tracking?.utm_source || 'n/a'}`,
    `Campaign: ${payload.tracking?.utm_campaign || 'n/a'}`
  ].join('\n');
}

async function sendEmailNotification(record) {
  const subject = `New ${record.payload?.service_interest || 'service'} lead`;
  const text = formatLeadSummary(record);

  if (NOTIFY_EMAIL_PROVIDER === 'resend') {
    if (!RESEND_API_KEY || !RESEND_FROM || !RESEND_TO) throw new Error('Resend env vars missing');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [RESEND_TO],
        subject,
        text
      })
    });
    if (!response.ok) throw new Error(`Resend failed: ${response.status}`);
    return;
  }

  if (NOTIFY_EMAIL_PROVIDER === 'webhook') {
    if (!EMAIL_WEBHOOK_URL) throw new Error('EMAIL_WEBHOOK_URL missing');
    const response = await fetch(EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: webhookHeaders({ 'X-Notify-Event': 'email' }),
      body: JSON.stringify({ subject, text, record })
    });
    if (!response.ok) throw new Error(`Email webhook failed: ${response.status}`);
    return;
  }
}

async function sendSmsNotification(record) {
  const payload = record.payload || {};
  const body = `[${payload.service_interest || 'service'}] ${payload.fullName || payload.name || 'Lead'} ${payload.phone || ''} ${payload.zip || payload.zipCode || ''}`.trim();

  if (NOTIFY_SMS_PROVIDER === 'twilio') {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM || !TWILIO_TO) {
      throw new Error('Twilio env vars missing');
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: TWILIO_FROM,
        To: TWILIO_TO,
        Body: body
      }).toString()
    });
    if (!response.ok) throw new Error(`Twilio failed: ${response.status}`);
    return;
  }

  if (NOTIFY_SMS_PROVIDER === 'webhook') {
    if (!SMS_WEBHOOK_URL) throw new Error('SMS_WEBHOOK_URL missing');
    const response = await fetch(SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: webhookHeaders({ 'X-Notify-Event': 'sms' }),
      body: JSON.stringify({ body, record })
    });
    if (!response.ok) throw new Error(`SMS webhook failed: ${response.status}`);
    return;
  }
}

async function notifyNewLead(record) {
  if (String(record.payload?.type || '').toLowerCase() === 'prequal') return;
  const attempts = [];

  if (NOTIFY_EMAIL_PROVIDER !== 'none') {
    try {
      await sendEmailNotification(record);
      attempts.push({ channel: 'email', ok: true });
    } catch (error) {
      attempts.push({ channel: 'email', ok: false, error: error.message });
    }
  }

  if (NOTIFY_SMS_PROVIDER !== 'none') {
    try {
      await sendSmsNotification(record);
      attempts.push({ channel: 'sms', ok: true });
    } catch (error) {
      attempts.push({ channel: 'sms', ok: false, error: error.message });
    }
  }

  if (attempts.length > 0) {
    await appendRecord(NOTIFICATIONS_FILE, {
      id: randomUUID(),
      leadId: record.id,
      createdAt: new Date().toISOString(),
      attempts
    });
  }
}

function isAdminAuthorized(req) {
  const auth = String(req.headers.authorization || '');
  if (ADMIN_TOKEN && auth === `Bearer ${ADMIN_TOKEN}`) return true;
  if (ADMIN_USER && ADMIN_PASS) {
    const creds = parseBasicAuth(auth);
    if (creds.user === ADMIN_USER && creds.pass === ADMIN_PASS) return true;
  }
  return false;
}

function adminConfigured() {
  return Boolean(ADMIN_TOKEN) || Boolean(ADMIN_USER && ADMIN_PASS);
}

async function handleLead(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const spamReason = isLikelySpam(payload);
  if (spamReason) {
    await appendRecord(FAILURES_FILE, {
      id: randomUUID(),
      kind: 'lead',
      reason: spamReason,
      ip: getIp(req),
      payload,
      createdAt: new Date().toISOString()
    });
    return json(res, 422, { ok: false, error: spamReason });
  }

  const invalidReason = validateLead(payload);
  if (invalidReason) {
    return json(res, 422, { ok: false, error: invalidReason });
  }

  const record = {
    id: randomUUID(),
    kind: 'lead',
    ip: getIp(req),
    userAgent: req.headers['user-agent'] || '',
    payload,
    createdAt: new Date().toISOString()
  };

  await appendRecord(LEADS_FILE, record);
  await appendStatusEvent(record.id, 'new', 'Lead created');
  notifyNewLead(record).catch(async (error) => {
    await appendRecord(FAILURES_FILE, {
      id: randomUUID(),
      kind: 'notification',
      reason: error.message,
      payload: { leadId: record.id },
      createdAt: new Date().toISOString()
    });
  });
  return json(res, 201, { ok: true, id: record.id });
}

async function handleChecklist(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const spamReason = isLikelySpam(payload);
  if (spamReason) {
    await appendRecord(FAILURES_FILE, {
      id: randomUUID(),
      kind: 'checklist',
      reason: spamReason,
      ip: getIp(req),
      payload,
      createdAt: new Date().toISOString()
    });
    return json(res, 422, { ok: false, error: spamReason });
  }

  const invalidReason = validateChecklist(payload);
  if (invalidReason) {
    return json(res, 422, { ok: false, error: invalidReason });
  }

  const record = {
    id: randomUUID(),
    kind: 'checklist',
    ip: getIp(req),
    userAgent: req.headers['user-agent'] || '',
    payload,
    createdAt: new Date().toISOString()
  };

  await appendRecord(CHECKLISTS_FILE, record);
  await appendStatusEvent(record.id, 'new', 'Checklist created');
  notifyNewLead(record).catch(async (error) => {
    await appendRecord(FAILURES_FILE, {
      id: randomUUID(),
      kind: 'notification',
      reason: error.message,
      payload: { leadId: record.id },
      createdAt: new Date().toISOString()
    });
  });
  return json(res, 201, { ok: true, id: record.id });
}

async function handleAdminLeads(req, res) {
  if (!adminConfigured()) return json(res, 503, { ok: false, error: 'Admin auth not configured' });
  if (!isAdminAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });
  const [rows, statusMap] = await Promise.all([
    readNdjsonRows(LEADS_FILE, 500),
    readStatusMap()
  ]);
  const enriched = attachStatuses(rows, statusMap);
  return json(res, 200, { ok: true, rows: enriched });
}

async function handleAdminChecklists(req, res) {
  if (!adminConfigured()) return json(res, 503, { ok: false, error: 'Admin auth not configured' });
  if (!isAdminAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });
  const [rows, statusMap] = await Promise.all([
    readNdjsonRows(CHECKLISTS_FILE, 500),
    readStatusMap()
  ]);
  const enriched = attachStatuses(rows, statusMap);
  return json(res, 200, { ok: true, rows: enriched });
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows) {
  const header = [
    'id',
    'kind',
    'createdAt',
    'service_interest',
    'fullName',
    'name',
    'email',
    'phone',
    'zip',
    'contactConsent',
    'status',
    'statusNote',
    'statusUpdatedAt',
    'source',
    'campaign'
  ];
  const lines = [header.join(',')];

  rows.forEach((row) => {
    const payload = row.payload || {};
    lines.push(
      [
        row.id || '',
        row.kind || '',
        row.createdAt || '',
        payload.service_interest || '',
        payload.fullName || '',
        payload.name || '',
        payload.email || '',
        payload.phone || '',
        payload.zip || payload.zipCode || '',
        payload.contactConsent || payload.consent || '',
        row.status || 'new',
        row.statusNote || '',
        row.statusUpdatedAt || '',
        payload.tracking?.utm_source || '',
        payload.tracking?.utm_campaign || ''
      ]
        .map(escapeCsv)
        .join(',')
    );
  });

  return lines.join('\n');
}

async function handleAdminExport(req, res) {
  if (!adminConfigured()) return json(res, 503, { ok: false, error: 'Admin auth not configured' });
  if (!isAdminAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });

  const [leads, checklists] = await Promise.all([
    readNdjsonRows(LEADS_FILE, 2000),
    readNdjsonRows(CHECKLISTS_FILE, 2000)
  ]);
  const statusMap = await readStatusMap();
  const rowsWithStatus = attachStatuses([...leads, ...checklists], statusMap);
  const rows = rowsWithStatus.sort((a, b) => {
    const at = new Date(a.createdAt || 0).getTime();
    const bt = new Date(b.createdAt || 0).getTime();
    return bt - at;
  });

  const csv = rowsToCsv(rows);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="lead-export.csv"',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(csv);
}

async function handleAdminStatusUpdate(req, res) {
  if (!adminConfigured()) return json(res, 503, { ok: false, error: 'Admin auth not configured' });
  if (!isAdminAuthorized(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const id = String(payload.id || '').trim();
  const status = String(payload.status || '').trim().toLowerCase();
  const note = String(payload.note || '').trim().slice(0, 500);

  if (!id) return json(res, 422, { ok: false, error: 'Missing id' });
  if (!ALLOWED_STATUSES.has(status)) return json(res, 422, { ok: false, error: 'Invalid status' });

  await appendStatusEvent(id, status, note);
  return json(res, 200, { ok: true });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'lead-backend', timestamp: new Date().toISOString() });
  }

  if (req.method === 'POST' && url.pathname === '/api/lead') {
    return handleLead(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/checklist') {
    return handleChecklist(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/leads') {
    return handleAdminLeads(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/checklists') {
    return handleAdminChecklists(req, res);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export.csv') {
    return handleAdminExport(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/status') {
    return handleAdminStatusUpdate(req, res);
  }

  return json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Lead backend running on http://localhost:${PORT}`);
});
