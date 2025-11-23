// Country name to flag emoji mapping
const COUNTRY_FLAGS = {
  "Afghanistan": "🇦🇫",
  "Albania": "🇦🇱",
  "Algeria": "🇩🇿",
  "Argentina": "🇦🇷",
  "Australia": "🇦🇺",
  "Austria": "🇦🇹",
  "Bangladesh": "🇧🇩",
  "Belgium": "🇧🇪",
  "Brazil": "🇧🇷",
  "Canada": "🇨🇦",
  "Chile": "🇨🇱",
  "China": "🇨🇳",
  "Colombia": "🇨🇴",
  "Czech Republic": "🇨🇿",
  "Denmark": "🇩🇰",
  "Egypt": "🇪🇬",
  "Europe": "🇪🇺",
  "Finland": "🇫🇮",
  "France": "🇫🇷",
  "Germany": "🇩🇪",
  "Greece": "🇬🇷",
  "Hong Kong": "🇭🇰",
  "Hungary": "🇭🇺",
  "India": "🇮🇳",
  "Indonesia": "🇮🇩",
  "Iran": "🇮🇷",
  "Iraq": "🇮🇶",
  "Ireland": "🇮🇪",
  "Israel": "🇮🇱",
  "Italy": "🇮🇹",
  "Japan": "🇯🇵",
  "Kenya": "🇰🇪",
  "Malaysia": "🇲🇾",
  "Mexico": "🇲🇽",
  "Netherlands": "🇳🇱",
  "New Zealand": "🇳🇿",
  "Nigeria": "🇳🇬",
  "Norway": "🇳🇴",
  "Pakistan": "🇵🇰",
  "Philippines": "🇵🇭",
  "Poland": "🇵🇱",
  "Portugal": "🇵🇹",
  "Romania": "🇷🇴",
  "Russia": "🇷🇺",
  "Saudi Arabia": "🇸🇦",
  "Singapore": "🇸🇬",
  "South Africa": "🇿🇦",
  "Korea": "🇰🇷",
  "South Korea": "🇰🇷",
  "Spain": "🇪🇸",
  "Sweden": "🇸🇪",
  "Switzerland": "🇨🇭",
  "Taiwan": "🇹🇼",
  "Thailand": "🇹🇭",
  "Turkey": "🇹🇷",
  "Ukraine": "🇺🇦",
  "United Arab Emirates": "🇦🇪",
  "United Kingdom": "🇬🇧",
  "United States": "🇺🇸",
  "Venezuela": "🇻🇪",
  "Vietnam": "🇻🇳"
};

// TODO: Add more regions, since users can select to either show the country or region / contient
const REGION_FLAGS = {
  "Europe": "🇪🇺",
  "West Asia": "🌏",
  "East Asia & Pacific": "🌏",
  "North America": "🌏"
}

function getCountryFlag(countryName) {
  if (!countryName) return null;
  
  // Try exact match first
  if (COUNTRY_FLAGS[countryName]) {
    return COUNTRY_FLAGS[countryName];
  }
  
  // Try case-insensitive match
  const normalized = countryName.trim();
  for (const [country, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (country.toLowerCase() === normalized.toLowerCase()) {
      return flag;
    }
  }

  if (REGION_FLAGS[countryName]) {
    return REGION_FLAGS[countryName];
  }

  // Try region match
  for (const [region, flag] of Object.entries(REGION_FLAGS)) {
    if (region.toLowerCase() === normalized.toLowerCase()) {
      return flag;
    }
  }
  
  return null;
}

