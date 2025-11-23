// countryFlags.js - Complete & Working Version (2025)

// Mapping: Country name → ISO code (or special code)
const COUNTRY_FLAGS = {
  "Afghanistan": "AF", "Albania": "AL", "Algeria": "DZ", "Andorra": "AD", "Angola": "AO",
  "Antigua and Barbuda": "AG", "Argentina": "AR", "Armenia": "AM", "Australia": "AU",
  "Austria": "AT", "Azerbaijan": "AZ", "Bahamas": "BS", "Bahrain": "BH", "Bangladesh": "BD",
  "Barbados": "BB", "Belarus": "BY", "Belgium": "BE", "Belize": "BZ", "Benin": "BJ",
  "Bhutan": "BT", "Bolivia": "BO", "Bosnia and Herzegovina": "BA", "Botswana": "BW",
  "Brazil": "BR", "Brunei": "BN", "Bulgaria": "BG", "Burkina Faso": "BF", "Burundi": "BI",
  "Cabo Verde": "CV", "Cambodia": "KH", "Cameroon": "CM", "Canada": "CA",
  "Central African Republic": "CF", "Chad": "TD", "Chile": "CL", "China": "CN",
  "Colombia": "CO", "Comoros": "KM", "Congo": "CG", "Democratic Republic of the Congo": "CD",
  "DR Congo": "CD", "Costa Rica": "CR", "Côte d'Ivoire": "CI", "Ivory Coast": "CI",
  "Croatia": "HR", "Cuba": "CU", "Cyprus": "CY", "Czechia": "CZ", "Czech Republic": "CZ",
  "Denmark": "DK", "Djibouti": "DJ", "Dominica": "DM", "Dominican Republic": "DO",
  "Ecuador": "EC", "Egypt": "EG", "El Salvador": "SV", "Equatorial Guinea": "GQ",
  "Eritrea": "ER", "Estonia": "EE", "Eswatini": "SZ", "Ethiopia": "ET", "Fiji": "FJ",
  "Finland": "FI", "France": "FR", "Gabon": "GA", "Gambia": "GM", "Georgia": "GE",
  "Germany": "DE", "Ghana": "GH", "Greece": "GR", "Grenada": "GD", "Guatemala": "GT",
  "Guinea": "GN", "Guinea-Bissau": "GW", "Guyana": "GY", "Haiti": "HT", "Honduras": "HN",
  "Hungary": "HU", "Iceland": "IS", "India": "IN", "Indonesia": "ID", "Iran": "IR",
  "Iraq": "IQ", "Ireland": "IE", "Israel": "IL", "Italy": "IT", "Jamaica": "JM",
  "Japan": "JP", "Jordan": "JO", "Kazakhstan": "KZ", "Kenya": "KE", "Kiribati": "KI",
  "Kosovo": "XK", "Kuwait": "KW", "Kyrgyzstan": "KG", "Laos": "LA", "Latvia": "LV",
  "Lebanon": "LB", "Lesotho": "LS", "Liberia": "LR", "Libya": "LY", "Liechtenstein": "LI",
  "Lithuania": "LT", "Luxembourg": "LU", "Madagascar": "MG", "Malawi": "MW",
  "Malaysia": "MY", "Maldives": "MV", "Mali": "ML", "Malta": "MT", "Marshall Islands": "MH",
  "Mauritania": "MR", "Mauritius": "MU", "Mexico": "MX", "Micronesia": "FM", "Moldova": "MD",
  "Monaco": "MC", "Mongolia": "MN", "Montenegro": "ME", "Morocco": "MA", "Mozambique": "MZ",
  "Myanmar": "MM", "Namibia": "NA", "Nauru": "NR", "Nepal": "NP", "Netherlands": "NL",
  "New Zealand": "NZ", "Nicaragua": "NI", "Niger": "NE", "Nigeria": "NG",
  "North Korea": "KP", "North Macedonia": "MK", "Norway": "NO", "Oman": "OM",
  "Pakistan": "PK", "Palau": "PW", "Palestine": "PS", "Panama": "PA",
  "Papua New Guinea": "PG", "Paraguay": "PY", "Peru": "PE", "Philippines": "PH",
  "Poland": "PL", "Portugal": "PT", "Qatar": "QA", "Romania": "RO", "Russia": "RU",
  "Rwanda": "RW", "Saint Kitts and Nevis": "KN", "Saint Lucia": "LC",
  "Saint Vincent and the Grenadines": "VC", "Samoa": "WS", "San Marino": "SM",
  "Sao Tome and Principe": "ST", "Saudi Arabia": "SA", "Senegal": "SN", "Serbia": "RS",
  "Seychelles": "SC", "Sierra Leone": "SL", "Singapore": "SG", "Slovakia": "SK",
  "Slovenia": "SI", "Solomon Islands": "SB", "Somalia": "SO", "South Africa": "ZA",
  "South Korea": "KR", "Korea": "KR", "South Sudan": "SS", "Spain": "ES",
  "Sri Lanka": "LK", "Sudan": "SD", "Suriname": "SR", "Sweden": "SE", "Switzerland": "CH",
  "Syria": "SY", "Taiwan": "TW", "Tajikistan": "TJ", "Tanzania": "TZ", "Thailand": "TH",
  "Timor-Leste": "TL", "East Timor": "TL", "Togo": "TG", "Tonga": "TO",
  "Trinidad and Tobago": "TT", "Tunisia": "TN", "Turkey": "TR", "Turkmenistan": "TM",
  "Tuvalu": "TV", "Uganda": "UG", "Ukraine": "UA", "United Arab Emirates": "AE", "UAE": "AE",
  "United Kingdom": "GB", "UK": "GB", "Great Britain": "GB", "Britain": "GB",
  "United States": "US", "USA": "US", "America": "US", "Uruguay": "UY", "Uzbekistan": "UZ",
  "Vanuatu": "VU", "Vatican City": "VA", "Venezuela": "VE", "Vietnam": "VN",
  "Yemen": "YE", "Zambia": "ZM", "Zimbabwe": "ZW",

  // Special regions
  "Europe": "EU", "European Union": "EU", "EU": "EU",
  "Hong Kong": "HK", "Macau": "MO", "Puerto Rico": "PR",

  // UK nations (special subdivision flags)
  "England": "ENG",
  "Scotland": "SCT",
  "Wales": "WAL",
  "Northern Ireland": "GB" // fallback to UK flag
};

// Convert valid 2-letter ISO code → real flag emoji
function codeToFlag(code) {
  if (code.length !== 2) return null;
  const base = 0x1F1E6;
  const A = 'A'.charCodeAt(0);
  const c1 = code.charCodeAt(0) - A;
  const c2 = code.charCodeAt(1) - A;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return null;
  return String.fromCodePoint(base + c1, base + c2);
}

// Hardcoded special flags (these can't be generated with codeToFlag)
const SPECIAL_FLAG_EMOJIS = {
  "XK": "XK",     // Kosovo
  "EU": "EU",     // European Union
  "ENG": "gbeng", // England
  "SCT": "gbsct", // Scotland
  "WAL": "gbwls"  // Wales
};

// Main function used by content.js
function getCountryFlag(countryName) {
  if (!countryName) return null;
  const name = countryName.trim();

  // Exact match
  if (COUNTRY_FLAGS[name]) {
    const code = COUNTRY_FLAGS[name];
    return SPECIAL_FLAG_EMOJIS[code] || codeToFlag(code);
  }

  // Case-insensitive fallback
  const lower = name.toLowerCase();
  for (const [key, code] of Object.entries(COUNTRY_FLAGS)) {
    if (key.toLowerCase() === lower || key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return SPECIAL_FLAG_EMOJIS[code] || codeToFlag(code);
    }
  }

  return null;
}

// THIS LINE MUST BE AT THE VERY END
window.getCountryFlag = getCountryFlag;

console.log("countryFlags.js loaded – getCountryFlag() is now available globally");