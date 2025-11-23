// Country name to flag emoji mapping (ISO 3166-1)
const COUNTRY_FLAGS = {
  // A
  "Afghanistan": "🇦🇫",
  "Albania": "🇦🇱",
  "Algeria": "🇩🇿",
  "Andorra": "🇦🇩",
  "Angola": "🇦🇴",
  "Antigua and Barbuda": "🇦🇬",
  "Argentina": "🇦🇷",
  "Armenia": "🇦🇲",
  "Australia": "🇦🇺",
  "Austria": "🇦🇹",
  "Azerbaijan": "🇦🇿",

  // B
  "Bahamas": "🇧🇸",
  "Bahrain": "🇧🇭",
  "Bangladesh": "🇧🇩",
  "Barbados": "🇧🇧",
  "Belarus": "🇧🇾",
  "Belgium": "🇧🇪",
  "Belize": "🇧🇿",
  "Benin": "🇧🇯",
  "Bhutan": "🇧🇹",
  "Bolivia": "🇧🇴",
  "Bosnia and Herzegovina": "🇧🇦",
  "Botswana": "🇧🇼",
  "Brazil": "🇧🇷",
  "Brunei": "🇧🇳",
  "Bulgaria": "🇧🇬",
  "Burkina Faso": "🇧🇫",
  "Burundi": "🇧🇮",

  // C
  "Cambodia": "🇰🇭",
  "Cameroon": "🇨🇲",
  "Canada": "🇨🇦",
  "Cape Verde": "🇨🇻",
  "Central African Republic": "🇨🇫",
  "Chad": "🇹🇩",
  "Chile": "🇨🇱",
  "China": "🇨🇳",
  "Colombia": "🇨🇴",
  "Comoros": "🇰🇲",
  "Congo": "🇨🇬",
  "Costa Rica": "🇨🇷",
  "Croatia": "🇭🇷",
  "Cuba": "🇨🇺",
  "Cyprus": "🇨🇾",
  "Czech Republic": "🇨🇿",
  "Czechia": "🇨🇿",

  // D
  "Democratic Republic of the Congo": "🇨🇩",
  "Denmark": "🇩🇰",
  "Djibouti": "🇩🇯",
  "Dominica": "🇩🇲",
  "Dominican Republic": "🇩🇴",

  // E
  "East Timor": "🇹🇱",
  "Ecuador": "🇪🇨",
  "Egypt": "🇪🇬",
  "El Salvador": "🇸🇻",
  "Equatorial Guinea": "🇬🇶",
  "Eritrea": "🇪🇷",
  "Estonia": "🇪🇪",
  "Eswatini": "🇸🇿",
  "Ethiopia": "🇪🇹",
  "Europe": "🇪🇺",

  // F
  "Fiji": "🇫🇯",
  "Finland": "🇫🇮",
  "France": "🇫🇷",

  // G
  "Gabon": "🇬🇦",
  "Gambia": "🇬🇲",
  "Georgia": "🇬🇪",
  "Germany": "🇩🇪",
  "Ghana": "🇬🇭",
  "Greece": "🇬🇷",
  "Grenada": "🇬🇩",
  "Guatemala": "🇬🇹",
  "Guinea": "🇬🇳",
  "Guinea-Bissau": "🇬🇼",
  "Guyana": "🇬🇾",

  // H
  "Haiti": "🇭🇹",
  "Honduras": "🇭🇳",
  "Hong Kong": "🇭🇰",
  "Hungary": "🇭🇺",

  // I
  "Iceland": "🇮🇸",
  "India": "🇮🇳",
  "Indonesia": "🇮🇩",
  "Iran": "🇮🇷",
  "Iraq": "🇮🇶",
  "Ireland": "🇮🇪",
  "Israel": "🇮🇱",
  "Italy": "🇮🇹",
  "Ivory Coast": "🇨🇮",

  // J
  "Jamaica": "🇯🇲",
  "Japan": "🇯🇵",
  "Jordan": "🇯🇴",

  // K
  "Kazakhstan": "🇰🇿",
  "Kenya": "🇰🇪",
  "Kiribati": "🇰🇮",
  "Korea": "🇰🇷",
  "Kosovo": "🇽🇰",
  "Kuwait": "🇰🇼",
  "Kyrgyzstan": "🇰🇬",

  // L
  "Laos": "🇱🇦",
  "Latvia": "🇱🇻",
  "Lebanon": "🇱🇧",
  "Lesotho": "🇱🇸",
  "Liberia": "🇱🇷",
  "Libya": "🇱🇾",
  "Liechtenstein": "🇱🇮",
  "Lithuania": "🇱🇹",
  "Luxembourg": "🇱🇺",

  // M
  "Macao": "🇲🇴",
  "Madagascar": "🇲🇬",
  "Malawi": "🇲🇼",
  "Malaysia": "🇲🇾",
  "Maldives": "🇲🇻",
  "Mali": "🇲🇱",
  "Malta": "🇲🇹",
  "Marshall Islands": "🇲🇭",
  "Mauritania": "🇲🇷",
  "Mauritius": "🇲🇺",
  "Mexico": "🇲🇽",
  "Micronesia": "🇫🇲",
  "Moldova": "🇲🇩",
  "Monaco": "🇲🇨",
  "Mongolia": "🇲🇳",
  "Montenegro": "🇲🇪",
  "Morocco": "🇲🇦",
  "Mozambique": "🇲🇿",
  "Myanmar": "🇲🇲",

  // N
  "Namibia": "🇳🇦",
  "Nauru": "🇳🇷",
  "Nepal": "🇳🇵",
  "Netherlands": "🇳🇱",
  "New Zealand": "🇳🇿",
  "Nicaragua": "🇳🇮",
  "Niger": "🇳🇪",
  "Nigeria": "🇳🇬",
  "North Korea": "🇰🇵",
  "North Macedonia": "🇲🇰",
  "Norway": "🇳🇴",

  // O
  "Oman": "🇴🇲",

  // P
  "Pakistan": "🇵🇰",
  "Palau": "🇵🇼",
  "Palestine": "🇵🇸",
  "Panama": "🇵🇦",
  "Papua New Guinea": "🇵🇬",
  "Paraguay": "🇵🇾",
  "Peru": "🇵🇪",
  "Philippines": "🇵🇭",
  "Poland": "🇵🇱",
  "Portugal": "🇵🇹",
  "Puerto Rico": "🇵🇷",

  // Q
  "Qatar": "🇶🇦",

  // R
  "Romania": "🇷🇴",
  "Russia": "🇷🇺",
  "Rwanda": "🇷🇼",

  // S
  "Saint Kitts and Nevis": "🇰🇳",
  "Saint Lucia": "🇱🇨",
  "Saint Vincent and the Grenadines": "🇻🇨",
  "Samoa": "🇼🇸",
  "San Marino": "🇸🇲",
  "Sao Tome and Principe": "🇸🇹",
  "Saudi Arabia": "🇸🇦",
  "Senegal": "🇸🇳",
  "Serbia": "🇷🇸",
  "Seychelles": "🇸🇨",
  "Sierra Leone": "🇸🇱",
  "Singapore": "🇸🇬",
  "Slovakia": "🇸🇰",
  "Slovenia": "🇸🇮",
  "Solomon Islands": "🇸🇧",
  "Somalia": "🇸🇴",
  "South Africa": "🇿🇦",
  "South Korea": "🇰🇷",
  "South Sudan": "🇸🇸",
  "Spain": "🇪🇸",
  "Sri Lanka": "🇱🇰",
  "Sudan": "🇸🇩",
  "Suriname": "🇸🇷",
  "Sweden": "🇸🇪",
  "Switzerland": "🇨🇭",
  "Syria": "🇸🇾",

  // T
  "Taiwan": "🇹🇼",
  "Tajikistan": "🇹🇯",
  "Tanzania": "🇹🇿",
  "Thailand": "🇹🇭",
  "Timor-Leste": "🇹🇱",
  "Togo": "🇹🇬",
  "Tonga": "🇹🇴",
  "Trinidad and Tobago": "🇹🇹",
  "Tunisia": "🇹🇳",
  "Turkey": "🇹🇷",
  "Turkmenistan": "🇹🇲",
  "Tuvalu": "🇹🇻",

  // U
  "Uganda": "🇺🇬",
  "Ukraine": "🇺🇦",
  "United Arab Emirates": "🇦🇪",
  "United Kingdom": "🇬🇧",
  "United States": "🇺🇸",
  "Uruguay": "🇺🇾",
  "Uzbekistan": "🇺🇿",

  // V
  "Vanuatu": "🇻🇺",
  "Vatican City": "🇻🇦",
  "Venezuela": "🇻🇪",
  "Vietnam": "🇻🇳",

  // Y
  "Yemen": "🇾🇪",

  // Z
  "Zambia": "🇿🇲",
  "Zimbabwe": "🇿🇼"
};

// Country name aliases and abbreviations
const COUNTRY_ALIASES = {
  'USA': 'United States',
  'US': 'United States',
  'U.S.': 'United States',
  'U.S.A.': 'United States',
  'America': 'United States',

  'UK': 'United Kingdom',
  'U.K.': 'United Kingdom',
  'Britain': 'United Kingdom',
  'Great Britain': 'United Kingdom',
  'England': 'United Kingdom',
  'Scotland': 'United Kingdom',
  'Wales': 'United Kingdom',

  'UAE': 'United Arab Emirates',
  'U.A.E.': 'United Arab Emirates',

  'ROK': 'South Korea',
  'Republic of Korea': 'South Korea',

  'DPRK': 'North Korea',
  'Democratic People\'s Republic of Korea': 'North Korea',

  'PRC': 'China',
  'People\'s Republic of China': 'China',

  'ROC': 'Taiwan',
  'Republic of China': 'Taiwan',
  'Chinese Taipei': 'Taiwan',

  'HK': 'Hong Kong',

  'EU': 'Europe',
  'European Union': 'Europe',
};

/**
 * Parse location string to extract country name
 * Handles formats like:
 * - "United States"
 * - "New York, USA"
 * - "London, UK"
 * - "San Francisco, CA"
 * @param {string} location - Location string to parse
 * @returns {string|null} - Extracted country name or null
 */
function parseLocationString(location) {
  if (!location) return null;

  const trimmed = location.trim();

  // Check if it contains a comma (city, country format)
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim());

    // Try last part first (most likely country)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];

      // Skip US state codes (2 uppercase letters)
      if (/^[A-Z]{2}$/.test(part)) {
        continue;
      }

      // Try to match this part
      const matched = matchCountryName(part);
      if (matched) {
        return matched;
      }
    }
  }

  // Try matching the whole string
  return matchCountryName(trimmed);
}

/**
 * Match a country name string against the flags database
 * Supports exact matches, case-insensitive matches, and aliases
 * @param {string} countryName - Country name to match
 * @returns {string|null} - Matched country name or null
 */
function matchCountryName(countryName) {
  if (!countryName) return null;

  const trimmed = countryName.trim();

  // Try exact match first
  if (COUNTRY_FLAGS[trimmed]) {
    return trimmed;
  }

  // Try alias match
  if (COUNTRY_ALIASES[trimmed]) {
    return COUNTRY_ALIASES[trimmed];
  }

  // Try case-insensitive alias match
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (alias.toLowerCase() === trimmed.toLowerCase()) {
      return country;
    }
  }

  // Try case-insensitive country match
  for (const country of Object.keys(COUNTRY_FLAGS)) {
    if (country.toLowerCase() === trimmed.toLowerCase()) {
      return country;
    }
  }

  // Try partial match (country name contains the search term or vice versa)
  const lowerTrimmed = trimmed.toLowerCase();
  for (const country of Object.keys(COUNTRY_FLAGS)) {
    const lowerCountry = country.toLowerCase();
    if (lowerCountry.includes(lowerTrimmed) || lowerTrimmed.includes(lowerCountry)) {
      return country;
    }
  }

  return null;
}

/**
 * Get country flag emoji for a given location string
 * @param {string} location - Location string (can be country name or "City, Country" format)
 * @returns {string|null} - Flag emoji or null if not found
 */
function getCountryFlag(location) {
  if (!location) return null;

  // Parse the location string to extract country name
  const countryName = parseLocationString(location);
  if (!countryName) return null;

  // Return the flag
  return COUNTRY_FLAGS[countryName] || null;
}

