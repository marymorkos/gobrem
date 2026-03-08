const https = require('https');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

// Map city names to IATA airport codes
const cityToIATA = {
  'new york': 'JFK', 'los angeles': 'LAX', 'chicago': 'ORD',
  'houston': 'IAH', 'atlanta': 'ATL', 'miami': 'MIA',
  'dallas': 'DFW', 'san francisco': 'SFO', 'seattle': 'SEA',
  'boston': 'BOS', 'washington': 'DCA', 'philadelphia': 'PHL',
  'phoenix': 'PHX', 'denver': 'DEN', 'las vegas': 'LAS',
  'orlando': 'MCO', 'charlotte': 'CLT', 'nashville': 'BNA',
  'austin': 'AUS', 'portland': 'PDX', 'london': 'LHR',
  'paris': 'CDG', 'tokyo': 'NRT', 'dubai': 'DXB',
  'bali': 'DPS', 'cairo': 'CAI', 'rome': 'FCO',
  'barcelona': 'BCN', 'amsterdam': 'AMS', 'sydney': 'SYD',
  'toronto': 'YYZ', 'cancun': 'CUN', 'mexico city': 'MEX',
  'istanbul': 'IST', 'seoul': 'ICN', 'singapore': 'SIN',
  'cape town': 'CPT', 'marrakech': 'RAK', 'lisbon': 'LIS',
  'santorini': 'JTR', 'florence': 'FLR', 'milan': 'MXP',
  'rio de janeiro': 'GIG', 'buenos aires': 'EZE',
  'reykjavik': 'KEF', 'prague': 'PRG', 'vienna': 'VIE',
  'porto': 'OPO', 'nice': 'NCE', 'phuket': 'HKT',
  'bangkok': 'BKK', 'nairobi': 'NBO', 'zanzibar': 'ZNZ',
  'havana': 'HAV', 'cartagena': 'CTG', 'san juan': 'SJU',
  'playa del carmen': 'CUN', 'ibiza': 'IBZ', 'new orleans': 'MSY'
};

function getIATA(city) {
  const key = city.toLowerCase().split(',')[0].trim();
  return cityToIATA[key] || key.toUpperCase().slice(0, 3);
}

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const { from, to, date, travelers = 2 } = event.queryStringParameters || {};

  if (!from || !to) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'from and to are required' })
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

  const depCode = getIATA(from);
  const arrCode = getIATA(to);
  const depDate = date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  try {
    const url = `https://serpapi.com/search.json?engine=google_flights` +
      `&departure_id=${depCode}&arrival_id=${arrCode}` +
      `&outbound_date=${depDate}&adults=${travelers}` +
      `&currency=USD&hl=en&api_key=${key}`;

    const data = await fetchJSON(url);
    const raw = data.best_flights || data.other_flights || [];

    const flights = raw.slice(0, 6).map(f => {
      const leg = f.flights?.[0] || {};
      return {
        airline: leg.airline || 'Airline',
        flightNum: leg.flight_number || '',
        from: leg.departure_airport?.id || depCode,
        to: leg.arrival_airport?.id || arrCode,
        departs: leg.departure_airport?.time || '',
        arrives: leg.arrival_airport?.time || '',
        duration: f.total_duration ? `${Math.floor(f.total_duration/60)}h ${f.total_duration%60}m` : '',
        price: f.price || 0,
        stops: f.flights?.length - 1 || 0,
        emissions: f.carbon_emissions?.this_flight || null,
        aiPick: false
      };
    });

    // Mark cheapest as AI pick
    if (flights.length) {
      const cheapest = flights.reduce((a, b) => a.price < b.price ? a : b);
      cheapest.aiPick = true;
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        flights,
        from: depCode,
        to: arrCode,
        date: depDate,
        fallback: false
      })
    };

  } catch (err) {
    console.error('SerpApi error:', err.message);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ flights: [], fallback: true, error: err.message })
    };
  }
};
