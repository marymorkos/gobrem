const https = require('https');
const querystring = require('querystring');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function twilioSMS(to, body) {
  return new Promise((resolve, reject) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    const data = querystring.stringify({ To: to, From: from, Body: body });
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');

    const options = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${sid}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { phone, city, email } = body;

  // Format phone — ensure +1 for US numbers
  let formattedPhone = phone ? phone.replace(/\D/g, '') : '';
  if (formattedPhone.length === 10) formattedPhone = '+1' + formattedPhone;
  else if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) formattedPhone = '+' + formattedPhone;
  else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

  const cityName = city || 'your destination';

  // SMS message
  const smsBody = `✦ BREM | Your ${cityName} Lookbook is on its way to ${email || 'your inbox'}!\n\nPlan your perfect trip at gobrem.com\n\nReply STOP to unsubscribe.`;

  try {
    if (phone && formattedPhone.length >= 10) {
      await twilioSMS(formattedPhone, smsBody);
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, sms: !!phone })
    };

  } catch (err) {
    console.error('Twilio error:', err.message);
    // Don't fail the whole request if SMS fails
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, sms: false, error: err.message })
    };
  }
};
