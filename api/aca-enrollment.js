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

    // Insert into Supabase aca_enrollment table
    const { error } = await supabase
      .from('aca_enrollment')
      .insert([{
        full_name: data.full_name,
        dob: data.dob || null,
        email: data.email,
        phone: data.phone,
        zip_code: data.zip_code || null,
        state: data.state || null,
        household_size: data.household_size ? parseInt(data.household_size) : null,
        estimated_income: data.estimated_income || null,
        current_insurance: data.current_insurance || null,
        preferred_start_date: data.preferred_start_date || null,
        notes: data.notes || null
      }]);

    if (error) throw error;

    // Send email notification
    await resend.emails.send({
      from: 'notifications@edlando.com',
      to: 'janet@edlando.com',
      subject: `New ACA Enrollment: ${data.full_name}`,
      html: `
        <h2>New ACA Enrollment Submission</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>DOB:</strong> ${data.dob || 'N/A'}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Phone:</strong> ${data.phone}</p>
        <p><strong>ZIP Code:</strong> ${data.zip_code || 'N/A'}</p>
        <p><strong>Household Size:</strong> ${data.household_size || 'N/A'}</p>
        <p><strong>Income:</strong> ${data.estimated_income || 'N/A'}</p>
        <p><strong>Current Insurance:</strong> ${data.current_insurance || 'N/A'}</p>
        <p><strong>Preferred Start Date:</strong> ${data.preferred_start_date || 'N/A'}</p>
        <p><strong>Notes:</strong> ${data.notes || 'None'}</p>
      `
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
