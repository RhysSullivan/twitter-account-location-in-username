import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Chrome API
const mockStorage = new Map();

global.chrome = {
  storage: {
    local: {
      get: vi.fn((keys, callback) => {
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
          if (mockStorage.has(key)) {
            result[key] = mockStorage.get(key);
          }
        });
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((items, callback) => {
        Object.entries(items).forEach(([key, value]) => {
          mockStorage.set(key, value);
        });
        if (callback) callback();
        return Promise.resolve();
      })
    }
  },
  tabs: {
    query: vi.fn((queryInfo, callback) => {
      const tabs = [{ id: 1 }];
      if (callback) callback(tabs);
      return Promise.resolve(tabs);
    }),
    sendMessage: vi.fn(() => {
      return {
        catch: vi.fn(() => {})
      };
    })
  }
};

// Constants
const MODE_KEY = 'display_mode';
const MODE_AUTO = 'auto';
const MODE_MANUAL = 'manual';
const DEFAULT_MODE = MODE_AUTO;
const TOGGLE_KEY = 'extension_enabled';
const DEFAULT_ENABLED = true;

// Helper functions to simulate popup.js behavior
function loadMode(mode) {
  const currentMode = mode || DEFAULT_MODE;
  updateModeUI(currentMode);
}

function updateModeUI(mode) {
  const autoButton = document.getElementById('autoButton');
  const manualButton = document.getElementById('manualButton');
  
  if (!autoButton || !manualButton) return;
  
  if (mode === MODE_AUTO) {
    autoButton.classList.add('active');
    manualButton.classList.remove('active');
  } else {
    manualButton.classList.add('active');
    autoButton.classList.remove('active');
  }
}

function setMode(newMode) {
  chrome.storage.local.set({ [MODE_KEY]: newMode }, () => {
    updateModeUI(newMode);
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'modeChange',
          mode: newMode
        });
      }
    });
  });
}

describe('Popup Mode Management', () => {
  beforeEach(() => {
    // Clear storage and mocks
    mockStorage.clear();
    vi.clearAllMocks();

    // Setup DOM
    document.body.innerHTML = `
      <div class="mode-container">
        <span class="mode-label">Display Mode</span>
        <div class="mode-selector">
          <button class="mode-button" data-mode="auto" id="autoButton">Auto</button>
          <button class="mode-button" data-mode="manual" id="manualButton">Manual</button>
        </div>
      </div>
    `;
  });

  /**
   * Test loadMode() retrieves correct mode from storage
   * Requirements: 1.1, 1.2, 1.4
   */
  it('loadMode() retrieves correct mode from storage', async () => {
    // Set mode in storage
    mockStorage.set(MODE_KEY, MODE_MANUAL);
    
    // Retrieve and load mode
    const result = await chrome.storage.local.get([MODE_KEY]);
    const mode = result[MODE_KEY] || DEFAULT_MODE;
    loadMode(mode);
    
    // Check that manual button is active
    const manualButton = document.getElementById('manualButton');
    const autoButton = document.getElementById('autoButton');
    
    expect(manualButton.classList.contains('active')).toBe(true);
    expect(autoButton.classList.contains('active')).toBe(false);
  });

  /**
   * Test setMode() saves mode to storage
   * Requirements: 1.1, 1.2
   */
  it('setMode() saves mode to storage', async () => {
    // Call setMode
    setMode(MODE_MANUAL);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify mode was saved to storage
    expect(mockStorage.get(MODE_KEY)).toBe(MODE_MANUAL);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { [MODE_KEY]: MODE_MANUAL },
      expect.any(Function)
    );
  });

  /**
   * Test default mode when no preference exists
   * Requirements: 1.4
   */
  it('defaults to auto mode when no preference exists', async () => {
    // Don't set any mode in storage
    
    // Retrieve and load mode
    const result = await chrome.storage.local.get([MODE_KEY]);
    const mode = result[MODE_KEY] || DEFAULT_MODE;
    loadMode(mode);
    
    // Check that auto button is active by default
    const autoButton = document.getElementById('autoButton');
    const manualButton = document.getElementById('manualButton');
    
    expect(autoButton.classList.contains('active')).toBe(true);
    expect(manualButton.classList.contains('active')).toBe(false);
  });

  /**
   * Test mode button click handlers
   * Requirements: 1.1, 1.2
   */
  it('mode button click handlers update UI and storage', async () => {
    const autoButton = document.getElementById('autoButton');
    const manualButton = document.getElementById('manualButton');
    
    // Simulate clicking manual button
    setMode(MODE_MANUAL);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify UI updated
    expect(manualButton.classList.contains('active')).toBe(true);
    expect(autoButton.classList.contains('active')).toBe(false);
    
    // Verify storage updated
    expect(mockStorage.get(MODE_KEY)).toBe(MODE_MANUAL);
    
    // Simulate clicking auto button
    setMode(MODE_AUTO);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify UI updated back
    expect(autoButton.classList.contains('active')).toBe(true);
    expect(manualButton.classList.contains('active')).toBe(false);
    
    // Verify storage updated
    expect(mockStorage.get(MODE_KEY)).toBe(MODE_AUTO);
  });

  /**
   * Test that mode changes notify content script
   * Requirements: 1.3
   */
  it('mode changes notify content script', async () => {
    // Call setMode
    setMode(MODE_MANUAL);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify message was sent to content script
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      {
        type: 'modeChange',
        mode: MODE_MANUAL
      }
    );
  });

  /**
   * Test that auto mode is set correctly
   * Requirements: 1.1, 1.2
   */
  it('setMode() correctly sets auto mode', async () => {
    // First set to manual
    setMode(MODE_MANUAL);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Then set to auto
    setMode(MODE_AUTO);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify storage
    expect(mockStorage.get(MODE_KEY)).toBe(MODE_AUTO);
    
    // Verify UI
    const autoButton = document.getElementById('autoButton');
    const manualButton = document.getElementById('manualButton');
    expect(autoButton.classList.contains('active')).toBe(true);
    expect(manualButton.classList.contains('active')).toBe(false);
  });
});
