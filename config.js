// Configuration constants for Twitter Location Flag extension

const CONFIG = {
  // API Configuration
  API: {
    ENDPOINT: 'https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery',
    QUERY_ID: 'XRqGa7EeokUU5kppkh13EA',
    TIMEOUT: 10000, // 10 seconds
  },

  // Cache Configuration
  CACHE: {
    KEY: 'twitter_location_cache',
    EXPIRY_DAYS: 30,
    SAVE_DEBOUNCE_MS: 5000, // Save cache every 5 seconds
    PERIODIC_SAVE_INTERVAL_MS: 30000, // Save cache every 30 seconds
  },

  // Rate Limiting Configuration
  RATE_LIMIT: {
    MIN_REQUEST_INTERVAL_MS: 2000, // 2 seconds between requests
    MAX_CONCURRENT_REQUESTS: 2,
    CHECK_INTERVAL_MS: 60000, // Check rate limit status every minute
  },

  // DOM Processing Configuration
  PROCESSING: {
    INITIAL_DELAY_MS: 2000, // Wait 2 seconds after page load
    OBSERVER_DEBOUNCE_MS: 500, // Debounce observer by 500ms
    DUPLICATE_CHECK_DELAY_MS: 500, // Wait for duplicate processing check
    RETRY_ON_NAVIGATION_DELAY_MS: 2000, // Retry after navigation
  },

  // Extension State
  STATE: {
    TOGGLE_KEY: 'extension_enabled',
    DEFAULT_ENABLED: true,
  },

  // UI Configuration
  UI: {
    FLAG_MARGIN_LEFT: '4px',
    FLAG_MARGIN_RIGHT: '4px',
    FLAG_DISPLAY: 'inline',
    FLAG_VERTICAL_ALIGN: 'middle',

    SHIMMER_WIDTH: '20px',
    SHIMMER_HEIGHT: '16px',
    SHIMMER_BORDER_RADIUS: '2px',
    SHIMMER_ANIMATION_DURATION: '1.5s',
  },

  // Username Validation
  USERNAME: {
    MAX_LENGTH: 20,
    MIN_LENGTH: 1,
    EXCLUDED_ROUTES: [
      'home',
      'explore',
      'notifications',
      'messages',
      'i',
      'compose',
      'search',
      'settings',
      'bookmarks',
      'lists',
      'communities',
      'hashtag',
    ],
  },

  // Debug Configuration
  DEBUG: {
    ENABLED: false, // Set to true to enable debug logging
    LOG_API_REQUESTS: false,
    LOG_CACHE_OPERATIONS: false,
    LOG_USERNAME_EXTRACTION: false,
    LOG_FLAG_INSERTION: false,
  },
};

// Country name normalization mappings
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

  'Korea': 'South Korea',
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

// Page script events
const EVENTS = {
  FETCH_LOCATION: '__fetchLocation',
  LOCATION_RESPONSE: '__locationResponse',
  RATE_LIMIT_INFO: '__rateLimitInfo',
};

// DOM selectors
const SELECTORS = {
  TWEET: 'article[data-testid="tweet"]',
  USER_CELL: '[data-testid="UserCell"]',
  USER_NAMES: '[data-testid="User-Names"]',
  USER_NAME: '[data-testid="User-Name"]',
  USERNAME: '[data-testid="UserName"], [data-testid="User-Name"]',
  VERIFICATION_BADGE: '[data-testid="icon-verified"]',
  FLAG_ATTR: 'data-twitter-flag',
  FLAG_SHIMMER_ATTR: 'data-twitter-flag-shimmer',
  FLAG_ADDED_ATTR: 'data-flag-added',
  SHIMMER_STYLE_ID: 'twitter-flag-shimmer-style',
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, COUNTRY_ALIASES, EVENTS, SELECTORS };
}
