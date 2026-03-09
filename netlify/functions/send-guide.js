// netlify/functions/send-guide.js
// Sends the BREM Lookbook SMS when a user downloads a guide
// Requires env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

const GUIDE_ANCHORS = {
  'Miami':           'miami',
  'Nashville':       'nashville',
  'Cancún & Tulum':  'cancuntulum',
  'Paris':           'paris',
  'Bali':            'bali',
  'Dubai':           'dubai',
  'Santorini':       'santorini',
  'Cape Town':       'capetown',
};

function buildMessage(city) {
  const anchor = GUIDE_ANCHORS[city] || city.toLowerCase().replace(/[^a-z]/g, '');
  const link = `https://gobrem.com/lookbook#lb-${anchor}`;
  return `✦ Your ${city} guide has arrived.\n\nCurated stays, experiences & insider tips — selected for the woman who travels well.\n\n${link}\n\nReply STOP to unsubscribe.`;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { phone, email, city } = body;

  if (!phone || !city) {
    return { statusCode: 400, body: 'Missing phone or city' };
  }

  // Sanitize phone to E.164 format
  let to = phone.replace(/\D/g, '');
  if (to.length === 10) to = '+1' + to;
  else if (to.length === 11 && to.startsWith('1')) to = '+' + to;
  else to = '+' + to;

  const message = buildMessage(city);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.error('Missing Twilio env vars');
    return { statusCode: 500, body: 'SMS not configured' };
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', from);
    params.append('Body', message);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: result.message }) };
    }

    console.log(`SMS sent to ${to} for ${city} guide. SID: ${result.sid}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sid: result.sid }),
    };

  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
