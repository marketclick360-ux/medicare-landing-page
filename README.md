# medicare-landing-page
Professional Medicare landing page for lead generation

## Run your backend (no FormSubmit)

1. Start API:
   - `cd backend`
   - `npm run start`
2. Backend runs at `http://localhost:8787` by default.
3. In `index.html`, `questionnaire.html`, and `quick-intake.html`, set:
   - `window.LEAD_API_BASE = 'http://localhost:8787'` (or your production API domain)
   - You can also leave it blank and use shared runtime resolver in `lead-api-config.js`.
   - Optional browser override for testing:
     - `localStorage.setItem('lead_api_base_override', 'https://your-api-domain')`
     - `localStorage.removeItem('lead_api_base_override')` to reset
4. Lead data is saved to:
   - `backend/data/leads.ndjson`
   - `backend/data/checklists.ndjson`
   - spam/blocked submissions: `backend/data/failed-submissions.ndjson`
5. Configure admin auth with either:
   - `ADMIN_TOKEN=your-secret-token` (recommended)
   - or `ADMIN_USER=...` and `ADMIN_PASS=...` for Basic auth
6. Optional lead notifications:
   - Email:
     - `NOTIFY_EMAIL_PROVIDER=none|resend|webhook`
     - If `resend`: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_TO`
     - If `webhook`: `EMAIL_WEBHOOK_URL`
   - SMS:
     - `NOTIFY_SMS_PROVIDER=none|twilio|webhook`
     - If `twilio`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_TO`
     - If `webhook`: `SMS_WEBHOOK_URL`
7. Optional webhook signing secret:
   - `NOTIFY_WEBHOOK_SECRET=your-random-secret`

## Admin dashboard

- Open `admin.html`.
- Set API base URL and your `ADMIN_TOKEN`.
- View leads and checklist requests, filter by service, update lead status, and export CSV.
- Status values: `new`, `contacted`, `qualified`, `closed`.

## Cloudflare webhook (economical + stable)

Files:
- `backend/webhooks/cloudflare-worker.js`
- `backend/webhooks/wrangler.toml.example`

Deploy steps:
1. Install Wrangler and login:
   - `npm i -g wrangler`
   - `wrangler login`
2. In `backend/webhooks`, copy `wrangler.toml.example` to `wrangler.toml`.
3. Set Worker secrets:
   - `wrangler secret put WEBHOOK_SECRET`
   - `wrangler secret put EMAIL_PROVIDER` (`resend` or `relay-webhook`)
   - If `resend`: `wrangler secret put RESEND_API_KEY`, `RESEND_FROM`, `RESEND_TO`
   - Optional SMS: `wrangler secret put SMS_PROVIDER` + provider keys
4. Deploy:
   - `wrangler deploy`
5. Use worker URL for backend webhooks:
   - `EMAIL_WEBHOOK_URL=https://<your-worker>.workers.dev`
   - `SMS_WEBHOOK_URL=https://<your-worker>.workers.dev`
   - `NOTIFY_WEBHOOK_SECRET` must match Worker `WEBHOOK_SECRET`

## Google Ads setup

1. Open `index.html`, `questionnaire.html`, `quick-intake.html`, and `thank-you.html`.
2. Set:
   - `window.GOOGLE_TAG_ID` (example: `G-XXXXXXXXXX`)
   - `window.GOOGLE_ADS_ID` (example: `AW-123456789`)
   - `window.GOOGLE_ADS_CONVERSION_LABEL` (from your Google Ads conversion action)
3. Replace canonical/sitemap placeholder domain `https://example.com` with your real domain.
4. Set contact phone values in `index.html`, `questionnaire.html`, and `thank-you.html`:
   - `window.CONTACT_PHONE_DISPLAY`
   - `window.CONTACT_PHONE_TEL`
   - `window.CONTACT_SMS_TEL`
5. Replace Calendly placeholder link in `thank-you.html`.
6. Replace checklist/share placeholder domain `https://example.com`.

## Lead flow

- `index.html` captures consent and UTM/GCLID parameters plus selected service.
- `questionnaire.html` handles Medicare intake and redirects to `thank-you.html`.
- `quick-intake.html` handles ACA, life insurance, and tax intake.
- `thank-you.html` fires conversion tracking.
- `index.html` includes a free checklist capture form and starts a file download.
- backend API routes:
  - `POST /api/lead`
  - `POST /api/checklist`
  - `GET /api/health`

## Service pages

- `medicare.html`
- `aca.html`
- `life.html`
- `tax.html`

## Service assets

- `medicare-checklist.txt`
- `aca-checklist.txt`
- `life-insurance-checklist.txt`
- `tax-filing-checklist.txt`
