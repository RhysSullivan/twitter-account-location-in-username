// Cache for user locations - persistent storage
let locationCache = new Map();
const CACHE_KEY = 'twitter_location_cache';
const CACHE_EXPIRY_DAYS = 30; // Cache for 30 days
const SERVER_BASE_URL = 'http://localhost:8000';
const SERVER_TIMEOUT_MS = 5000;
const SERVER_LOOKUP_TTL_MS = 0; // Always re-check DB per user (no TTL)
const SERVER_UPSERT_TTL_MS = 30 * 1000; // Throttle writes to DB per user

// Hidden countries preferences
const HIDDEN_COUNTRIES_KEY = 'hidden_countries';
let hiddenCountries = new Set();

// Rate limiting
const requestQueue = [];
let isProcessingQueue = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 0.5 seconds between requests
const MAX_CONCURRENT_REQUESTS = 4; // Allow more concurrent requests
let activeRequests = 0;
let rateLimitResetTime = 0; // Unix timestamp when rate limit resets
const serverLookupCache = new Map(); // username -> { checkedAt, location, promise }
const serverUpsertTracker = new Map(); // username -> { timestamp, promise }

// Observer for dynamically loaded content
let observer = null;

// Extension enabled state
let extensionEnabled = true;
const TOGGLE_KEY = 'extension_enabled';
const DEFAULT_ENABLED = true;

// Track usernames currently being processed to avoid duplicate requests
const processingUsernames = new Set();

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

// Load hidden countries list
async function loadHiddenCountries() {
  try {
    const result = await chrome.storage.local.get([HIDDEN_COUNTRIES_KEY]);
    const saved = result[HIDDEN_COUNTRIES_KEY];
    if (Array.isArray(saved)) {
      setHiddenCountries(saved);
      console.log('Loaded hidden countries:', Array.from(hiddenCountries));
    } else {
      setHiddenCountries([]);
    }
  } catch (error) {
    console.error('Error loading hidden countries:', error);
    setHiddenCountries([]);
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
      showAllHiddenContent();
    }
  } else if (request.type === 'updateHiddenCountries') {
    console.log('Received hidden countries update from popup');
    setHiddenCountries(request.countries || []);
  }
});

// React to storage updates (e.g., when popup changes hidden countries)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[HIDDEN_COUNTRIES_KEY]) {
    const newValue = changes[HIDDEN_COUNTRIES_KEY].newValue;
    setHiddenCountries(Array.isArray(newValue) ? newValue : []);
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
      
      // Filter out expired entries and null entries (allow retry)
      for (const [username, data] of Object.entries(cached)) {
        if (data.expiry && data.expiry > now && data.location !== null) {
          locationCache.set(username, data.location);
        }
      }
      console.log(`Loaded ${locationCache.size} cached locations (excluding null entries)`);
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
      cacheObj[username] = {
        location: location,
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

// Save a single entry to cache
async function saveCacheEntry(username, location) {
  // Check if extension context is still valid
  if (!chrome.runtime?.id) {
    console.log('Extension context invalidated, skipping cache entry save');
    return;
  }
  
  locationCache.set(username, location);
  // Debounce saves - only save every 5 seconds
  if (!saveCache.timeout) {
    saveCache.timeout = setTimeout(async () => {
      await saveCache();
      saveCache.timeout = null;
    }, 5000);
  }
}

// Helper: request server via background (avoids mixed-content/CORS in content script)
function serverFetch(path, { method = 'GET', body = null } = {}) {
  return new Promise((resolve) => {
    if (!chrome.runtime?.id) {
      resolve({ ok: false, status: 0, data: null, error: 'no-runtime' });
      return;
    }
    chrome.runtime.sendMessage(
      { type: 'SERVER_FETCH', path, method, body },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, status: 0, data: null, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, status: 0, data: null, error: 'no-response' });
      }
    );
  });
}

// Best-effort server lookup with simple TTL + in-flight dedupe
async function getServerLocationCached(screenName, { force = false } = {}) {
  const now = Date.now();
  const entry = serverLookupCache.get(screenName);

  if (entry) {
    if (entry.promise) {
      return entry.promise;
    }
    if (!force && now - entry.checkedAt < SERVER_LOOKUP_TTL_MS) {
      return entry.location;
    }
  }

  const promise = (async () => {
    const location = await fetchServerLocation(screenName);
    const normalized = location || null;
    serverLookupCache.set(screenName, {
      checkedAt: Date.now(),
      location: normalized,
      promise: null
    });
    if (normalized) {
      await saveCacheEntry(screenName, normalized);
    }
    return normalized;
  })();

  serverLookupCache.set(screenName, {
    checkedAt: now,
    location: entry?.location ?? null,
    promise
  });

  return promise;
}

// Query server cache when rate limited
async function fetchServerLocation(screenName) {
  if (!SERVER_BASE_URL) return null;
  try {
    console.log(`Fetching server cache for ${screenName} at ${SERVER_BASE_URL}/check`);
    const resp = await serverFetch(`/check?a=${encodeURIComponent(screenName)}`, { method: 'GET' });
    if (!resp?.ok) {
      console.warn(`Server cache miss/err for ${screenName}: status ${resp?.status}`, resp?.error);
      return null;
    }
    console.log(`Server cache hit for ${screenName}:`, resp.data);
    return resp.data?.location || null;
  } catch (err) {
    console.warn(`Server lookup failed for ${screenName}:`, err);
    return null;
  }
}

// Upsert location on server after a lookup (best effort, only when we have a known country)
async function upsertServerLocation(screenName, location) {
  if (!SERVER_BASE_URL || !location) return;

  // Only send if we recognize the country
  if (!getCountryFlag(location)) {
    console.log(`Skipping server upsert for ${screenName}: unknown country ${location}`);
    return;
  }

  try {
    const resp = await serverFetch('/add', {
      method: 'POST',
      body: { username: screenName, location }
    });
    if (!resp?.ok) {
      console.warn(`Server upsert failed for ${screenName}: status ${resp?.status}`, resp?.error);
    } else {
      console.log(`Server cache updated for ${screenName}: ${location}`);
    }
  } catch (err) {
    console.warn(`Failed to upsert location for ${screenName} to server:`, err);
  }
}

// Throttle and dedupe server writes to make sure scrolls push to DB reliably
async function ensureServerUpsert(screenName, location) {
  if (!location) return;

  const now = Date.now();
  const entry = serverUpsertTracker.get(screenName);
  if (entry) {
    if (entry.promise) {
      return entry.promise;
    }
    if (now - entry.timestamp < SERVER_UPSERT_TTL_MS) {
      return;
    }
  }

  const promise = upsertServerLocation(screenName, location)
    .catch((err) => {
      console.warn(`Best-effort upsert failed for ${screenName}:`, err);
    })
    .finally(() => {
      serverUpsertTracker.set(screenName, { timestamp: Date.now(), promise: null });
    });

  serverUpsertTracker.set(screenName, { timestamp: now, promise });
  return promise;
}

// Hidden countries helpers
function setHiddenCountries(countries) {
  if (!Array.isArray(countries)) {
    countries = [];
  }
  
  hiddenCountries = new Set(
    countries
      .filter(country => typeof country === 'string' && country.trim().length > 0)
      .map(country => country.trim().toLowerCase())
  );
  
  refreshHiddenContainersVisibility();
}

function isCountryHidden(countryName) {
  if (!countryName) return false;
  return hiddenCountries.has(countryName.toLowerCase());
}

function hideContainerForLocation(container, screenName, location) {
  if (!container) return;
  if (container.dataset.hiddenByCountry === 'true') return;
  
  container.dataset.hiddenByCountry = 'true';
  container.dataset.flagAdded = 'hidden';
  container.dataset.countryLocation = location;
  
  // Clean up any loaders inside the container before hiding
  const shimmers = container.querySelectorAll('[data-twitter-flag-shimmer="true"]');
  shimmers.forEach(shimmer => shimmer.remove());
  
  container.style.display = 'none';
  console.log(`Hiding content for ${screenName} (${location})`);
}

function showAllHiddenContent() {
  const hidden = document.querySelectorAll('[data-hidden-by-country="true"]');
  hidden.forEach(container => {
    container.style.display = '';
    delete container.dataset.hiddenByCountry;
    if (container.dataset.flagAdded === 'hidden') {
      delete container.dataset.flagAdded;
    }
  });
}

function refreshHiddenContainersVisibility() {
  if (!extensionEnabled) {
    return;
  }
  
  const containers = document.querySelectorAll('[data-country-location]');
  let shouldReprocess = false;
  
  containers.forEach(container => {
    const location = container.dataset.countryLocation;
    if (isCountryHidden(location)) {
      const username = extractUsername(container) || 'unknown user';
      hideContainerForLocation(container, username, location);
    } else if (container.dataset.hiddenByCountry === 'true') {
      container.style.display = '';
      delete container.dataset.hiddenByCountry;
      if (container.dataset.flagAdded === 'hidden') {
        delete container.dataset.flagAdded;
        shouldReprocess = true;
      }
    }
  });
  
  if (shouldReprocess) {
    // Re-run processing to add flags for items that were previously hidden
    setTimeout(processUsernames, 200);
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
      rateLimitResetTime = event.data.resetTime;
      const waitTime = event.data.waitTime;
      console.log(`Rate limit detected. Will resume requests in ${Math.ceil(waitTime / 1000 / 60)} minutes`);
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
      .then(result => {
        resolve(result);
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
    const requestId = Date.now() + Math.random();
    let timedOut = false;
    console.log(`Requesting X API for ${screenName} (requestId=${requestId})`);
    
    // Listen for response via postMessage
    const handler = (event) => {
      // Only accept messages from the page (not from extension)
      if (event.source !== window) return;
      
      if (event.data && 
          event.data.type === '__locationResponse' &&
          event.data.screenName === screenName && 
          event.data.requestId === requestId) {
        window.removeEventListener('message', handler);
        const location = event.data.location;
        const isRateLimited = event.data.isRateLimited || false;
        
        // Only cache if not rate limited (don't cache failures due to rate limiting)
        if (!isRateLimited) {
          saveCacheEntry(screenName, location || null);
        } else {
          console.log(`Not caching null for ${screenName} due to rate limit`);
        }
        
        resolve({ location: location || null, isRateLimited, timedOut });
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
      resolve({ location: null, isRateLimited: false, timedOut: true });
    }, 10000);
  });
}

// Function to query Twitter GraphQL API for user location (with rate limiting)
async function getUserLocation(screenName) {
  // Check cache first
  if (locationCache.has(screenName)) {
    const cached = locationCache.get(screenName);
    // Don't return cached null - retry if it was null before (might have been rate limited)
    if (cached !== null) {
      console.log(`Using cached location for ${screenName}: ${cached}`);
      await ensureServerUpsert(screenName, cached);
      return cached;
    } else {
      console.log(`Found null in cache for ${screenName}, will retry API call`);
      // Remove from cache to allow retry
      locationCache.delete(screenName);
    }
  }

  // Check server cache before hitting X (more reliable when scrolling quickly)
  const serverFirst = await getServerLocationCached(screenName);
  if (serverFirst !== null) {
    console.log(`Using server location for ${screenName}: ${serverFirst}`);
    await ensureServerUpsert(screenName, serverFirst);
    return serverFirst;
  }
  
  console.log(`Queueing API request for ${screenName}`);
  // Queue the request
  const { location: apiLocation, isRateLimited, timedOut } = await new Promise((resolve, reject) => {
    requestQueue.push({ screenName, resolve, reject });
    processRequestQueue();
  });

  // On rate limit or timeout, ask server for cached value
  if (isRateLimited || timedOut) {
    const serverLocation = await getServerLocationCached(screenName, { force: true });
    if (serverLocation !== null) {
      await saveCacheEntry(screenName, serverLocation);
      return serverLocation;
    }
    return null;
  }

  if (apiLocation) {
    console.log(`X API returned location for ${screenName}: ${apiLocation} -> sending to server`);
    await ensureServerUpsert(screenName, apiLocation);
  }

  return apiLocation;
}

// Function to extract username from various Twitter UI elements
function extractUsername(element) {
  const excludedRoutes = ['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings', 'bookmarks', 'lists', 'communities', 'hashtag'];

  function validUsername(name) {
    if (!name) return null;
    const clean = name.replace(/^@/, '');
    if (clean.length === 0 || clean.length > 20) return null;
    if (excludedRoutes.some(route => clean === route || clean.startsWith(route))) return null;
    if (clean.includes('/') || clean.match(/^\d+$/)) return null;
    return clean;
  }

  // Try data-testid="UserName" or "User-Name" first (most reliable)
  const usernameElement = element.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (usernameElement) {
    const links = usernameElement.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/^\/([^\/\?]+)/);
      const candidate = validUsername(match && match[1]);
      if (candidate) return candidate;
    }
  }
  
  // Try finding username links in the entire element (broader search)
  const allLinks = element.querySelectorAll('a[href^="/"]');
  const seenUsernames = new Set();
  
  for (const link of allLinks) {
    const href = link.getAttribute('href') || '';
    const match = href.match(/^\/([^\/\?]+)/);
    const potentialUsername = validUsername(match && match[1]);
    
    if (!potentialUsername || seenUsernames.has(potentialUsername)) continue;
    seenUsernames.add(potentialUsername);
    
    const text = (link.textContent || '').trim();
    const linkText = text.toLowerCase();
    const usernameLower = potentialUsername.toLowerCase();
    const ariaLabel = (link.getAttribute('aria-label') || '').trim();
    
    if (text.startsWith('@') || ariaLabel.startsWith('@')) {
      return potentialUsername;
    }
    
    if (linkText === usernameLower || linkText === `@${usernameLower}`) {
      return potentialUsername;
    }
    
    const parent = link.closest('[data-testid="UserName"], [data-testid="User-Name"]');
    if (parent && potentialUsername.length > 0) {
      return potentialUsername;
    }
  }
  
  // Last resort: look for @username pattern in text content and verify with link
  const textContent = element.textContent || '';
  const atMentionMatches = textContent.matchAll(/@([a-zA-Z0-9_]{1,20})/g);
  for (const match of atMentionMatches) {
    const username = validUsername(match[1]);
    if (!username) continue;
    const link = element.querySelector(`a[href="/${username}"], a[href^="/${username}?"]`);
    if (link) {
      return username;
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
  if (!document.getElementById('twitter-flag-shimmer-style')) {
    const style = document.createElement('style');
    style.id = 'twitter-flag-shimmer-style';
    style.textContent = `
      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  return shimmer;
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
    const location = await getUserLocation(screenName);
    console.log(`Location for ${screenName}:`, location);

    // Remove shimmer
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    
    if (location) {
      usernameElement.dataset.countryLocation = location;
    }

    if (location && isCountryHidden(location)) {
      hideContainerForLocation(usernameElement, screenName, location);
      return;
    }
    
    if (!location) {
      console.log(`No location found for ${screenName}, marking as failed`);
      usernameElement.dataset.flagAdded = 'failed';
      return;
    }

  // Get flag emoji
  const flag = getCountryFlag(location);
  if (!flag) {
    console.log(`No flag found for location: ${location}`);
    // Shimmer already removed above, but ensure it's gone
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    usernameElement.dataset.flagAdded = 'failed';
    return;
  }
  
  console.log(`Found flag ${flag} for ${screenName} (${location})`);

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
  const existingFlag = usernameElement.querySelector('[data-twitter-flag]');
  if (existingFlag) {
    // Remove shimmer if flag already exists
    if (shimmerInserted && shimmerSpan.parentNode) {
      shimmerSpan.remove();
    }
    usernameElement.dataset.flagAdded = 'true';
    return;
  }

  // Add flag emoji - place it next to verification badge, before @ handle
  const flagSpan = document.createElement('span');
  flagSpan.textContent = ` ${flag}`;
  flagSpan.setAttribute('data-twitter-flag', 'true');
  flagSpan.style.marginLeft = '4px';
  flagSpan.style.marginRight = '4px';
  flagSpan.style.display = 'inline';
  flagSpan.style.color = 'inherit';
  flagSpan.style.verticalAlign = 'middle';
  
  // Use userNameContainer found above, or find it if not found
  const containerForFlag = userNameContainer || usernameElement.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  
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
      console.log(`✓ Successfully added flag ${flag} for ${screenName} (${location})`);
      
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
  const flags = document.querySelectorAll('[data-twitter-flag]');
  flags.forEach(flag => flag.remove());
  
  // Also remove any loading shimmers
  const shimmers = document.querySelectorAll('[data-twitter-flag-shimmer]');
  shimmers.forEach(shimmer => shimmer.remove());
  
  // Reset flag added markers
  const containers = document.querySelectorAll('[data-flag-added]');
  containers.forEach(container => {
    delete container.dataset.flagAdded;
  });
  
  console.log('Removed all flags');
}

// Function to process all username elements on the page
async function processUsernames() {
  // Check if extension is enabled
  if (!extensionEnabled) {
    return;
  }
  
  // Find all tweet/article containers and user cells
  const containers = document.querySelectorAll([
    'article[data-testid="tweet"]',
    'article[role="article"]',
    '[data-testid="cellInnerDiv"]',
    '[data-testid="UserCell"]',
    '[data-testid="User-Names"]',
    '[data-testid="User-Name"]',
  ].join(', '));
  
  console.log(`Processing ${containers.length} containers for usernames`);
  
  let foundCount = 0;
  let processedCount = 0;
  let skippedCount = 0;
  
  for (const container of containers) {
    const screenName = extractUsername(container);
    if (screenName) {
      foundCount++;
      const status = container.dataset.flagAdded;
      if (!status || status === 'failed') {
        processedCount++;
        // Process in parallel but limit concurrency
        addFlagToUsername(container, screenName).catch(err => {
          console.error(`Error processing ${screenName}:`, err);
          container.dataset.flagAdded = 'failed';
        });
      } else {
        skippedCount++;
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
  await loadHiddenCountries();
  
  // Load persistent cache
  await loadCache();
  
  // Only proceed if extension is enabled
  if (!extensionEnabled) {
    console.log('Extension is disabled');
    showAllHiddenContent();
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

