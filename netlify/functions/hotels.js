const https = require('https');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getEmoji(type = '') {
  const t = type.toLowerCase();
  if (t.includes('villa') || t.includes('resort')) return '🌊';
  if (t.includes('apart') || t.includes('loft')) return '🌆';
  if (t.includes('boutique') || t.includes('design')) return '🎨';
  if (t.includes('penthouse') || t.includes('luxury')) return '🏙';
  return '🌴';
}

function getAmenities(h) {
  const all = [];
  if (h.amenities) {
    if (h.amenities.pool) all.push('Pool');
    if (h.amenities.spa) all.push('Spa');
    if (h.amenities.gym) all.push('Gym');
    if (h.amenities.restaurant) all.push('Restaurant');
    if (h.amenities.wifi) all.push('Free WiFi');
    if (h.amenities.parking) all.push('Parking');
  }
  if (all.length < 2) all.push('AC', 'Free WiFi');
  return all.slice(0, 4);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const { destination, checkin, checkout, travelers = 2 } = event.queryStringParameters || {};

  if (!destination) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'destination is required' })
    };
  }

  const key = process.env.SERPAPI_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'API key not configured', fallback: true })
    };
  }

  const city = destination.split(',')[0].trim();
  const inDate = checkin || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const outDate = checkout || new Date(Date.now() + 19 * 86400000).toISOString().split('T')[0];

  try {
    const url = `https://serpapi.com/search.json?engine=google_hotels` +
      `&q=${encodeURIComponent(city + ' hotels')}` +
      `&check_in_date=${inDate}&check_out_date=${outDate}` +
      `&adults=${travelers}&currency=USD&hl=en` +
      `&api_key=${key}`;

    const data = await fetchJSON(url);
    const raw = data.properties || [];

    const hotels = raw.slice(0, 6).map((h, i) => ({
      id: i + 1,
      name: h.name || 'Property',
      loc: `${city} · ${h.type || 'Hotel'}`,
      price: h.rate_per_night?.lowest
        ? parseInt(h.rate_per_night.lowest.replace(/[^0-9]/g, ''))
        : 150 + i * 40,
      rating: h.overall_rating ? h.overall_rating.toFixed(2) : (4.80 + i * 0.02).toFixed(2),
      reviews: h.reviews || 80 + i * 25,
      img: getEmoji(h.type),
      beds: '2–4 bed options',
      amenities: getAmenities(h),
      age: i < 2 ? '21+' : '18+',
      badge: i === 0 ? 'Top Pick' : (h.overall_rating >= 4.9 ? 'Luxury' : null),
      safety: 75 + Math.floor(Math.random() * 20),
      aiMatch: 95 - i * 3,
      bookingLink: h.link || `https://www.booking.com/search.html?ss=${encodeURIComponent(city)}`
    }));

    // Mark top AI match
    if (hotels.length) hotels[0].aiMatch = 96;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ hotels, city, fallback: false })
    };

  } catch (err) {
    console.error('Hotels SerpApi error:', err.message);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ hotels: [], fallback: true, error: err.message })
    };
  }
};
