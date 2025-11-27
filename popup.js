// Popup script for extension toggle
const TOGGLE_KEY = 'extension_enabled';
const DEFAULT_ENABLED = true;

// Mode constants
const MODE_KEY = 'display_mode';
const MODE_AUTO = 'auto';
const MODE_MANUAL = 'manual';
const DEFAULT_MODE = MODE_AUTO;

// Get toggle element
const toggleSwitch = document.getElementById('toggleSwitch');
const status = document.getElementById('status');

// Get mode buttons
const autoButton = document.getElementById('autoButton');
const manualButton = document.getElementById('manualButton');

// Load current state
chrome.storage.local.get([TOGGLE_KEY, MODE_KEY], (result) => {
  const isEnabled = result[TOGGLE_KEY] !== undefined ? result[TOGGLE_KEY] : DEFAULT_ENABLED;
  updateToggle(isEnabled);
  
  const mode = result[MODE_KEY] || DEFAULT_MODE;
  loadMode(mode);
});

// Toggle click handler
toggleSwitch.addEventListener('click', () => {
  chrome.storage.local.get([TOGGLE_KEY], (result) => {
    const currentState = result[TOGGLE_KEY] !== undefined ? result[TOGGLE_KEY] : DEFAULT_ENABLED;
    const newState = !currentState;
    
    chrome.storage.local.set({ [TOGGLE_KEY]: newState }, () => {
      updateToggle(newState);
      
      // Notify content script to update
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'extensionToggle',
            enabled: newState
          }).catch(() => {
            // Tab might not have content script loaded yet, that's okay
          });
        }
      });
    });
  });
});

function updateToggle(isEnabled) {
  if (isEnabled) {
    toggleSwitch.classList.add('enabled');
    status.textContent = 'Extension is enabled';
    status.style.color = '#1d9bf0';
  } else {
    toggleSwitch.classList.remove('enabled');
    status.textContent = 'Extension is disabled';
    status.style.color = '#536471';
  }
}

// Load and display current mode
function loadMode(mode) {
  const currentMode = mode || DEFAULT_MODE;
  updateModeUI(currentMode);
}

// Update mode UI
function updateModeUI(mode) {
  if (mode === MODE_AUTO) {
    autoButton.classList.add('active');
    manualButton.classList.remove('active');
  } else {
    manualButton.classList.add('active');
    autoButton.classList.remove('active');
  }
}

// Set mode and notify content script
function setMode(newMode) {
  chrome.storage.local.set({ [MODE_KEY]: newMode }, () => {
    updateModeUI(newMode);
    
    // Notify content script about mode change
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'modeChange',
          mode: newMode
        }).catch(() => {
          // Tab might not have content script loaded yet, that's okay
        });
      }
    });
  });
}

// Mode button click handlers
autoButton.addEventListener('click', () => {
  setMode(MODE_AUTO);
});

manualButton.addEventListener('click', () => {
  setMode(MODE_MANUAL);
});

