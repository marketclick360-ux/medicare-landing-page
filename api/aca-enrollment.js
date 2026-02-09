import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;
    
    // Insert into Supabase
    const { error } = await supabase
      .from('aca_enrollment')
      .insert([data]);

    if (error) throw error;

    // Send email notification
    await resend.emails.send({
      from: 'notifications@edlando.com',
      to: 'janet@edlando.com',
      subject: `New ACA Enrollment: ${data.fullName}`,
      html: `
        <h2>New ACA Enrollment Submission</h2>
        <p><strong>Name:</strong> ${data.fullName}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Phone:</strong> ${data.phone}</p>
        <p><strong>State:</strong> ${data.state}</p>
        <p><strong>Household Size:</strong> ${data.householdSize}</p>
        <p><strong>Household Income:</strong> $${data.householdIncome}</p>
        <p><strong>Current Coverage:</strong> ${data.currentCoverage || 'N/A'}</p>
        <p><strong>Preferred Start Date:</strong> ${data.preferredStartDate || 'N/A'}</p>
        <p><strong>Notes:</strong> ${data.notes || 'None'}</p>
      `
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
