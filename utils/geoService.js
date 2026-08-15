'use strict';

/**
 * Server-side geo resolution for legal audit trails.
 * GPS (when provided by browser) → reverse geocode; else IP lookup.
 */

function isPrivateIp(ip) {
  const clean = String(ip || '').replace(/^::ffff:/, '').trim();
  return (
    !clean ||
    clean === 'Unknown' ||
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean.startsWith('192.168.') ||
    clean.startsWith('10.') ||
    clean === 'localhost'
  );
}

async function getGeoFromIp(ip) {
  try {
    if (isPrivateIp(ip)) {
      return {
        city: 'Local', region: 'Local', country: 'Local Development',
        countryCode: 'XX', postalCode: '0000', timezone: 'UTC',
        latitude: '', longitude: '',
        display: 'Local Development',
        source: 'local',
      };
    }

    const clean = String(ip).replace(/^::ffff:/, '').trim();

    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 5000);
      const res  = await fetch(`https://ipapi.co/${clean}/json/`, {
        signal:  ctrl.signal,
        headers: { 'User-Agent': 'nexsign-app/1.0' },
      });
      clearTimeout(tid);
      if (res.ok) {
        const d = await res.json();
        if (!d.error) {
          return {
            city:        d.city         || '',
            region:      d.region       || '',
            country:     d.country_name || '',
            countryCode: d.country_code || '',
            postalCode:  d.postal       || '',
            timezone:    d.timezone     || '',
            latitude:    String(d.latitude  ?? ''),
            longitude:   String(d.longitude ?? ''),
            display:     [d.city, d.region, d.country_name, d.postal].filter(Boolean).join(', '),
            source:      'ip',
          };
        }
      }
    } catch (e) {
      console.warn('[geoService] ipapi.co failed:', e.message);
    }

    try {
      const ctrl2 = new AbortController();
      const tid2  = setTimeout(() => ctrl2.abort(), 5000);
      const res2  = await fetch(
        `http://ip-api.com/json/${clean}?fields=status,city,regionName,country,countryCode,zip,timezone,lat,lon`,
        { signal: ctrl2.signal },
      );
      clearTimeout(tid2);
      if (res2.ok) {
        const d2 = await res2.json();
        if (d2.status === 'success') {
          return {
            city:        d2.city        || '',
            region:      d2.regionName  || '',
            country:     d2.country     || '',
            countryCode: d2.countryCode || '',
            postalCode:  d2.zip         || '',
            timezone:    d2.timezone    || '',
            latitude:    String(d2.lat  ?? ''),
            longitude:   String(d2.lon  ?? ''),
            display:     [d2.city, d2.regionName, d2.country, d2.zip].filter(Boolean).join(', '),
            source:      'ip',
          };
        }
      }
    } catch (e) {
      console.warn('[geoService] ip-api.com failed:', e.message);
    }

    return null;
  } catch (e) {
    console.warn('[geoService] getGeoFromIp failed:', e.message);
    return null;
  }
}

async function reverseGeocode(latitude, longitude) {
  try {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    // 1. Try BigDataCloud reverse geocode client
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 4000);
      const url  = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res  = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);

      if (res.ok) {
        const d = await res.json();
        const city = d.city || d.locality || d.principalSubdivision || '';
        const region = d.principalSubdivision || d.localityInfo?.administrative?.[1]?.name || '';
        const country = d.countryName || '';
        const postal = d.postcode || '';

        if (city || country) {
          return {
            city,
            region,
            country,
            countryCode: d.countryCode || '',
            postalCode:  postal,
            timezone:    '',
            latitude:    String(lat),
            longitude:   String(lng),
            display:     [city, region, country].filter(Boolean).join(', ') + (postal ? ` (${postal})` : ''),
            source:      'gps',
          };
        }
      }
    } catch (e) {
      console.warn('[geoService] BigDataCloud reverse geocode failed:', e.message);
    }

    // 2. High-accuracy fallback: OpenStreetMap Nominatim
    try {
      const ctrl2 = new AbortController();
      const tid2  = setTimeout(() => ctrl2.abort(), 4000);
      const res2  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
        {
          signal:  ctrl2.signal,
          headers: { 'User-Agent': 'NexSign-App/2.0 (legal-audit@nexsign.com)' },
        },
      );
      clearTimeout(tid2);

      if (res2.ok) {
        const d2 = await res2.json();
        const addr = d2.address || {};
        const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
        const region = addr.state || addr.region || '';
        const country = addr.country || '';
        const postal = addr.postcode || '';

        return {
          city,
          region,
          country,
          countryCode: addr.country_code?.toUpperCase() || '',
          postalCode:  postal,
          timezone:    '',
          latitude:    String(lat),
          longitude:   String(lng),
          display:     [city, region, country].filter(Boolean).join(', ') + (postal ? ` (${postal})` : ''),
          source:      'gps',
        };
      }
    } catch (e2) {
      console.warn('[geoService] Nominatim reverse geocode failed:', e2.message);
    }

    // Fallback: return raw GPS coordinates
    return {
      city:        '',
      region:      '',
      country:     '',
      countryCode: '',
      postalCode:  '',
      timezone:    '',
      latitude:    String(lat),
      longitude:   String(lng),
      display:     `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      source:      'gps',
    };
  } catch (e) {
    console.warn('[geoService] reverseGeocode general failure:', e.message);
    return null;
  }
}

/** Prefer GPS reverse-geocode; fall back to IP. */
async function resolveSigningLocation(ip, latitude, longitude) {
  let geo = null;

  if (latitude != null && longitude != null && latitude !== '' && longitude !== '') {
    geo = await reverseGeocode(latitude, longitude);
    if (geo) {
      geo.latitude  = String(latitude);
      geo.longitude = String(longitude);
    }
  }

  if (!geo) {
    geo = await getGeoFromIp(ip);
  }

  return geo || {
    city: '', region: '', country: '', postalCode: '', timezone: '',
    latitude: latitude != null ? String(latitude) : '',
    longitude: longitude != null ? String(longitude) : '',
    display: 'Location unavailable',
    source: 'unknown',
  };
}

/** Normalize for AuditLog.location schema */
function toAuditLocation(geo, ip) {
  const g = geo || {};
  return {
    ip_address:  ip || null,
    city:        g.city        || null,
    region:      g.region      || null,
    country:     g.country     || null,
    country_code: g.countryCode || null,
    postal_code: g.postalCode  || null,
    timezone:    g.timezone    || null,
    latitude:    g.latitude    || null,
    longitude:   g.longitude   || null,
    display:     g.display     || [g.city, g.region, g.country].filter(Boolean).join(', ') || null,
    geo_source:  g.source      || null,
  };
}

/** Party/signer object for certificate PDF */
function toSignerAuditFields(geo, ip, deviceInfo, localTime) {
  const g = geo || {};
  return {
    ipAddress:       ip || '',
    city:            g.city        || '',
    region:          g.region      || '',
    country:         g.country     || '',
    postalCode:      g.postalCode  || '',
    timezone:        g.timezone    || '',
    latitude:        g.latitude    || '',
    longitude:       g.longitude   || '',
    geoSource:       g.source      || '',
    device:          deviceInfo?.device  || '',
    browser:         deviceInfo?.browser || '',
    os:              deviceInfo?.os      || '',
    localSignedTime: localTime || new Date().toUTCString(),
  };
}

module.exports = {
  getGeoFromIp,
  reverseGeocode,
  resolveSigningLocation,
  toAuditLocation,
  toSignerAuditFields,
};
