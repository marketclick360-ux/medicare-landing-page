const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ENC_KEY = process.env.ENCRYPTION_KEY;

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENC_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const d = req.body;

    if (!d.fullName || !d.dob || !d.email || !d.phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ssnRaw = (d.ssn || '').replace(/\D/g, '');
    let ssnEncrypted = null;
    let ssnLast4 = null;
    if (ssnRaw.length === 9) {
      ssnEncrypted = encrypt(ssnRaw);
      ssnLast4 = ssnRaw.slice(-4);
    }

    const row = {
      full_name: d.fullName,
      dob: d.dob,
      email: d.email,
      phone: d.phone,
      language: d.language || 'English',
      ssn_encrypted: ssnEncrypted,
      ssn_last4: ssnLast4,
      current_coverage: d.currentCoverage || null,
      employment_status: d.employmentStatus || null,
      spouse_name: d.spouseName || null,
      concerns: d.concerns || [],
      business_owner: d.businessOwner || null,
      has_life_insurance: d.hasLifeInsurance || null,
      income_source: d.incomeSource || null,
      dependents: d.dependents || null,
      priority1: d.priority1 || null,
      timeline: d.timeline || null,
      notes: d.notes || null
    };

    const response = await fetch(
      SUPABASE_URL + '/rest/v1/client_discovery',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(row)
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Supabase error:', errText);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
