const TRACKING_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid'
];
const API_BASE = window.resolveLeadApiBase
  ? window.resolveLeadApiBase()
  : (window.LEAD_API_BASE || '').trim();
const FAILED_QUEUE_KEY = 'failed_submissions_queue';

const SERVICE_CONFIG = {
  medicare: {
    name: 'Medicare',
    leadFormHeading: 'Start your free Medicare consultation',
    helper: 'Compare Medicare Advantage, Medigap, and Part D options.',
    questionnairePath: 'questionnaire.html',
    checklistFile: 'medicare-checklist.txt'
  },
  aca: {
    name: 'ACA / Obamacare',
    leadFormHeading: 'Start your free ACA consultation',
    helper: 'Check Marketplace plan options and potential subsidy eligibility.',
    questionnairePath: 'quick-intake.html?service=aca',
    checklistFile: 'aca-checklist.txt'
  },
  life: {
    name: 'Life Insurance',
    leadFormHeading: 'Start your free life insurance consultation',
    helper: 'Compare term and permanent options based on your budget goals.',
    questionnairePath: 'quick-intake.html?service=life',
    checklistFile: 'life-insurance-checklist.txt'
  },
  tax: {
    name: 'Tax Filing',
    leadFormHeading: 'Start your free tax filing consultation',
    helper: 'Get help organizing documents and filing support options.',
    questionnairePath: 'quick-intake.html?service=tax',
    checklistFile: 'tax-filing-checklist.txt'
  }
};

function ensureGoogleTag() {
  const tagId = (window.GOOGLE_TAG_ID || '').trim();
  const adsId = (window.GOOGLE_ADS_ID || '').trim();
  if (!tagId && !adsId) return;

  const primaryId = tagId || adsId;
  if (!document.querySelector('script[data-google-tag-loader="1"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(primaryId);
    script.setAttribute('data-google-tag-loader', '1');
    document.head.appendChild(script);
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  if (tagId) window.gtag('config', tagId);
  if (adsId) window.gtag('config', adsId);
}

function apiUrl(pathname) {
  return `${API_BASE}${pathname}`;
}

async function postToApi(pathname, payload) {
  const response = await fetch(apiUrl(pathname), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

function queueFailedSubmission(item) {
  const raw = localStorage.getItem(FAILED_QUEUE_KEY);
  const queue = raw ? JSON.parse(raw) : [];
  queue.push(item);
  localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(queue.slice(-50)));
}

async function flushFailedQueue() {
  const raw = localStorage.getItem(FAILED_QUEUE_KEY);
  if (!raw) return;
  const queue = JSON.parse(raw);
  if (!Array.isArray(queue) || queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    try {
      await postToApi(item.path, item.payload);
    } catch (error) {
      remaining.push(item);
    }
  }

  if (remaining.length > 0) {
    localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    localStorage.removeItem(FAILED_QUEUE_KEY);
  }
}

function trackLeadStart() {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'begin_checkout', { currency: 'USD', value: 0 });
}

function trackContactClick(method) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'contact', { method: method });
}

function readTrackingFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const tracking = {};
  TRACKING_KEYS.forEach(function (key) {
    const value = params.get(key);
    if (value) tracking[key] = value;
  });
  return tracking;
}

function mergeTracking() {
  const savedRaw = localStorage.getItem('tracking_params');
  const saved = savedRaw ? JSON.parse(savedRaw) : {};
  const fromUrl = readTrackingFromUrl();
  const merged = Object.assign({}, saved, fromUrl);
  localStorage.setItem('tracking_params', JSON.stringify(merged));
  return merged;
}

function applyTrackingToForm(form, tracking) {
  TRACKING_KEYS.forEach(function (key) {
    const input = form.querySelector('#' + key);
    if (input) input.value = tracking[key] || '';
  });
  const landingInput = form.querySelector('#landing_page');
  if (landingInput) landingInput.value = window.location.href;
}

function updateContactLinks() {
  const callTel = (window.CONTACT_PHONE_TEL || '+18005551234').trim();
  const smsTel = (window.CONTACT_SMS_TEL || callTel).trim();
  const phoneDisplay = (window.CONTACT_PHONE_DISPLAY || callTel).trim();

  const topCall = document.getElementById('call-now-link-top');
  const stickyCall = document.getElementById('call-now-link-sticky');
  const topText = document.getElementById('text-now-link-top');
  const stickyText = document.getElementById('text-now-link-sticky');

  [topCall, stickyCall].forEach(function (link) {
    if (!link) return;
    link.href = 'tel:' + callTel;
    if (link.id === 'call-now-link-top') link.textContent = 'Call ' + phoneDisplay;
    link.addEventListener('click', function () { trackContactClick('phone'); });
  });

  [topText, stickyText].forEach(function (link) {
    if (!link) return;
    link.href = 'sms:' + smsTel;
    link.addEventListener('click', function () { trackContactClick('sms'); });
  });
}

function downloadChecklist() {
  const selectedService = (localStorage.getItem('service_interest') || 'medicare').trim();
  const config = SERVICE_CONFIG[selectedService] || SERVICE_CONFIG.medicare;
  const a = document.createElement('a');
  a.href = config.checklistFile;
  a.download = config.checklistFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function getServiceFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('service');
}

function applyServiceSelection(serviceKey) {
  const service = SERVICE_CONFIG[serviceKey] ? serviceKey : 'medicare';
  localStorage.setItem('service_interest', service);

  const heading = document.getElementById('lead-form-heading');
  const helper = document.querySelector('.form-helper');
  if (heading) heading.textContent = SERVICE_CONFIG[service].leadFormHeading;
  if (helper) helper.textContent = SERVICE_CONFIG[service].helper;

  const leadSelect = document.getElementById('service_interest');
  if (leadSelect) leadSelect.value = service;

  const checklistSelect = document.getElementById('checklistService');
  if (checklistSelect) checklistSelect.value = service;

  document.querySelectorAll('.service-pill').forEach(function (pill) {
    pill.classList.toggle('is-active', pill.getAttribute('data-service') === service);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  ensureGoogleTag();
  flushFailedQueue();
  updateContactLinks();

  const footerYear = document.getElementById('footer-year');
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  const form = document.getElementById('lead-form');
  const status = document.getElementById('form-status');
  if (!form || !status) return;
  const leadStartInput = document.getElementById('lead_form_started_at');
  if (leadStartInput) leadStartInput.value = String(Date.now());

  const serviceFromQuery = getServiceFromQuery();
  const storedService = localStorage.getItem('service_interest');
  const defaultService = serviceFromQuery || storedService || 'medicare';
  applyServiceSelection(defaultService);

  const leadSelect = document.getElementById('service_interest');
  if (leadSelect) {
    leadSelect.addEventListener('change', function () {
      applyServiceSelection(leadSelect.value);
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'select_content', { content_type: 'service', item_id: leadSelect.value });
      }
    });
  }

  document.querySelectorAll('.service-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      const selected = pill.getAttribute('data-service');
      applyServiceSelection(selected);
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'select_content', { content_type: 'service', item_id: selected });
      }
    });
  });

  const tracking = mergeTracking();
  applyTrackingToForm(form, tracking);

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      status.textContent = 'Please complete all required fields and consent checkbox.';
      status.focus();
      return;
    }

    const prequal = {
      service_interest: form.service_interest.value,
      zip: form.zip.value.trim(),
      dob: form.dob.value,
      enrolled: form.enrolled.value,
      contactConsent: form.contactConsent.checked ? 'yes' : 'no',
      honeypot: form.honeypot ? form.honeypot.value : '',
      form_started_at: Number(form.lead_form_started_at?.value || Date.now()),
      tracking: tracking
    };
    try {
      await postToApi('/api/lead', {
        type: 'prequal',
        service_interest: prequal.service_interest,
        zip: prequal.zip,
        dob: prequal.dob,
        enrolled: prequal.enrolled,
        contactConsent: prequal.contactConsent,
        honeypot: prequal.honeypot,
        form_started_at: prequal.form_started_at,
        tracking: prequal.tracking
      });
    } catch (error) {
      queueFailedSubmission({
        path: '/api/lead',
        payload: {
          type: 'prequal',
          service_interest: prequal.service_interest,
          zip: prequal.zip,
          dob: prequal.dob,
          enrolled: prequal.enrolled,
          contactConsent: prequal.contactConsent,
          honeypot: prequal.honeypot,
          form_started_at: prequal.form_started_at,
          tracking: prequal.tracking
        }
      });
    }

    localStorage.setItem('lead_prequal', JSON.stringify(prequal));
    localStorage.setItem('service_interest', form.service_interest.value);
    trackLeadStart();

    status.textContent = 'Thanks. Taking you to the full questionnaire...';
    status.focus();
    const selectedConfig = SERVICE_CONFIG[form.service_interest.value] || SERVICE_CONFIG.medicare;
    window.location.href = selectedConfig.questionnairePath;
  });

  const checklistForm = document.getElementById('checklist-form');
  const checklistStatus = document.getElementById('checklist-status');
  if (checklistForm && checklistStatus) {
    const checklistStartInput = document.getElementById('checklist_form_started_at');
    if (checklistStartInput) checklistStartInput.value = String(Date.now());

    checklistForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!checklistForm.checkValidity()) {
        checklistStatus.textContent = 'Please complete name, email, and consent.';
        checklistStatus.focus();
        return;
      }

      const payload = {
        type: 'checklist_request',
        service_interest: checklistForm.checklistService.value,
        name: checklistForm.checklistName.value.trim(),
        email: checklistForm.checklistEmail.value.trim(),
        consent: checklistForm.checklistConsent.checked ? 'yes' : 'no',
        honeypot: checklistForm.honeypot ? checklistForm.honeypot.value : '',
        form_started_at: Number(checklistForm.checklist_form_started_at?.value || Date.now()),
        tracking: tracking,
        timestamp: new Date().toISOString()
      };

      try {
        await postToApi('/api/checklist', payload);
      } catch (error) {
        queueFailedSubmission({ path: '/api/checklist', payload: payload });
        checklistStatus.textContent = 'Saved locally due to network issue. We will retry automatically.';
        checklistStatus.focus();
        return;
      }

      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', {
          lead_type: 'checklist',
          service_interest: checklistForm.checklistService.value,
          value: 1,
          currency: 'USD'
        });
      }

      localStorage.setItem('service_interest', checklistForm.checklistService.value);
      checklistStatus.textContent = 'Checklist sent. Your download is starting.';
      checklistStatus.focus();
      downloadChecklist();
      checklistForm.reset();
    });
  }
});
