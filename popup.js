// Popup script for extension toggle
const TOGGLE_KEY = 'extension_enabled';
const DEFAULT_ENABLED = true;
const HIDDEN_COUNTRIES_KEY = 'hidden_countries';

let hiddenCountries = [];

// Get toggle element
const toggleSwitch = document.getElementById('toggleSwitch');
const status = document.getElementById('status');
const hiddenCountriesContainer = document.getElementById('hiddenCountries');
const countryInput = document.getElementById('countryInput');
const addCountryBtn = document.getElementById('addCountryBtn');
const clearCountriesBtn = document.getElementById('clearCountries');
const countrySuggestions = document.getElementById('countrySuggestions');

function normalizeCountryName(name) {
  return name.trim();
}

function saveHiddenCountries(countries) {
  hiddenCountries = countries;
  chrome.storage.local.set({ [HIDDEN_COUNTRIES_KEY]: hiddenCountries }, () => {
    renderHiddenCountries();
    notifyContentScripts();
  });
}

function notifyContentScripts() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    try {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'updateHiddenCountries',
        countries: hiddenCountries
      }, () => {});
    } catch (e) {
      // Content script may not be loaded yet; ignore
    }
  });
}

function renderHiddenCountries() {
  hiddenCountriesContainer.innerHTML = '';
  
  if (!hiddenCountries.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No countries hidden';
    empty.style.color = '#536471';
    empty.style.fontSize = '12px';
    hiddenCountriesContainer.appendChild(empty);
    return;
  }
  
  hiddenCountries.forEach(country => {
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = country;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'x';
    removeBtn.title = `Remove ${country}`;
    removeBtn.addEventListener('click', () => {
      hiddenCountries = hiddenCountries.filter(c => c.toLowerCase() !== country.toLowerCase());
      saveHiddenCountries(hiddenCountries);
    });
    
    pill.appendChild(removeBtn);
    hiddenCountriesContainer.appendChild(pill);
  });
}

function populateCountrySuggestions() {
  if (!countrySuggestions || typeof COUNTRY_FLAGS !== 'object') return;
  countrySuggestions.innerHTML = '';
  
  Object.keys(COUNTRY_FLAGS)
    .sort((a, b) => a.localeCompare(b))
    .forEach(country => {
      const option = document.createElement('option');
      option.value = country;
      countrySuggestions.appendChild(option);
    });
}

function addCountryFromInput() {
  const value = normalizeCountryName(countryInput.value);
  if (!value) return;
  
  const exists = hiddenCountries.some(c => c.toLowerCase() === value.toLowerCase());
  if (exists) {
    countryInput.value = '';
    return;
  }
  
  hiddenCountries.push(value);
  saveHiddenCountries(hiddenCountries);
  countryInput.value = '';
}

countryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCountryFromInput();
  }
});

addCountryBtn.addEventListener('click', addCountryFromInput);

clearCountriesBtn.addEventListener('click', () => {
  hiddenCountries = [];
  saveHiddenCountries(hiddenCountries);
});

// Load current state
chrome.storage.local.get([TOGGLE_KEY, HIDDEN_COUNTRIES_KEY], (result) => {
  const isEnabled = result[TOGGLE_KEY] !== undefined ? result[TOGGLE_KEY] : DEFAULT_ENABLED;
  updateToggle(isEnabled);
  
  hiddenCountries = Array.isArray(result[HIDDEN_COUNTRIES_KEY]) ? result[HIDDEN_COUNTRIES_KEY] : [];
  renderHiddenCountries();
  populateCountrySuggestions();
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

