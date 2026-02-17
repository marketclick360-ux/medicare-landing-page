export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const expectedSecret = (env.WEBHOOK_SECRET || '').trim();
    if (expectedSecret) {
      const provided = request.headers.get('X-Notify-Secret') || '';
      if (provided !== expectedSecret) {
        return json({ ok: false, error: 'Unauthorized' }, 401);
      }
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const eventType = request.headers.get('X-Notify-Event') || 'email';

    try {
      if (eventType === 'email') {
        await handleEmail(payload, env);
      } else if (eventType === 'sms') {
        await handleSms(payload, env);
      } else {
        return json({ ok: false, error: 'Unknown event type' }, 400);
      }
    } catch (error) {
      return json({ ok: false, error: error.message || 'Webhook processing failed' }, 500);
    }

    return json({ ok: true }, 200);
  }
};

async function handleEmail(payload, env) {
  const subject = String(payload.subject || 'New lead notification');
  const text = String(payload.text || '').trim() || fallbackText(payload.record);

  // Option A: Send with Resend from the Worker.
  if ((env.EMAIL_PROVIDER || '').toLowerCase() === 'resend') {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM || !env.RESEND_TO) {
      throw new Error('Missing Resend env vars');
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [env.RESEND_TO],
        subject,
        text
      })
    });
    if (!response.ok) {
      throw new Error(`Resend request failed (${response.status})`);
    }
    return;
  }

  // Option B: Relay to Slack/Discord/any webhook endpoint.
  if ((env.EMAIL_PROVIDER || '').toLowerCase() === 'relay-webhook') {
    if (!env.RELAY_WEBHOOK_URL) throw new Error('Missing RELAY_WEBHOOK_URL');
    const response = await fetch(env.RELAY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `**${subject}**\n\n${text}`,
        subject,
        message: text,
        payload
      })
    });
    if (!response.ok) {
      throw new Error(`Relay webhook failed (${response.status})`);
    }
    return;
  }

  throw new Error('EMAIL_PROVIDER must be resend or relay-webhook');
}

async function handleSms(payload, env) {
  const body = String(payload.body || '').trim() || 'New lead';

  // Twilio from Worker (optional).
  if ((env.SMS_PROVIDER || '').toLowerCase() === 'twilio') {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM || !env.TWILIO_TO) {
      throw new Error('Missing Twilio env vars');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: env.TWILIO_FROM,
        To: env.TWILIO_TO,
        Body: body
      }).toString()
    });

    if (!response.ok) {
      throw new Error(`Twilio request failed (${response.status})`);
    }
    return;
  }

  // Optional relay-only SMS webhook.
  if ((env.SMS_PROVIDER || '').toLowerCase() === 'relay-webhook') {
    if (!env.SMS_RELAY_WEBHOOK_URL) throw new Error('Missing SMS_RELAY_WEBHOOK_URL');
    const response = await fetch(env.SMS_RELAY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, payload })
    });
    if (!response.ok) {
      throw new Error(`SMS relay webhook failed (${response.status})`);
    }
    return;
  }

  throw new Error('SMS_PROVIDER must be twilio or relay-webhook');
}

function fallbackText(record) {
  const payload = record?.payload || {};
  return [
    `Lead ID: ${record?.id || ''}`,
    `Service: ${payload.service_interest || 'n/a'}`,
    `Name: ${payload.fullName || payload.name || 'n/a'}`,
    `Email: ${payload.email || 'n/a'}`,
    `Phone: ${payload.phone || 'n/a'}`,
    `ZIP: ${payload.zip || payload.zipCode || 'n/a'}`,
    `Created: ${record?.createdAt || ''}`
  ].join('\n');
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
