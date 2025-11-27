// Cache for user locations - persistent storage
let locationCache = new Map();
const CACHE_KEY = 'twitter_location_cache';
const CACHE_EXPIRY_DAYS = 30; // Cache for 30 days

// Rate limiting
const requestQueue = [];
let isProcessingQueue = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests (increased to avoid rate limits)
const MAX_CONCURRENT_REQUESTS = 2; // Reduced concurrent requests
let activeRequests = 0;
let rateLimitResetTime = 0; // Unix timestamp when rate limit resets

// Observer for dynamically loaded content
let observer = null;

// Extension enabled state
let extensionEnabled = true;
const TOGGLE_KEY = 'extension_enabled';
const DEFAULT_ENABLED = true;

// Display mode state
const MODE_KEY = 'display_mode';
const MODE_AUTO = 'auto';
const MODE_MANUAL = 'manual';
let displayMode = MODE_AUTO;

// Track usernames currently being processed to avoid duplicate requests
const processingUsernames = new Set();

const VPN_ICON = '\uD83D\uDEE1';
const INFO_ICON = '\u2139\uFE0F';
const ACCURATE_ICON = '\u2705';
const UNKNOWN_ICON = '\u2022';
const ACCURACY_DISCLAIMER = 'The country or region that an account is based can be impacted by recent travel or temporary relocation. This data may not be accurate and can change periodically.';

function deriveCountryFromSource(source) {
  if (!source || typeof source !== 'string') {
    return null;
  }

  const normalized = source.trim();
  if (normalized && getCountryFlag(normalized)) {
    return normalized;
  }

  const sanitized = normalized
    .replace(/App Store/gi, '')
    .replace(/Google Play/gi, '')
    .replace(/Android App/gi, '')
    .replace(/Android/gi, '')
    .replace(/iOS App/gi, '')
    .replace(/iOS/gi, '')
    .replace(/App/gi, '')
    .replace(/Google/gi, '')
    .replace(/Web/gi, '')
    .replace(/[,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (sanitized && getCountryFlag(sanitized)) {
    return sanitized;
  }

  const lowerSource = sanitized.toLowerCase();
  for (const country of Object.keys(COUNTRY_FLAGS)) {
    if (lowerSource.includes(country.toLowerCase())) {
      return country;
    }
  }

  return null;
}

function normalizeLocationData(data) {
  if (data == null) {
    return null;
  }

  if (data.locationData) {
    return normalizeLocationData(data.locationData);
  }

  if (typeof data === 'string') {
    return {
      location: data,
      source: null,
      sourceCountry: null,
      locationAccurate: null,
      learnMoreUrl: null
    };
  }

  const normalized = {
    location: typeof data.location === 'string'
      ? data.location.trim()
      : (typeof data.account_based_in === 'string' ? data.account_based_in.trim() : data.account_based_in ?? null),
    source: typeof data.source === 'string'
      ? data.source.trim()
      : (typeof data.source_country === 'string' ? data.source_country.trim() : data.source ?? null),
    sourceCountry: data.sourceCountry ?? data.source_country ?? null,
    locationAccurate: data.locationAccurate !== undefined ? data.locationAccurate :
      (data.location_accurate !== undefined ? data.location_accurate : null),
    learnMoreUrl: data.learnMoreUrl ?? data.learn_more_url ?? null
  };

  if (!normalized.sourceCountry) {
    normalized.sourceCountry = deriveCountryFromSource(normalized.source);
  }

  return normalized;
}

function buildLocationDisplayInfo(data) {
  if (!data) {
    return null;
  }

  const trimmedLocation = typeof data.location === 'string' ? data.location.trim() : data.location;
  const trimmedSource = typeof data.source === 'string' ? data.source.trim() : data.source;
  const sourceCountry = data.sourceCountry || deriveCountryFromSource(trimmedSource);
  const locationFlag = trimmedLocation ? getCountryFlag(trimmedLocation) : null;
  const sourceFlag = sourceCountry ? getCountryFlag(sourceCountry) : null;
  const isVpn = Boolean(
    data.location && sourceCountry && data.location !== sourceCountry
  );

  return {
    ...data,
    sourceCountry,
    locationFlag,
    sourceFlag,
    isVpn
  };
}

function createBadgeSpan({ text, title, dataset = {} }) {
  const span = document.createElement('span');
  span.textContent = text;
  span.style.display = 'inline-flex';
  span.style.alignItems = 'center';
  span.style.verticalAlign = 'middle';
  span.style.marginLeft = '2px';
  span.style.marginRight = '2px';
  span.style.fontSize = '0.95em';
  span.style.lineHeight = '1';
  if (title) {
    span.title = title;
  }
  Object.entries(dataset).forEach(([key, value]) => {
    span.dataset[key] = value;
  });
  if (dataset.twitterFlag === 'true') {
    span.setAttribute('data-twitter-flag', 'true');
  }
  return span;
}

function createFlagElement(symbol, title) {
  if (!symbol) {
    return null;
  }
  return createBadgeSpan({
    text: symbol,
    title,
    dataset: { twitterFlag: 'true', flagType: 'country' }
  });
}

function createBracketWrapper() {
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-twitter-flag-wrapper', 'true');
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '4px';
  wrapper.style.marginLeft = '4px';
  wrapper.style.marginRight = '4px';
  wrapper.style.fontSize = '0.95em';
  wrapper.style.verticalAlign = 'middle';
  return wrapper;
}

function createTextSegment(text, title) {
  const span = document.createElement('span');
  span.textContent = text;
  if (title) {
    span.title = title;
  }
  span.style.display = 'inline-flex';
  span.style.alignItems = 'center';
  span.style.verticalAlign = 'middle';
  span.style.marginLeft = '2px';
  span.style.marginRight = '2px';
  return span;
}

function createIndicatorSegment(displayInfo) {
  if (displayInfo.isVpn) {
    return createBadgeSpan({
      text: VPN_ICON,
      title: 'Account-based location differs from source (possible VPN/proxy)',
      dataset: { twitterFlag: 'true', flagType: 'vpn' }
    });
  }

  if (displayInfo.locationAccurate === false) {
    return createBadgeSpan({
      text: INFO_ICON,
      title: displayInfo.learnMoreUrl ? `${ACCURACY_DISCLAIMER} (click to learn more)` : ACCURACY_DISCLAIMER,
      dataset: { twitterFlag: 'true', flagType: 'info' }
    });
  }

  return createBadgeSpan({
    text: ACCURATE_ICON,
    title: 'Location is marked accurate',
    dataset: { twitterFlag: 'true', flagType: 'accuracy' }
  });
}

function buildBracketedDisplay(displayInfo) {
  const wrapper = createBracketWrapper();

  const accountSegment = createFlagElement(displayInfo.locationFlag, displayInfo.location || 'Account-based location')
    || createBadgeSpan({
      text: UNKNOWN_ICON,
      title: 'Account-based location unavailable',
      dataset: { twitterFlag: 'true', flagType: 'unknown' }
    });

  const indicatorSegment = createIndicatorSegment(displayInfo);

  const sourceSegment = createFlagElement(displayInfo.sourceFlag, displayInfo.sourceCountry || displayInfo.source || 'Source region')
    || createBadgeSpan({
      text: UNKNOWN_ICON,
      title: 'Source region unavailable',
      dataset: { twitterFlag: 'true', flagType: 'unknown' }
    });

  const segments = [
    createTextSegment('[', 'Account / status / source'),
    accountSegment,
    createTextSegment('|'),
    indicatorSegment,
    createTextSegment('|'),
    sourceSegment,
    createTextSegment(']')
  ];

  segments.forEach(node => wrapper.appendChild(node));

  return wrapper;
}

// Load enabled state
async function loadEnabledState() {
  try {
    const result = await chrome.storage.local.get([TOGGLE_KEY]);
    extensionEnabled = result[TOGGLE_KEY] !== undefined ? result[TOGGLE_KEY] : DEFAULT_ENABLED;
    console.log('Extension enabled:', extensionEnabled);
  } catch (error) {
    console.error('Error loading enabled state:', error);
    extensionEnabled = DEFAULT_ENABLED;
  }
}

// Load display mode
async function loadDisplayMode() {
  try {
    const result = await chrome.storage.local.get([MODE_KEY]);
    displayMode = result[MODE_KEY] || MODE_AUTO;
    console.log('Display mode:', displayMode);
  } catch (error) {
    console.error('Error loading display mode:', error);
    displayMode = MODE_AUTO;
  }
}

// Listen for toggle changes from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'extensionToggle') {
    extensionEnabled = request.enabled;
    console.log('Extension toggled:', extensionEnabled);
    
    if (extensionEnabled) {
      // Re-initialize if enabled
      setTimeout(() => {
        processUsernames();
      }, 500);
    } else {
      // Remove all flags if disabled
      removeAllFlags();
    }
  }
  
  if (request.type === 'modeChange') {
    displayMode = request.mode;
    console.log('Mode changed to:', displayMode);
    handleModeChange(request.mode);
  }
});

// Load cache from persistent storage
async function loadCache() {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.log('Extension context invalidated, skipping cache load');
      return;
    }
    
    const result = await chrome.storage.local.get(CACHE_KEY);
    if (result[CACHE_KEY]) {
      const cached = result[CACHE_KEY];
      const now = Date.now();
      let restored = 0;
      let expired = 0;
      
      // Filter out expired entries and null entries (allow retry)
      for (const [username, data] of Object.entries(cached)) {
        if (!data || !data.expiry) {
          continue;
        }
        
        // Check if entry is expired
        if (data.expiry <= now) {
          expired++;
          continue;
        }

        const storedValue = data.data ?? data.location ?? null;
        if (storedValue === null) {
          continue;
        }

        const normalized = normalizeLocationData(storedValue);
        if (normalized) {
          // Store with expiry timestamp for runtime checking
          locationCache.set(username, { ...normalized, expiry: data.expiry });
          restored++;
        }
      }
      if (restored > 0) {
        console.log(`Loaded ${restored} cached locations (excluding ${expired} expired entries)`);
      }
    }
  } catch (error) {
    // Extension context invalidated errors are expected when extension is reloaded
    if (error.message?.includes('Extension context invalidated') || 
        error.message?.includes('message port closed')) {
      console.log('Extension context invalidated, cache load skipped');
    } else {
      console.error('Error loading cache:', error);
    }
  }
}

// Save cache to persistent storage
async function saveCache() {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.log('Extension context invalidated, skipping cache save');
      return;
    }
    
    const cacheObj = {};
    const now = Date.now();
    const expiry = now + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    
    for (const [username, location] of locationCache.entries()) {
      const normalized = normalizeLocationData(location);
      if (!normalized) {
        continue;
      }

      cacheObj[username] = {
        data: normalized,
        expiry: expiry,
        cachedAt: now
      };
    }
    
    await chrome.storage.local.set({ [CACHE_KEY]: cacheObj });
  } catch (error) {
    // Extension context invalidated errors are expected when extension is reloaded
    if (error.message?.includes('Extension context invalidated') || 
        error.message?.includes('message port closed')) {
      console.log('Extension context invalidated, cache save skipped');
    } else {
      console.error('Error saving cache:', error);
    }
  }
}

// Check if a cache entry is expired
function isCacheEntryExpired(cacheEntry) {
  if (!cacheEntry || !cacheEntry.expiry) {
    return true; // Treat missing expiry as expired
  }
  return cacheEntry.expiry <= Date.now();
}

// Save a single entry to cache
async function saveCacheEntry(username, location) {
  // Check if extension context is still valid
  if (!chrome.runtime?.id) {
    console.log('Extension context invalidated, skipping cache entry save');
    return;
  }
  
  const normalized = normalizeLocationData(location);
  if (!normalized) {
    return;
  }

  // Store with expiry timestamp
  const now = Date.now();
  const expiry = now + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  locationCache.set(username, { ...normalized, expiry });
  
  // Debounce saves - only save every 5 seconds
  if (!saveCache.timeout) {
    saveCache.timeout = setTimeout(async () => {
      await saveCache();
      saveCache.timeout = null;
    }, 5000);
  }
}

// Inject script into page context to access fetch with proper cookies
function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('pageScript.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
  
  // Listen for rate limit info from page script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === '__rateLimitInfo') {
      const { resetTime, resetTimestampMs, waitTime = 0 } = event.data;
      const nowMs = Date.now();
      const nowSeconds = Math.floor(nowMs / 1000);

      if (typeof resetTime === 'number' && resetTime > 0) {
        rateLimitResetTime = Math.max(rateLimitResetTime, resetTime);
      }

      if (typeof resetTimestampMs === 'number' && resetTimestampMs > 0) {
        rateLimitResetTime = Math.max(rateLimitResetTime, Math.floor(resetTimestampMs / 1000));
      }

      const waitSeconds = Math.ceil(waitTime / 1000);
      if (waitSeconds > 0) {
        rateLimitResetTime = Math.max(rateLimitResetTime, Math.floor((nowMs + waitTime) / 1000));
      }

      const minutes = Math.max(1, Math.ceil((rateLimitResetTime - nowSeconds) / 60));
      console.log(`Rate limit detected. Will resume requests in ${minutes} minutes`);
    }
  });
}

// Process request queue with rate limiting
async function processRequestQueue() {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }
  
  // Check if we're rate limited
  if (rateLimitResetTime > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (now < rateLimitResetTime) {
      const waitTime = (rateLimitResetTime - now) * 1000;
      console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000 / 60)} minutes...`);
      setTimeout(processRequestQueue, Math.min(waitTime, 60000)); // Check every minute max
      return;
    } else {
      // Rate limit expired, reset
      rateLimitResetTime = 0;
    }
  }
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    // Wait if needed to respect rate limit
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    
    const { screenName, resolve, reject } = requestQueue.shift();
    activeRequests++;
    lastRequestTime = Date.now();
    
    // Make the request
    makeLocationRequest(screenName)
      .then(location => {
        resolve(location);
      })
      .catch(error => {
        reject(error);
      })
      .finally(() => {
        activeRequests--;
        // Continue processing queue
        setTimeout(processRequestQueue, 200);
      });
  }
  
  isProcessingQueue = false;
}

// Make actual API request
function makeLocationRequest(screenName) {
  return new Promise((resolve, reject) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (rateLimitResetTime > nowSeconds) {
      const delay = Math.max((rateLimitResetTime - nowSeconds) * 1000, 1000);
      console.log(`Deferring request for ${screenName} for ${Math.ceil(delay / 1000)}s due to rate limit.`);
      setTimeout(() => {
        makeLocationRequest(screenName).then(resolve).catch(reject);
      }, delay);
      return;
    }

    const requestId = Date.now() + Math.random();
    
    // Listen for response via postMessage
    const handler = (event) => {
      // Only accept messages from the page (not from extension)
      if (event.source !== window) return;
      
      if (event.data && 
          event.data.type === '__locationResponse' &&
          event.data.screenName === screenName && 
          event.data.requestId === requestId) {
        window.removeEventListener('message', handler);
        const locationData = event.data.locationData ?? event.data.location ?? null;
        const isRateLimited = event.data.isRateLimited || false;
        
        let normalized = null;
        if (locationData) {
          normalized = normalizeLocationData(locationData);
        }

        // Only cache if not rate limited (don't cache failures due to rate limiting)
        if (!isRateLimited && normalized) {
          saveCacheEntry(screenName, normalized);
        } else if (isRateLimited) {
          console.log(`Not caching data for ${screenName} due to rate limit`);
          const enforcedReset = Math.floor(Date.now() / 1000) + 60; // wait at least 1 minute
          rateLimitResetTime = Math.max(rateLimitResetTime, enforcedReset);
          setTimeout(processRequestQueue, 1000);
        }
        
        resolve(normalized);
      }
    };
    window.addEventListener('message', handler);
    
    // Send fetch request to page script via postMessage
    window.postMessage({
      type: '__fetchLocation',
      screenName,
      requestId
    }, '*');
    
    // Timeout after 10 seconds
    setTimeout(() => {
      window.removeEventListener('message', handler);
      // Don't cache timeout failures - allow retry
      console.log(`Request timeout for ${screenName}, not caching`);
      resolve(null);
    }, 10000);
  });
}

// Function to query Twitter GraphQL API for user location (with rate limiting)
async function getUserLocation(screenName) {
  // Check cache first
  if (locationCache.has(screenName)) {
    const cached = locationCache.get(screenName);
    
    // Check if cache entry is expired
    if (isCacheEntryExpired(cached)) {
      console.log(`Cache entry expired for ${screenName}, treating as cache miss`);
      locationCache.delete(screenName);
    } else {
      const normalized = normalizeLocationData(cached);
      if (normalized) {
        const displayInfo = buildLocationDisplayInfo(normalized);
        if (displayInfo) {
          console.log(`Using cached location for ${screenName}:`, displayInfo);
          return displayInfo;
        }
      }
      // Remove invalid cache entry to allow retry
      locationCache.delete(screenName);
    }
  }
  
  console.log(`Queueing API request for ${screenName}`);
  // Queue the request
  return new Promise((resolve, reject) => {
    requestQueue.push({ screenName, resolve, reject });
    processRequestQueue();
  }).then(data => {
    if (!data) {
      return null;
    }

    const normalized = normalizeLocationData(data);
    if (!normalized) {
      return null;
    }

    return buildLocationDisplayInfo(normalized);
  });
}

// Function to extract username from various Twitter UI elements
function extractUsername(element) {
  // Try data-testid="UserName" or "User-Name" first (most reliable)
  const usernameElement = element.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (usernameElement) {
    const links = usernameElement.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const match = href.match(/^\/([^\/\?]+)/);
      if (match && match[1]) {
        const username = match[1];
        // Filter out common routes
        const excludedRoutes = ['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings', 'bookmarks', 'lists', 'communities'];
        if (!excludedRoutes.includes(username) && 
            !username.startsWith('hashtag') &&
            !username.startsWith('search') &&
            username.length > 0 &&
            username.length < 20) { // Usernames are typically short
          return username;
        }
      }
    }
  }
  
  // Try finding username links in the entire element (broader search)
  const allLinks = element.querySelectorAll('a[href^="/"]');
  const seenUsernames = new Set();
  
  for (const link of allLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    const match = href.match(/^\/([^\/\?]+)/);
    if (!match || !match[1]) continue;
    
    const potentialUsername = match[1];
    
    // Skip if we've already checked this username
    if (seenUsernames.has(potentialUsername)) continue;
    seenUsernames.add(potentialUsername);
    
    // Filter out routes and invalid usernames
    const excludedRoutes = ['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings', 'bookmarks', 'lists', 'communities', 'hashtag'];
    if (excludedRoutes.some(route => potentialUsername === route || potentialUsername.startsWith(route))) {
      continue;
    }
    
    // Skip status/tweet links
    if (potentialUsername.includes('status') || potentialUsername.match(/^\d+$/)) {
      continue;
    }
    
    // Check link text/content for username indicators
    const text = link.textContent?.trim() || '';
    const linkText = text.toLowerCase();
    const usernameLower = potentialUsername.toLowerCase();
    
    // If link text starts with @, it's definitely a username
    if (text.startsWith('@')) {
      return potentialUsername;
    }
    
    // If link text matches the username (without @), it's likely a username
    if (linkText === usernameLower || linkText === `@${usernameLower}`) {
      return potentialUsername;
    }
    
    // Check if link is in a UserName container or has username-like structure
    const parent = link.closest('[data-testid="UserName"], [data-testid="User-Name"]');
    if (parent) {
      // If it's in a UserName container and looks like a username, return it
      if (potentialUsername.length > 0 && potentialUsername.length < 20 && !potentialUsername.includes('/')) {
        return potentialUsername;
      }
    }
    
    // Also check if link text is @username format
    if (text && text.trim().startsWith('@')) {
      const atUsername = text.trim().substring(1);
      if (atUsername === potentialUsername) {
        return potentialUsername;
      }
    }
  }
  
  // Last resort: look for @username pattern in text content and verify with link
  const textContent = element.textContent || '';
  const atMentionMatches = textContent.matchAll(/@([a-zA-Z0-9_]+)/g);
  for (const match of atMentionMatches) {
    const username = match[1];
    // Verify it's actually a link in a User-Name container
    const link = element.querySelector(`a[href="/${username}"], a[href^="/${username}?"]`);
    if (link) {
      // Make sure it's in a username context, not just mentioned in tweet text
      const isInUserNameContainer = link.closest('[data-testid="UserName"], [data-testid="User-Name"]');
      if (isInUserNameContainer) {
        return username;
      }
    }
  }
  
  return null;
}

// Helper function to find handle section
function findHandleSection(container, screenName) {
  return Array.from(container.querySelectorAll('div')).find(div => {
    const link = div.querySelector(`a[href="/${screenName}"]`);
    if (link) {
      const text = link.textContent?.trim();
      return text === `@${screenName}`;
    }
    return false;
  });
}

// Create loading shimmer placeholder
function createLoadingShimmer() {
  const shimmer = document.createElement('span');
  shimmer.setAttribute('data-twitter-flag-shimmer', 'true');
  shimmer.style.display = 'inline-block';
  shimmer.style.width = '20px';
  shimmer.style.height = '16px';
  shimmer.style.marginLeft = '4px';
  shimmer.style.marginRight = '4px';
  shimmer.style.verticalAlign = 'middle';
  shimmer.style.borderRadius = '2px';
  shimmer.style.background = 'linear-gradient(90deg, rgba(113, 118, 123, 0.2) 25%, rgba(113, 118, 123, 0.4) 50%, rgba(113, 118, 123, 0.2) 75%)';
  shimmer.style.backgroundSize = '200% 100%';
  shimmer.style.animation = 'shimmer 1.5s infinite';
  
  // Add animation keyframes if not already added
  injectAnimationStyles();
  
  return shimmer;
}

// Inject CSS animation styles for button and shimmer animations
function injectAnimationStyles() {
  if (!document.getElementById('twitter-flag-animation-styles')) {
    const style = document.createElement('style');
    style.id = 'twitter-flag-animation-styles';
    style.textContent = `
      /* Shimmer animation for loading state */
      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }
      
      /* Button hover animation */
      @keyframes button-pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }
      
      /* Smooth button appearance */
      @keyframes button-fade-in {
        from {
          opacity: 0;
          transform: scale(0.8);
        }
        to {
          opacity: 0.6;
          transform: scale(1);
        }
      }
      
      /* Button click animation */
      @keyframes button-click {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(0.9);
        }
        100% {
          transform: scale(1);
        }
      }
      
      /* Apply fade-in animation to buttons */
      .twitter-location-button {
        animation: button-fade-in 0.3s ease-out;
      }
      
      /* Ensure smooth transitions */
      .twitter-location-button,
      [data-twitter-flag-wrapper],
      [data-twitter-flag-shimmer],
      [data-twitter-flag-error] {
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
    `;
    document.head.appendChild(style);
  }
}

// Create button-link for manual mode
function createLocationButton(screenName) {
  // Ensure animation styles are injected
  injectAnimationStyles();
  
  const button = document.createElement('button');
  button.className = 'twitter-location-button';
  button.setAttribute('data-twitter-location-button', 'true');
  button.setAttribute('data-screen-name', screenName);
  button.setAttribute('aria-label', `Show location for @${screenName}`);
  button.title = 'Click to show account location';
  
  // Icon: location pin
  button.innerHTML = '📍';
  
  // Styling to match Twitter UI - using inline styles for specificity
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-left: 4px;
    margin-right: 4px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.6;
    transition: opacity 0.2s ease, transform 0.2s ease;
    vertical-align: middle;
    flex-shrink: 0;
  `;
  
  // Hover effect with smooth animation
  button.addEventListener('mouseenter', () => {
    button.style.opacity = '1';
    button.style.transform = 'scale(1.1)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.opacity = '0.6';
    button.style.transform = 'scale(1)';
  });
  
  // Click handler with click animation
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Add click animation
    button.style.animation = 'button-click 0.2s ease';
    setTimeout(() => {
      button.style.animation = '';
    }, 200);
    
    handleButtonClick(button, screenName);
  });
  
  return button;
}

// Handle button click in manual mode
async function handleButtonClick(button, screenName) {
  // Replace button with loading shimmer
  const shimmer = createLoadingShimmer();
  button.replaceWith(shimmer);
  
  try {
    // Fetch location data
    const locationInfo = await getUserLocation(screenName);
    
    if (locationInfo) {
      // Replace shimmer with location display on success
      const flagWrapper = buildBracketedDisplay(locationInfo);
      shimmer.replaceWith(flagWrapper);
      
      // Mark container as processed after successful display
      const container = findContainerForUsername(screenName);
      if (container) {
        container.dataset.flagAdded = 'true';
        console.log(`✓ Successfully displayed location for ${screenName} via button click`);
      }
    } else {
      // Replace shimmer with error indicator on failure
      const errorIcon = createErrorIndicator();
      shimmer.replaceWith(errorIcon);
      console.log(`✗ Failed to fetch location for ${screenName}`);
    }
  } catch (error) {
    // Replace shimmer with error indicator on error
    console.error(`Error fetching location for ${screenName}:`, error);
    const errorIcon = createErrorIndicator();
    shimmer.replaceWith(errorIcon);
  }
}

// Helper function to find container for a username
function findContainerForUsername(screenName) {
  const containers = document.querySelectorAll('article[data-testid="tweet"], [data-testid="UserCell"], [data-testid="User-Names"], [data-testid="User-Name"]');
  
  for (const container of containers) {
    const username = extractUsername(container);
    if (username === screenName) {
      return container;
    }
  }
  
  return null;
}

// Create error indicator for failed location fetches
function createErrorIndicator() {
  const span = document.createElement('span');
  span.setAttribute('data-twitter-flag-error', 'true');
  span.textContent = '⚠️';
  span.title = 'Failed to load location data';
  span.style.cssText = `
    display: inline-flex;
    align-items: center;
    font-size: 14px;
    margin-left: 4px;
    margin-right: 4px;
    opacity: 0.5;
    vertical-align: middle;
  `;
  return span;
}

// Add button to username in manual mode
function addButtonToUsername(container, screenName) {
  // Mark as processing to avoid duplicates
  if (container.dataset.flagAdded) {
    return;
  }
  container.dataset.flagAdded = 'button';
  
  // Find User-Name container
  const userNameContainer = container.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (!userNameContainer) {
    console.error(`Could not find UserName container for ${screenName}`);
    return;
  }
  
  // Create button
  const button = createLocationButton(screenName);
  
  // Insert button using same strategy as flag insertion (findHandleSection)
  const handleSection = findHandleSection(userNameContainer, screenName);
  
  if (handleSection && handleSection.parentNode) {
    try {
      handleSection.parentNode.insertBefore(button, handleSection);
      console.log(`✓ Inserted button for ${screenName}`);
    } catch (e) {
      console.error('Failed to insert button:', e);
      // Fallback: append to userNameContainer
      try {
        userNameContainer.appendChild(button);
        console.log(`✓ Inserted button (fallback) for ${screenName}`);
      } catch (e2) {
        console.error('Failed to insert button (fallback):', e2);
      }
    }
  } else {
    // Fallback: append to userNameContainer
    try {
      userNameContainer.appendChild(button);
      console.log(`✓ Inserted button (fallback) for ${screenName}`);
    } catch (e) {
      console.error('Failed to insert button (fallback):', e);
    }
  }
}

// Helper function to display location info (for cached data in manual mode)
async function displayLocationInfo(container, screenName, displayInfo) {
  // Mark as processing to avoid duplicates
  container.dataset.flagAdded = 'processing';
  
  // Build bracketed display using buildBracketedDisplay()
  const flagWrapper = buildBracketedDisplay(displayInfo);
  if (!flagWrapper) {
    container.dataset.flagAdded = 'failed';
    console.error(`Unable to build display for ${screenName}`);
    return;
  }
  
  // Find User-Name container
  const userNameContainer = container.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (!userNameContainer) {
    container.dataset.flagAdded = 'failed';
    console.error(`Could not find UserName container for ${screenName}`);
    return;
  }
  
  // Insert flag using same positioning strategy as addFlagToUsername (findHandleSection)
  const handleSection = findHandleSection(userNameContainer, screenName);
  
  if (handleSection && handleSection.parentNode) {
    try {
      handleSection.parentNode.insertBefore(flagWrapper, handleSection);
      container.dataset.flagAdded = 'true';
      console.log(`✓ Displayed cached location for ${screenName}`);
    } catch (e) {
      console.error('Failed to insert flag:', e);
      // Fallback: append to userNameContainer
      try {
        userNameContainer.appendChild(flagWrapper);
        container.dataset.flagAdded = 'true';
        console.log(`✓ Displayed cached location (fallback) for ${screenName}`);
      } catch (e2) {
        console.error('Failed to insert flag (fallback):', e2);
        container.dataset.flagAdded = 'failed';
      }
    }
  } else {
    // Fallback: append to userNameContainer
    try {
      userNameContainer.appendChild(flagWrapper);
      container.dataset.flagAdded = 'true';
      console.log(`✓ Displayed cached location (fallback) for ${screenName}`);
    } catch (e) {
      console.error('Failed to insert flag (fallback):', e);
      container.dataset.flagAdded = 'failed';
    }
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createLocationButton, createErrorIndicator, handleButtonClick, addButtonToUsername, displayLocationInfo };
}

// Function to add flag to username element
async function addFlagToUsername(usernameElement, screenName) {
  // Check if flag already added
  if (usernameElement.dataset.flagAdded === 'true') {
    return;
  }

  // Check if this username is already being processed (prevent duplicate API calls)
  if (processingUsernames.has(screenName)) {
    // Wait a bit and check if flag was added by the other process
    await new Promise(resolve => setTimeout(resolve, 500));
    if (usernameElement.dataset.flagAdded === 'true') {
      return;
    }
    // If still not added, mark this container as waiting
    usernameElement.dataset.flagAdded = 'waiting';
    return;
  }

  // Mark as processing to avoid duplicate requests
  usernameElement.dataset.flagAdded = 'processing';
  processingUsernames.add(screenName);
  
  // Find User-Name container for shimmer placement
  const userNameContainer = usernameElement.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  
  // Create and insert loading shimmer
  const shimmerSpan = createLoadingShimmer();
  let shimmerInserted = false;
  
  if (userNameContainer) {
    // Try to insert shimmer before handle section (same place flag will go)
    const handleSection = findHandleSection(userNameContainer, screenName);
    if (handleSection && handleSection.parentNode) {
      try {
        handleSection.parentNode.insertBefore(shimmerSpan, handleSection);
        shimmerInserted = true;
      } catch (e) {
        // Fallback: insert at end of container
        try {
          userNameContainer.appendChild(shimmerSpan);
          shimmerInserted = true;
        } catch (e2) {
          console.log('Failed to insert shimmer');
        }
      }
    } else {
      // Fallback: insert at end of container
      try {
        userNameContainer.appendChild(shimmerSpan);
        shimmerInserted = true;
      } catch (e) {
        console.log('Failed to insert shimmer');
      }
    }
  }
  
  try {
    console.log(`Processing flag for ${screenName}...`);

    // Get location
    const locationInfo = await getUserLocation(screenName);
    console.log(`Location info for ${screenName}:`, locationInfo);
    
    // Remove shimmer
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    
    if (!locationInfo) {
      console.log(`No location data found for ${screenName}, marking as failed`);
      usernameElement.dataset.flagAdded = 'failed';
      return;
    }

  const flagWrapper = buildBracketedDisplay(locationInfo);
  if (!flagWrapper || !flagWrapper.childElementCount) {
    console.log(`Unable to build display for ${screenName}`);
    usernameElement.dataset.flagAdded = 'failed';
    return;
  }

  // Find the username link - try multiple strategies
  // Priority: Find the @username link, not the display name link
  let usernameLink = null;
  
  // Find the User-Name container (reuse from above if available, otherwise find it)
  const containerForLink = userNameContainer || usernameElement.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  
  // Strategy 1: Find link with @username text content (most reliable - this is the actual handle)
  if (containerForLink) {
    const containerLinks = containerForLink.querySelectorAll('a[href^="/"]');
    for (const link of containerLinks) {
      const text = link.textContent?.trim();
      const href = link.getAttribute('href');
      const match = href.match(/^\/([^\/\?]+)/);
      
      // Prioritize links that have @username as text
      if (match && match[1] === screenName) {
        if (text === `@${screenName}` || text === screenName) {
          usernameLink = link;
          break;
        }
      }
    }
  }
  
  // Strategy 2: Find any link with @username text in UserName container
  if (!usernameLink && containerForLink) {
    const containerLinks = containerForLink.querySelectorAll('a[href^="/"]');
    for (const link of containerLinks) {
      const text = link.textContent?.trim();
      if (text === `@${screenName}`) {
        usernameLink = link;
        break;
      }
    }
  }
  
  // Strategy 3: Find link with exact matching href that has @username text anywhere in element
  if (!usernameLink) {
    const links = usernameElement.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const text = link.textContent?.trim();
      if ((href === `/${screenName}` || href.startsWith(`/${screenName}?`)) && 
          (text === `@${screenName}` || text === screenName)) {
        usernameLink = link;
        break;
      }
    }
  }
  
  // Strategy 4: Fallback to any matching href (but prefer ones not in display name area)
  if (!usernameLink) {
    const links = usernameElement.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const match = href.match(/^\/([^\/\?]+)/);
      if (match && match[1] === screenName) {
        // Skip if this looks like a display name link (has verification badge nearby)
        const hasVerificationBadge = link.closest('[data-testid="User-Name"]')?.querySelector('[data-testid="icon-verified"]');
        if (!hasVerificationBadge || link.textContent?.trim() === `@${screenName}`) {
          usernameLink = link;
          break;
        }
      }
    }
  }

  if (!usernameLink) {
    console.error(`Could not find username link for ${screenName}`);
    console.error('Available links in container:', Array.from(usernameElement.querySelectorAll('a[href^="/"]')).map(l => ({
      href: l.getAttribute('href'),
      text: l.textContent?.trim()
    })));
    // Remove shimmer on error
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    usernameElement.dataset.flagAdded = 'failed';
    return;
  }
  
  console.log(`Found username link for ${screenName}:`, usernameLink.href, usernameLink.textContent?.trim());

  // Check if flag already exists (check in the entire container, not just parent)
  const existingFlag = usernameElement.querySelector('[data-twitter-flag-wrapper], [data-twitter-flag]');
  if (existingFlag) {
    // Remove shimmer if flag already exists
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    usernameElement.dataset.flagAdded = 'true';
    return;
  }

  // Add flag emoji - place it next to verification badge, before @ handle
  const flagSpan = flagWrapper;
  
  // Use userNameContainer found above, or find it if not found
  let containerForFlag = userNameContainer;

  if (!containerForFlag) {
    const ownContainer = usernameElement.closest('[data-testid="UserName"], [data-testid="User-Name"]');
    if (ownContainer && Array.from(ownContainer.querySelectorAll('a[href^="/"]')).some(link => {
      const href = link.getAttribute('href');
      const match = href?.match(/^\/([^\/\?]+)/);
      return match && match[1] === screenName;
    })) {
      containerForFlag = ownContainer;
    }
  }

  if (!containerForFlag) {
    const handles = usernameElement.querySelectorAll('[data-testid="UserName"], [data-testid="User-Name"]');
    if (handles.length === 1) {
      containerForFlag = handles[0];
    } else if (handles.length > 1) {
      containerForFlag = Array.from(handles).find(handle => {
        const handleLink = handle.querySelector(`a[href="/${screenName}"], a[href^="/${screenName}?"]`);
        return Boolean(handleLink);
      }) || handles[0];
    }
  }

  if (!containerForFlag) {
    containerForFlag = usernameElement.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  }

  if (!containerForFlag) {
    if (usernameElement.matches('[data-testid="UserName"], [data-testid="User-Name"]')) {
      containerForFlag = usernameElement;
    } else {
      containerForFlag = usernameElement.closest('[data-testid="UserName"], [data-testid="User-Name"]') || usernameElement;
    }
  }
  
  if (!containerForFlag) {
    console.error(`Could not find UserName container for ${screenName}`);
    // Remove shimmer on error
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    usernameElement.dataset.flagAdded = 'failed';
    return;
  }
  
  // Find the verification badge (SVG with data-testid="icon-verified")
  const verificationBadge = containerForFlag.querySelector('[data-testid="icon-verified"]');
  
  // Find the handle section - the div that contains the @username link
  // The structure is: User-Name > div (display name) > div (handle section with @username)
  const handleSection = findHandleSection(containerForFlag, screenName);

  let inserted = false;
  
  // Strategy 1: Insert right before the handle section div (which contains @username)
  // The handle section is a direct child of User-Name container
  if (handleSection && handleSection.parentNode === containerForFlag) {
    try {
      containerForFlag.insertBefore(flagSpan, handleSection);
      inserted = true;
      console.log(`✓ Inserted flag before handle section for ${screenName}`);
    } catch (e) {
      console.log('Failed to insert before handle section:', e);
    }
  }
  
  // Strategy 2: Find the handle section's parent and insert before it
  if (!inserted && handleSection && handleSection.parentNode) {
    try {
      // Insert before the handle section's parent (if it's not User-Name)
      const handleParent = handleSection.parentNode;
      if (handleParent !== containerForFlag && handleParent.parentNode) {
        handleParent.parentNode.insertBefore(flagSpan, handleParent);
        inserted = true;
        console.log(`✓ Inserted flag before handle parent for ${screenName}`);
      } else if (handleParent === containerForFlag) {
        // Handle section is direct child, insert before it
        containerForFlag.insertBefore(flagSpan, handleSection);
        inserted = true;
        console.log(`✓ Inserted flag before handle section (direct child) for ${screenName}`);
      }
    } catch (e) {
      console.log('Failed to insert before handle parent:', e);
    }
  }
  
  // Strategy 3: Find display name container and insert after it, before handle section
  if (!inserted && handleSection) {
    try {
      // Find the display name link (first link)
      const displayNameLink = containerForFlag.querySelector('a[href^="/"]');
      if (displayNameLink) {
        // Find the div that contains the display name link
        const displayNameContainer = displayNameLink.closest('div');
        if (displayNameContainer && displayNameContainer.parentNode) {
          // Check if handle section is a sibling
          if (displayNameContainer.parentNode === handleSection.parentNode) {
            displayNameContainer.parentNode.insertBefore(flagSpan, handleSection);
            inserted = true;
            console.log(`✓ Inserted flag between display name and handle (siblings) for ${screenName}`);
          } else {
            // Try inserting after display name container
            displayNameContainer.parentNode.insertBefore(flagSpan, displayNameContainer.nextSibling);
            inserted = true;
            console.log(`✓ Inserted flag after display name container for ${screenName}`);
          }
        }
      }
    } catch (e) {
      console.log('Failed to insert after display name:', e);
    }
  }
  
  // Strategy 4: Insert at the end of User-Name container (fallback)
  if (!inserted) {
    try {
      containerForFlag.appendChild(flagSpan);
      inserted = true;
      console.log(`✓ Inserted flag at end of UserName container for ${screenName}`);
    } catch (e) {
      console.error('Failed to append flag to User-Name container:', e);
    }
  }
  
    if (inserted) {
      // Mark as processed
      usernameElement.dataset.flagAdded = 'true';
      console.log(`✓ Successfully added indicators for ${screenName}`);
      
      // Also mark any other containers waiting for this username
      const waitingContainers = document.querySelectorAll(`[data-flag-added="waiting"]`);
      waitingContainers.forEach(container => {
        const waitingUsername = extractUsername(container);
        if (waitingUsername === screenName) {
          // Try to add flag to this container too
          addFlagToUsername(container, screenName).catch(() => {});
        }
      });
    } else {
      console.error(`✗ Failed to insert flag for ${screenName} - tried all strategies`);
      console.error('Username link:', usernameLink);
      console.error('Parent structure:', usernameLink.parentNode);
      // Remove shimmer on failure
      if (shimmerInserted && shimmerSpan.parentNode) {
        shimmerSpan.remove();
      }
      usernameElement.dataset.flagAdded = 'failed';
    }
  } catch (error) {
    console.error(`Error processing flag for ${screenName}:`, error);
    // Remove shimmer on error
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    usernameElement.dataset.flagAdded = 'failed';
  } finally {
    // Remove from processing set
    processingUsernames.delete(screenName);
  }
}

// Function to remove all flags (when extension is disabled)
function removeAllFlags() {
  const flags = document.querySelectorAll('[data-twitter-flag], [data-twitter-flag-wrapper]');
  flags.forEach(flag => flag.remove());
  
  // Also remove any loading shimmers
  const shimmers = document.querySelectorAll('[data-twitter-flag-shimmer]');
  shimmers.forEach(shimmer => shimmer.remove());
  
  // Also remove button-links
  const buttons = document.querySelectorAll('[data-twitter-location-button]');
  buttons.forEach(button => button.remove());
  
  // Also remove error indicators
  const errors = document.querySelectorAll('[data-twitter-flag-error]');
  errors.forEach(error => error.remove());
  
  // Reset flag added markers
  const containers = document.querySelectorAll('[data-flag-added]');
  containers.forEach(container => {
    delete container.dataset.flagAdded;
  });
  
  console.log('Removed all flags');
}

// Handle mode change
async function handleModeChange(newMode) {
  console.log(`Handling mode change to: ${newMode}`);
  
  if (newMode === MODE_AUTO) {
    // Switching to AUTO: find all button-links, check cache, fetch or display
    const buttons = document.querySelectorAll('[data-twitter-location-button]');
    
    for (const button of buttons) {
      const screenName = button.getAttribute('data-screen-name');
      if (!screenName) continue;
      
      // Find the container for this username
      const container = findContainerForUsername(screenName);
      if (!container) continue;
      
      // Remove the button
      button.remove();
      
      // Reset the container's flag status
      delete container.dataset.flagAdded;
      
      // Check cache first
      const cachedLocation = locationCache.get(screenName);
      
      if (cachedLocation) {
        // Display cached data
        const normalized = normalizeLocationData(cachedLocation);
        if (normalized) {
          const displayInfo = buildLocationDisplayInfo(normalized);
          if (displayInfo) {
            await displayLocationInfo(container, screenName, displayInfo);
            continue;
          }
        }
      }
      
      // No cache - fetch automatically in auto mode
      addFlagToUsername(container, screenName).catch(err => {
        console.error(`Error processing ${screenName} after mode change:`, err);
        container.dataset.flagAdded = 'failed';
      });
    }
  } else {
    // Switching to MANUAL: find all flags for uncached usernames, replace with buttons
    const containers = document.querySelectorAll('article[data-testid="tweet"], [data-testid="UserCell"], [data-testid="User-Names"], [data-testid="User-Name"]');
    
    for (const container of containers) {
      const screenName = extractUsername(container);
      if (!screenName) continue;
      
      // Check if this username has cached data
      const cachedLocation = locationCache.get(screenName);
      
      // If there's a flag wrapper but no cached data, replace with button
      const flagWrapper = container.querySelector('[data-twitter-flag-wrapper]');
      
      if (flagWrapper && !cachedLocation) {
        // Remove the flag
        flagWrapper.remove();
        
        // Reset the container's flag status
        delete container.dataset.flagAdded;
        
        // Add button instead
        addButtonToUsername(container, screenName);
      }
      
      // If there's cached data, keep the flag (don't replace with button)
      // If there's already a button, keep it
      // If there's nothing, the next processUsernames call will handle it
    }
  }
  
  // Re-process visible usernames with new mode
  setTimeout(() => {
    processUsernames();
  }, 500);
}

// Function to process all username elements on the page
async function processUsernames() {
  // Check if extension is enabled
  if (!extensionEnabled) {
    return;
  }
  
  // Load current displayMode at start of function
  await loadDisplayMode();
  
  // Find all tweet/article containers and user cells
  const containers = document.querySelectorAll('article[data-testid="tweet"], [data-testid="UserCell"], [data-testid="User-Names"], [data-testid="User-Name"]');
  
  console.log(`Processing ${containers.length} containers for usernames in ${displayMode} mode`);
  
  let foundCount = 0;
  let processedCount = 0;
  let skippedCount = 0;
  
  for (const container of containers) {
    const screenName = extractUsername(container);
    if (screenName) {
      foundCount++;
      const status = container.dataset.flagAdded;
      
      // Skip if already processed (true, processing, waiting, or button)
      if (status === 'true' || status === 'processing' || status === 'waiting' || status === 'button') {
        skippedCount++;
        continue;
      }
      
      processedCount++;
      
      // Check cache first for all usernames (regardless of mode)
      const cachedLocation = locationCache.get(screenName);
      
      if (cachedLocation) {
        // Check if cache entry is expired
        if (isCacheEntryExpired(cachedLocation)) {
          console.log(`Cache entry expired for ${screenName}, treating as cache miss`);
          locationCache.delete(screenName);
          // Continue to mode-specific logic below (will show button in manual mode or fetch in auto mode)
        } else {
          // If cached data exists and is not expired, call displayLocationInfo() for both modes
          const normalized = normalizeLocationData(cachedLocation);
          if (normalized) {
            const displayInfo = buildLocationDisplayInfo(normalized);
            if (displayInfo) {
              await displayLocationInfo(container, screenName, displayInfo);
              continue;
            }
          }
        }
      }
      
      // No cache - behavior depends on mode
      if (displayMode === MODE_AUTO) {
        // If no cache and mode is AUTO, call addFlagToUsername() (existing behavior)
        addFlagToUsername(container, screenName).catch(err => {
          console.error(`Error processing ${screenName}:`, err);
          container.dataset.flagAdded = 'failed';
        });
      } else {
        // If no cache and mode is MANUAL, call addButtonToUsername() (new behavior)
        addButtonToUsername(container, screenName);
      }
    } else {
      // Debug: log containers that don't have usernames
      const hasUserName = container.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
      if (hasUserName) {
        console.log('Found UserName container but no username extracted');
      }
    }
  }
  
  if (foundCount > 0) {
    console.log(`Found ${foundCount} usernames, processing ${processedCount} new ones, skipped ${skippedCount} already processed`);
  } else {
    console.log('No usernames found in containers');
  }
}

// Initialize observer for dynamically loaded content
function initObserver() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    // Don't process if extension is disabled
    if (!extensionEnabled) {
      return;
    }
    
    let shouldProcess = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldProcess = true;
        break;
      }
    }
    
    if (shouldProcess) {
      // Debounce processing
      setTimeout(processUsernames, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Main initialization
async function init() {
  console.log('Twitter Location Flag extension initialized');
  
  // Load enabled state first
  await loadEnabledState();
  
  // Load display mode before processing usernames
  await loadDisplayMode();
  
  // Load persistent cache
  await loadCache();
  
  // Only proceed if extension is enabled
  if (!extensionEnabled) {
    console.log('Extension is disabled');
    return;
  }
  
  // Inject page script
  injectPageScript();
  
  // Wait a bit for page to fully load
  setTimeout(() => {
    processUsernames();
  }, 2000);
  
  // Set up observer for new content
  initObserver();
  
  // Re-process on navigation (Twitter uses SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('Page navigation detected, reprocessing usernames');
      setTimeout(processUsernames, 2000);
    }
  }).observe(document, { subtree: true, childList: true });
  
  // Save cache periodically
  setInterval(saveCache, 30000); // Save every 30 seconds
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

