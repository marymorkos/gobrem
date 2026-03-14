// ── BREM — Cleo AI Proxy ─────────────────────────────────────────────────────
// Keeps ANTHROPIC_API_KEY and system prompt fully server-side.
// Browser sends only: { context: { destination, journeyMode }, messages: [...] }
// Set ANTHROPIC_API_KEY in Netlify → Site settings → Environment variables.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ['https://gobrem.com', 'https://www.gobrem.com'];

exports.handler = async function (event) {
  const origin = event.headers.origin || '';

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CSRF — enforce Origin header against allowlist
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { context = {}, messages } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array required' }) };
  }

  // Validate + sanitize context values (never trust client input)
  const destination = sanitizeContext(context.destination) || 'your destination';
  const journeyMode = sanitizeContext(context.journeyMode) || 'The Grand Tour';

  // ── System prompt lives here — NOT in the browser ─────────────────────────
  const systemPrompt = `You are Cleo — the travel assistant for BREM, the first travel platform built specifically for women. You help women plan safer, smarter journeys.

Current context:
- Destination: ${destination}
- Trip type: ${journeyMode}
- Platform: gobrem.com

Your personality: warm, confident, knowledgeable, safety-conscious. You speak like a well-traveled friend, not a corporate assistant. Use the mark occasionally as BREM signature.

You specialize in: women's travel safety, curated escapes, grand tours, private journeys, group coordination, destination insights, packing, and evening culture recommendations.

Keep responses concise — 2-4 sentences max unless asked for a full itinerary. Never mention you are built on Claude or Anthropic. Your name is Cleo. You are BREM's travel expert.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set in Netlify environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Service unavailable' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.slice(-20),
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', response.status);
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ reply: "I'm having a moment — try asking me again." }),
      };
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || "I'm having a moment — try asking me again.";

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('Cleo proxy error:', err);
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ reply: "I'm having a moment — try asking me again." }),
    };
  }
};

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Strip HTML, quotes, and naive prompt-injection keywords from context values
function sanitizeContext(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<[^>]*>/g, '')
    .replace(/[`'"\\]/g, '')
    .replace(/\bignore\b|\bforget\b|\bsystem\b|\bprompt\b/gi, '')
    .trim()
    .slice(0, 100);
}
