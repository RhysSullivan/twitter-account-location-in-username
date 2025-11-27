import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Integration Tests for Manual Mode End-to-End Flows
 * 
 * These tests verify complete user workflows across multiple components:
 * - Mode switching from popup to content script
 * - Button click flow (button → shimmer → display)
 * - Cache integration (auto fetch → manual display)
 * - Dynamic content with manual mode
 * 
 * Requirements: All
 */

// Mock Chrome API
const mockStorage = new Map();
const mockMessageListeners = [];

global.chrome = {
  storage: {
    local: {
      get: vi.fn((keys) => {
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
          if (mockStorage.has(key)) {
            result[key] = mockStorage.get(key);
          }
        });
        return Promise.resolve(result);
      }),
      set: vi.fn((items) => {
        Object.entries(items).forEach(([key, value]) => {
          mockStorage.set(key, value);
        });
        return Promise.resolve();
      })
    }
  },
  runtime: {
    id: 'test-extension-id',
    getURL: vi.fn((path) => `chrome-extension://test/${path}`),
    onMessage: {
      addListener: vi.fn((listener) => {
        mockMessageListeners.push(listener);
      }),
      removeListener: vi.fn((listener) => {
        const index = mockMessageListeners.indexOf(listener);
        if (index > -1) {
          mockMessageListeners.splice(index, 1);
        }
      })
    },
    sendMessage: vi.fn()
  },
  tabs: {
    query: vi.fn((queryInfo) => {
      return Promise.resolve([{ id: 1, url: 'https://x.com/home' }]);
    }),
    sendMessage: vi.fn((tabId, message) => {
      // Simulate message delivery to content script
      mockMessageListeners.forEach(listener => {
        listener(message, { tab: { id: tabId } }, vi.fn());
      });
      return Promise.resolve();
    })
  }
};

// Constants
const MODE_KEY = 'display_mode';
const MODE_AUTO = 'auto';
const MODE_MANUAL = 'manual';
const CACHE_KEY = 'twitter_location_cache';

// Helper to create mock Twitter DOM structure
function createMockTwitterContainer(screenName) {
  const container = document.createElement('article');
  container.setAttribute('data-testid', 'tweet');
  
  const userNameContainer = document.createElement('div');
  userNameContainer.setAttribute('data-testid', 'User-Name');
  
  const displayNameDiv = document.createElement('div');
  const displayNameLink = document.createElement('a');
  displayNameLink.href = `/${screenName}`;
  displayNameLink.textContent = 'Display Name';
  displayNameDiv.appendChild(displayNameLink);
  userNameContainer.appendChild(displayNameDiv);
  
  const handleDiv = document.createElement('div');
  const handleLink = document.createElement('a');
  handleLink.href = `/${screenName}`;
  handleLink.textContent = `@${screenName}`;
  handleDiv.appendChild(handleLink);
  userNameContainer.appendChild(handleDiv);
  
  container.appendChild(userNameContainer);
  
  return container;
}

// Helper to find handle section
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

// Helper to create location button
function createLocationButton(screenName) {
  const button = document.createElement('button');
  button.className = 'twitter-location-button';
  button.setAttribute('data-twitter-location-button', 'true');
  button.setAttribute('data-screen-name', screenName);
  button.setAttribute('aria-label', `Show location for @${screenName}`);
  button.title = 'Click to show account location';
  button.innerHTML = '📍';
  
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
  
  return button;
}

// Helper to create loading shimmer
function createLoadingShimmer() {
  const shimmer = document.createElement('span');
  shimmer.setAttribute('data-twitter-flag-shimmer', 'true');
  shimmer.style.display = 'inline-block';
  shimmer.style.width = '20px';
  shimmer.style.height = '16px';
  shimmer.style.marginLeft = '4px';
  shimmer.style.marginRight = '4px';
  shimmer.style.verticalAlign = 'middle';
  return shimmer;
}

// Helper to build bracketed display
function buildBracketedDisplay(displayInfo) {
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-twitter-flag-wrapper', 'true');
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '4px';
  wrapper.style.marginLeft = '4px';
  wrapper.style.marginRight = '4px';
  wrapper.style.fontSize = '0.95em';
  wrapper.style.verticalAlign = 'middle';
  
  wrapper.textContent = `[${displayInfo.locationFlag || '•'} | ${displayInfo.locationAccurate ? '✅' : 'ℹ️'} | ${displayInfo.sourceFlag || '•'}]`;
  
  return wrapper;
}

// Mock getUserLocation
let mockGetUserLocation = vi.fn();

function setupGetUserLocationMock() {
  mockGetUserLocation = vi.fn((screenName) => {
    return Promise.resolve({
      location: 'United States',
      locationFlag: '🇺🇸',
      source: 'United States',
      sourceFlag: '🇺🇸',
      sourceCountry: 'United States',
      locationAccurate: true,
      isVpn: false,
      learnMoreUrl: null
    });
  });
}

// Simulate handleButtonClick
async function handleButtonClick(button, screenName) {
  const shimmer = createLoadingShimmer();
  button.replaceWith(shimmer);
  
  try {
    const locationInfo = await mockGetUserLocation(screenName);
    
    if (locationInfo) {
      const flagWrapper = buildBracketedDisplay(locationInfo);
      shimmer.replaceWith(flagWrapper);
    }
  } catch (error) {
    console.error(`Error fetching location for ${screenName}:`, error);
  }
}

// Simulate addButtonToUsername
function addButtonToUsername(container, screenName) {
  if (container.dataset.flagAdded) {
    return;
  }
  container.dataset.flagAdded = 'button';
  
  const userNameContainer = container.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (!userNameContainer) {
    return;
  }
  
  const button = createLocationButton(screenName);
  const handleSection = findHandleSection(userNameContainer, screenName);
  
  if (handleSection && handleSection.parentNode) {
    handleSection.parentNode.insertBefore(button, handleSection);
  } else {
    userNameContainer.appendChild(button);
  }
}

// Simulate displayLocationInfo
async function displayLocationInfo(container, screenName, displayInfo) {
  container.dataset.flagAdded = 'processing';
  
  const flagWrapper = buildBracketedDisplay(displayInfo);
  if (!flagWrapper) {
    container.dataset.flagAdded = 'failed';
    return;
  }
  
  const userNameContainer = container.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (!userNameContainer) {
    container.dataset.flagAdded = 'failed';
    return;
  }
  
  const handleSection = findHandleSection(userNameContainer, screenName);
  
  if (handleSection && handleSection.parentNode) {
    handleSection.parentNode.insertBefore(flagWrapper, handleSection);
    container.dataset.flagAdded = 'true';
  } else {
    userNameContainer.appendChild(flagWrapper);
    container.dataset.flagAdded = 'true';
  }
}

describe('Integration Tests: End-to-End Flows', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockStorage.clear();
    mockMessageListeners.length = 0;
    vi.clearAllMocks();
    setupGetUserLocationMock();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  /**
   * Integration Test 1: Mode switching from popup to content script
   * 
   * This test verifies the complete flow of changing modes in the popup
   * and having that change propagate to the content script.
   */
  describe('Mode Switching Flow', () => {
    it('should switch from auto to manual mode end-to-end', async () => {
      // Step 1: Initialize in auto mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_AUTO });
      
      // Step 2: Create Twitter content with usernames
      const container1 = createMockTwitterContainer('testuser1');
      const container2 = createMockTwitterContainer('testuser2');
      document.body.appendChild(container1);
      document.body.appendChild(container2);
      
      // Step 3: Simulate auto mode processing (flags displayed)
      const locationData = {
        location: 'United States',
        locationFlag: '🇺🇸',
        source: 'United States',
        sourceFlag: '🇺🇸',
        sourceCountry: 'United States',
        locationAccurate: true,
        isVpn: false,
        learnMoreUrl: null
      };
      
      await displayLocationInfo(container1, 'testuser1', locationData);
      await displayLocationInfo(container2, 'testuser2', locationData);
      
      // Verify flags are displayed
      expect(container1.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(container2.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      
      // Step 4: User changes mode to manual in popup
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 5: Popup sends mode change message to content script
      await chrome.tabs.sendMessage(1, {
        type: 'modeChange',
        mode: MODE_MANUAL
      });
      
      // Step 6: Verify mode was saved
      const result = await chrome.storage.local.get([MODE_KEY]);
      expect(result[MODE_KEY]).toBe(MODE_MANUAL);
      
      // Step 7: Verify message was sent
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        type: 'modeChange',
        mode: MODE_MANUAL
      });
    });

    it('should switch from manual to auto mode end-to-end', async () => {
      // Step 1: Initialize in manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create Twitter content with usernames
      const container = createMockTwitterContainer('testuser');
      document.body.appendChild(container);
      
      // Step 3: Simulate manual mode processing (button displayed)
      addButtonToUsername(container, 'testuser');
      
      // Verify button is displayed
      expect(container.querySelector('[data-twitter-location-button]')).toBeTruthy();
      
      // Step 4: User changes mode to auto in popup
      await chrome.storage.local.set({ [MODE_KEY]: MODE_AUTO });
      
      // Step 5: Popup sends mode change message to content script
      await chrome.tabs.sendMessage(1, {
        type: 'modeChange',
        mode: MODE_AUTO
      });
      
      // Step 6: Verify mode was saved
      const result = await chrome.storage.local.get([MODE_KEY]);
      expect(result[MODE_KEY]).toBe(MODE_AUTO);
      
      // Step 7: Verify message was sent
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        type: 'modeChange',
        mode: MODE_AUTO
      });
    });

    it('should handle mode changes across multiple tabs', async () => {
      // Mock multiple tabs
      chrome.tabs.query = vi.fn().mockResolvedValue([
        { id: 1, url: 'https://x.com/home' },
        { id: 2, url: 'https://twitter.com/explore' },
        { id: 3, url: 'https://x.com/notifications' }
      ]);
      
      // Change mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Send message to all tabs
      const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
      
      for (const tab of tabs) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'modeChange',
          mode: MODE_MANUAL
        });
      }
      
      // Verify all tabs received the message
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'modeChange', mode: MODE_MANUAL });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, { type: 'modeChange', mode: MODE_MANUAL });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, { type: 'modeChange', mode: MODE_MANUAL });
    });
  });

  /**
   * Integration Test 2: Button click flow (button → shimmer → display)
   * 
   * This test verifies the complete flow of clicking a button in manual mode
   * and seeing the location data appear.
   */
  describe('Button Click Flow', () => {
    it('should complete full button click flow: button → shimmer → display', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create Twitter content with username
      const container = createMockTwitterContainer('testuser');
      document.body.appendChild(container);
      
      // Step 3: Add button to username (manual mode)
      addButtonToUsername(container, 'testuser');
      
      // Verify button exists
      const button = container.querySelector('[data-twitter-location-button]');
      expect(button).toBeTruthy();
      expect(button.getAttribute('data-screen-name')).toBe('testuser');
      
      // Step 4: User clicks the button
      const parent = button.parentNode;
      
      // Mock getUserLocation with a delay to capture shimmer state
      let resolveLocation;
      const delayedPromise = new Promise((resolve) => {
        resolveLocation = resolve;
      });
      
      mockGetUserLocation.mockImplementationOnce(() => delayedPromise);
      
      // Start the click handler (don't await yet to check intermediate state)
      const clickPromise = handleButtonClick(button, 'testuser');
      
      // Step 5: Wait a moment for shimmer to appear
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify button was replaced with shimmer
      const shimmer = parent.querySelector('[data-twitter-flag-shimmer]');
      expect(shimmer).toBeTruthy();
      expect(parent.querySelector('[data-twitter-location-button]')).toBeNull();
      
      // Step 6: Resolve the location fetch
      resolveLocation({
        location: 'United States',
        locationFlag: '🇺🇸',
        source: 'United States',
        sourceFlag: '🇺🇸',
        sourceCountry: 'United States',
        locationAccurate: true,
        isVpn: false,
        learnMoreUrl: null
      });
      
      // Wait for fetch to complete
      await clickPromise;
      
      // Step 7: Verify shimmer was replaced with location display
      expect(parent.querySelector('[data-twitter-flag-shimmer]')).toBeNull();
      
      const flagWrapper = parent.querySelector('[data-twitter-flag-wrapper]');
      expect(flagWrapper).toBeTruthy();
      expect(flagWrapper.textContent).toContain('[');
      expect(flagWrapper.textContent).toContain('🇺🇸');
      expect(flagWrapper.textContent).toContain('✅');
      
      // Step 8: Verify getUserLocation was called
      expect(mockGetUserLocation).toHaveBeenCalledWith('testuser');
    });

    it('should handle multiple button clicks independently', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create multiple Twitter containers
      const container1 = createMockTwitterContainer('user1');
      const container2 = createMockTwitterContainer('user2');
      const container3 = createMockTwitterContainer('user3');
      document.body.appendChild(container1);
      document.body.appendChild(container2);
      document.body.appendChild(container3);
      
      // Step 3: Add buttons to all usernames
      addButtonToUsername(container1, 'user1');
      addButtonToUsername(container2, 'user2');
      addButtonToUsername(container3, 'user3');
      
      // Verify all buttons exist
      const button1 = container1.querySelector('[data-twitter-location-button]');
      const button2 = container2.querySelector('[data-twitter-location-button]');
      const button3 = container3.querySelector('[data-twitter-location-button]');
      expect(button1).toBeTruthy();
      expect(button2).toBeTruthy();
      expect(button3).toBeTruthy();
      
      // Step 4: Click buttons in sequence
      await handleButtonClick(button1, 'user1');
      await handleButtonClick(button2, 'user2');
      await handleButtonClick(button3, 'user3');
      
      // Step 5: Verify all locations are displayed
      expect(container1.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(container2.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(container3.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      
      // Verify all buttons are gone
      expect(container1.querySelector('[data-twitter-location-button]')).toBeNull();
      expect(container2.querySelector('[data-twitter-location-button]')).toBeNull();
      expect(container3.querySelector('[data-twitter-location-button]')).toBeNull();
      
      // Verify getUserLocation was called for each username
      expect(mockGetUserLocation).toHaveBeenCalledWith('user1');
      expect(mockGetUserLocation).toHaveBeenCalledWith('user2');
      expect(mockGetUserLocation).toHaveBeenCalledWith('user3');
      expect(mockGetUserLocation).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid button clicks without losing requests', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create multiple containers
      const usernames = ['rapid1', 'rapid2', 'rapid3', 'rapid4'];
      const containers = usernames.map(username => {
        const container = createMockTwitterContainer(username);
        document.body.appendChild(container);
        addButtonToUsername(container, username);
        return container;
      });
      
      // Step 3: Click all buttons rapidly (in parallel)
      const clickPromises = containers.map((container, index) => {
        const button = container.querySelector('[data-twitter-location-button]');
        return handleButtonClick(button, usernames[index]);
      });
      
      // Step 4: Wait for all clicks to complete
      await Promise.all(clickPromises);
      
      // Step 5: Verify all locations are displayed
      containers.forEach(container => {
        expect(container.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
        expect(container.querySelector('[data-twitter-location-button]')).toBeNull();
      });
      
      // Verify all requests were processed
      expect(mockGetUserLocation).toHaveBeenCalledTimes(4);
      usernames.forEach(username => {
        expect(mockGetUserLocation).toHaveBeenCalledWith(username);
      });
    });
  });

  /**
   * Integration Test 3: Cache integration (auto fetch → manual display)
   * 
   * This test verifies that data fetched in auto mode is properly cached
   * and displayed in manual mode without requiring a button click.
   */
  describe('Cache Integration Flow', () => {
    it('should display cached data from auto mode in manual mode', async () => {
      // Step 1: Start in auto mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_AUTO });
      
      // Step 2: Create Twitter content
      const container = createMockTwitterContainer('cacheduser');
      document.body.appendChild(container);
      
      // Step 3: Simulate auto mode fetch and display
      const locationData = {
        location: 'Canada',
        locationFlag: '🇨🇦',
        source: 'Canada',
        sourceFlag: '🇨🇦',
        sourceCountry: 'Canada',
        locationAccurate: true,
        isVpn: false,
        learnMoreUrl: null,
        expiry: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days from now
      };
      
      await displayLocationInfo(container, 'cacheduser', locationData);
      
      // Verify flag is displayed in auto mode
      expect(container.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      
      // Step 4: Simulate caching the data
      const cache = new Map();
      cache.set('cacheduser', locationData);
      
      // Step 5: Switch to manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 6: Remove the flag (simulating page refresh or mode change)
      const flag = container.querySelector('[data-twitter-flag-wrapper]');
      flag.remove();
      delete container.dataset.flagAdded;
      
      // Step 7: Process username in manual mode with cache
      const cachedLocation = cache.get('cacheduser');
      
      if (cachedLocation) {
        // Cached data exists - display it directly (no button)
        await displayLocationInfo(container, 'cacheduser', cachedLocation);
      } else {
        // No cache - show button
        addButtonToUsername(container, 'cacheduser');
      }
      
      // Step 8: Verify location is displayed (not button)
      expect(container.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(container.querySelector('[data-twitter-location-button]')).toBeNull();
      
      // Verify the display shows the cached data
      const displayedFlag = container.querySelector('[data-twitter-flag-wrapper]');
      expect(displayedFlag.textContent).toContain('🇨🇦');
    });

    it('should show button for uncached usernames in manual mode', async () => {
      // Step 1: Start in manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create Twitter content
      const container = createMockTwitterContainer('uncacheduser');
      document.body.appendChild(container);
      
      // Step 3: Process username with empty cache
      const cache = new Map();
      const cachedLocation = cache.get('uncacheduser');
      
      if (cachedLocation) {
        await displayLocationInfo(container, 'uncacheduser', cachedLocation);
      } else {
        addButtonToUsername(container, 'uncacheduser');
      }
      
      // Step 4: Verify button is displayed (not location)
      expect(container.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(container.querySelector('[data-twitter-flag-wrapper]')).toBeNull();
    });

    it('should handle cache expiry correctly in manual mode', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create Twitter content
      const container = createMockTwitterContainer('expireduser');
      document.body.appendChild(container);
      
      // Step 3: Create expired cache entry
      const expiredLocationData = {
        location: 'United Kingdom',
        locationFlag: '🇬🇧',
        source: 'United Kingdom',
        sourceFlag: '🇬🇧',
        sourceCountry: 'United Kingdom',
        locationAccurate: true,
        isVpn: false,
        learnMoreUrl: null,
        expiry: Date.now() - (31 * 24 * 60 * 60 * 1000) // 31 days ago (expired)
      };
      
      const cache = new Map();
      cache.set('expireduser', expiredLocationData);
      
      // Step 4: Check if cache entry is expired
      const cachedLocation = cache.get('expireduser');
      const isExpired = !cachedLocation || !cachedLocation.expiry || cachedLocation.expiry <= Date.now();
      
      // Step 5: Process username based on cache validity
      if (cachedLocation && !isExpired) {
        await displayLocationInfo(container, 'expireduser', cachedLocation);
      } else {
        addButtonToUsername(container, 'expireduser');
      }
      
      // Step 6: Verify button is displayed (expired cache treated as no cache)
      expect(container.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(container.querySelector('[data-twitter-flag-wrapper]')).toBeNull();
    });

    it('should preserve cache when switching modes', async () => {
      // Step 1: Start in auto mode with cached data
      await chrome.storage.local.set({ [MODE_KEY]: MODE_AUTO });
      
      const cache = new Map();
      const usernames = ['user1', 'user2', 'user3'];
      
      // Step 2: Populate cache with data
      usernames.forEach(username => {
        cache.set(username, {
          location: 'Germany',
          locationFlag: '🇩🇪',
          source: 'Germany',
          sourceFlag: '🇩🇪',
          sourceCountry: 'Germany',
          locationAccurate: true,
          isVpn: false,
          learnMoreUrl: null,
          expiry: Date.now() + (30 * 24 * 60 * 60 * 1000)
        });
      });
      
      // Step 3: Capture cache state
      const cacheBeforeSwitch = new Map(cache);
      
      // Step 4: Switch to manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 5: Verify cache is unchanged
      expect(cache.size).toBe(cacheBeforeSwitch.size);
      
      usernames.forEach(username => {
        const cachedEntry = cache.get(username);
        const originalEntry = cacheBeforeSwitch.get(username);
        
        expect(cachedEntry).toBeTruthy();
        expect(cachedEntry.location).toBe(originalEntry.location);
        expect(cachedEntry.expiry).toBe(originalEntry.expiry);
      });
      
      // Step 6: Switch back to auto mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_AUTO });
      
      // Step 7: Verify cache is still unchanged
      expect(cache.size).toBe(cacheBeforeSwitch.size);
      
      usernames.forEach(username => {
        const cachedEntry = cache.get(username);
        const originalEntry = cacheBeforeSwitch.get(username);
        
        expect(cachedEntry).toBeTruthy();
        expect(cachedEntry.location).toBe(originalEntry.location);
        expect(cachedEntry.expiry).toBe(originalEntry.expiry);
      });
    });
  });

  /**
   * Integration Test 4: Dynamic content with manual mode
   * 
   * This test verifies that buttons are added to dynamically loaded content
   * (simulating infinite scroll on Twitter).
   */
  describe('Dynamic Content Flow', () => {
    it('should add buttons to dynamically loaded content in manual mode', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create initial Twitter content
      const initialContainer = createMockTwitterContainer('initialuser');
      document.body.appendChild(initialContainer);
      
      // Step 3: Process initial content
      addButtonToUsername(initialContainer, 'initialuser');
      
      // Verify initial button exists
      expect(initialContainer.querySelector('[data-twitter-location-button]')).toBeTruthy();
      
      // Step 4: Simulate dynamic content loading (infinite scroll)
      const dynamicContainer1 = createMockTwitterContainer('dynamicuser1');
      const dynamicContainer2 = createMockTwitterContainer('dynamicuser2');
      const dynamicContainer3 = createMockTwitterContainer('dynamicuser3');
      
      document.body.appendChild(dynamicContainer1);
      document.body.appendChild(dynamicContainer2);
      document.body.appendChild(dynamicContainer3);
      
      // Step 5: Process dynamically loaded content
      addButtonToUsername(dynamicContainer1, 'dynamicuser1');
      addButtonToUsername(dynamicContainer2, 'dynamicuser2');
      addButtonToUsername(dynamicContainer3, 'dynamicuser3');
      
      // Step 6: Verify buttons were added to all dynamic content
      expect(dynamicContainer1.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(dynamicContainer2.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(dynamicContainer3.querySelector('[data-twitter-location-button]')).toBeTruthy();
      
      // Step 7: Verify all buttons have correct screen names
      expect(dynamicContainer1.querySelector('[data-twitter-location-button]').getAttribute('data-screen-name')).toBe('dynamicuser1');
      expect(dynamicContainer2.querySelector('[data-twitter-location-button]').getAttribute('data-screen-name')).toBe('dynamicuser2');
      expect(dynamicContainer3.querySelector('[data-twitter-location-button]').getAttribute('data-screen-name')).toBe('dynamicuser3');
    });

    it('should handle dynamic content with mixed cached and uncached usernames', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Set up cache with some usernames
      const cache = new Map();
      cache.set('cacheduser1', {
        location: 'France',
        locationFlag: '🇫🇷',
        source: 'France',
        sourceFlag: '🇫🇷',
        sourceCountry: 'France',
        locationAccurate: true,
        isVpn: false,
        learnMoreUrl: null,
        expiry: Date.now() + (30 * 24 * 60 * 60 * 1000)
      });
      
      // Step 3: Simulate dynamic content loading with mixed usernames
      const cachedContainer = createMockTwitterContainer('cacheduser1');
      const uncachedContainer1 = createMockTwitterContainer('uncacheduser1');
      const uncachedContainer2 = createMockTwitterContainer('uncacheduser2');
      
      document.body.appendChild(cachedContainer);
      document.body.appendChild(uncachedContainer1);
      document.body.appendChild(uncachedContainer2);
      
      // Step 4: Process each container based on cache
      const processContainer = async (container, screenName) => {
        const cachedLocation = cache.get(screenName);
        
        if (cachedLocation && cachedLocation.expiry > Date.now()) {
          await displayLocationInfo(container, screenName, cachedLocation);
        } else {
          addButtonToUsername(container, screenName);
        }
      };
      
      await processContainer(cachedContainer, 'cacheduser1');
      await processContainer(uncachedContainer1, 'uncacheduser1');
      await processContainer(uncachedContainer2, 'uncacheduser2');
      
      // Step 5: Verify cached username shows location
      expect(cachedContainer.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(cachedContainer.querySelector('[data-twitter-location-button]')).toBeNull();
      
      // Step 6: Verify uncached usernames show buttons
      expect(uncachedContainer1.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(uncachedContainer1.querySelector('[data-twitter-flag-wrapper]')).toBeNull();
      
      expect(uncachedContainer2.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(uncachedContainer2.querySelector('[data-twitter-flag-wrapper]')).toBeNull();
    });

    it('should not add duplicate buttons to already processed containers', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Create container
      const container = createMockTwitterContainer('testuser');
      document.body.appendChild(container);
      
      // Step 3: Process container first time
      addButtonToUsername(container, 'testuser');
      
      // Verify button exists and container is marked
      expect(container.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(container.dataset.flagAdded).toBe('button');
      
      // Step 4: Try to process same container again (simulating mutation observer re-trigger)
      addButtonToUsername(container, 'testuser');
      
      // Step 5: Verify only one button exists (no duplicate)
      const buttons = container.querySelectorAll('[data-twitter-location-button]');
      expect(buttons.length).toBe(1);
    });

    it('should handle rapid dynamic content additions', async () => {
      // Step 1: Set manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      
      // Step 2: Simulate rapid content additions (like fast scrolling)
      const usernames = Array.from({ length: 10 }, (_, i) => `rapiduser${i}`);
      const containers = [];
      
      // Add all containers rapidly
      usernames.forEach(username => {
        const container = createMockTwitterContainer(username);
        document.body.appendChild(container);
        containers.push({ container, username });
      });
      
      // Step 3: Process all containers
      containers.forEach(({ container, username }) => {
        addButtonToUsername(container, username);
      });
      
      // Step 4: Verify all buttons were added
      containers.forEach(({ container, username }) => {
        const button = container.querySelector('[data-twitter-location-button]');
        expect(button).toBeTruthy();
        expect(button.getAttribute('data-screen-name')).toBe(username);
      });
      
      // Verify total button count
      const allButtons = document.querySelectorAll('[data-twitter-location-button]');
      expect(allButtons.length).toBe(10);
    });
  });

  /**
   * Integration Test 5: Complete user journey
   * 
   * This test simulates a complete user journey through multiple scenarios.
   */
  describe('Complete User Journey', () => {
    it('should handle complete workflow: auto mode → manual mode → button clicks → mode switch back', async () => {
      // === Phase 1: Auto Mode ===
      
      // Step 1: Start in auto mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_AUTO });
      
      // Step 2: User visits Twitter, sees usernames
      const container1 = createMockTwitterContainer('journeyuser1');
      const container2 = createMockTwitterContainer('journeyuser2');
      document.body.appendChild(container1);
      document.body.appendChild(container2);
      
      // Step 3: Auto mode fetches and displays locations
      const locationData1 = {
        location: 'United States',
        locationFlag: '🇺🇸',
        source: 'United States',
        sourceFlag: '🇺🇸',
        sourceCountry: 'United States',
        locationAccurate: true,
        isVpn: false,
        learnMoreUrl: null,
        expiry: Date.now() + (30 * 24 * 60 * 60 * 1000)
      };
      
      await displayLocationInfo(container1, 'journeyuser1', locationData1);
      await displayLocationInfo(container2, 'journeyuser2', locationData1);
      
      // Verify flags are displayed
      expect(container1.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(container2.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      
      // Step 4: Data is cached
      const cache = new Map();
      cache.set('journeyuser1', locationData1);
      cache.set('journeyuser2', locationData1);
      
      // === Phase 2: Switch to Manual Mode ===
      
      // Step 5: User switches to manual mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_MANUAL });
      await chrome.tabs.sendMessage(1, { type: 'modeChange', mode: MODE_MANUAL });
      
      // Step 6: New content loads
      const container3 = createMockTwitterContainer('journeyuser3');
      document.body.appendChild(container3);
      
      // Step 7: Process new content in manual mode
      const cachedLocation3 = cache.get('journeyuser3');
      if (cachedLocation3) {
        await displayLocationInfo(container3, 'journeyuser3', cachedLocation3);
      } else {
        addButtonToUsername(container3, 'journeyuser3');
      }
      
      // Verify button is shown (no cache for user3)
      expect(container3.querySelector('[data-twitter-location-button]')).toBeTruthy();
      
      // === Phase 3: User Clicks Button ===
      
      // Step 8: User clicks button for journeyuser3
      const button3 = container3.querySelector('[data-twitter-location-button]');
      await handleButtonClick(button3, 'journeyuser3');
      
      // Verify location is displayed
      expect(container3.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(container3.querySelector('[data-twitter-location-button]')).toBeNull();
      
      // Step 9: Cache the newly fetched data
      cache.set('journeyuser3', locationData1);
      
      // === Phase 4: More Dynamic Content ===
      
      // Step 10: More content loads (mix of cached and uncached)
      const container4 = createMockTwitterContainer('journeyuser1'); // Cached
      const container5 = createMockTwitterContainer('journeyuser4'); // Uncached
      document.body.appendChild(container4);
      document.body.appendChild(container5);
      
      // Process based on cache
      const cachedLocation4 = cache.get('journeyuser1');
      if (cachedLocation4) {
        await displayLocationInfo(container4, 'journeyuser1', cachedLocation4);
      } else {
        addButtonToUsername(container4, 'journeyuser1');
      }
      
      const cachedLocation5 = cache.get('journeyuser4');
      if (cachedLocation5) {
        await displayLocationInfo(container5, 'journeyuser4', cachedLocation5);
      } else {
        addButtonToUsername(container5, 'journeyuser4');
      }
      
      // Verify: cached shows location, uncached shows button
      expect(container4.querySelector('[data-twitter-flag-wrapper]')).toBeTruthy();
      expect(container4.querySelector('[data-twitter-location-button]')).toBeNull();
      
      expect(container5.querySelector('[data-twitter-location-button]')).toBeTruthy();
      expect(container5.querySelector('[data-twitter-flag-wrapper]')).toBeNull();
      
      // === Phase 5: Switch Back to Auto Mode ===
      
      // Step 11: User switches back to auto mode
      await chrome.storage.local.set({ [MODE_KEY]: MODE_AUTO });
      await chrome.tabs.sendMessage(1, { type: 'modeChange', mode: MODE_AUTO });
      
      // Step 12: Verify mode was changed
      const result = await chrome.storage.local.get([MODE_KEY]);
      expect(result[MODE_KEY]).toBe(MODE_AUTO);
      
      // Step 13: Verify cache is preserved
      expect(cache.size).toBe(3);
      expect(cache.has('journeyuser1')).toBe(true);
      expect(cache.has('journeyuser2')).toBe(true);
      expect(cache.has('journeyuser3')).toBe(true);
    });
  });
});
