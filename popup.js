// DOM Elements
const toggle = document.getElementById('toggle-inspector');
const colorInput = document.getElementById('color-input');
const widthInput = document.getElementById('width-input');
const styleSelect = document.getElementById('style-select');

const DEFAULT_SETTINGS = {
  inspectorEnabled: false,
  highlightColor: '#f44336',
  highlightWidth: 2,
  highlightStyle: 'solid',
};

// Load settings and update UI
function loadSettings() {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    toggle.checked = settings.inspectorEnabled;
    colorInput.value = settings.highlightColor;
    widthInput.value = settings.highlightWidth;
    styleSelect.value = settings.highlightStyle;
  });
}

// Save settings
function saveSettings() {
  const settings = {
    inspectorEnabled: toggle.checked,
    highlightColor: colorInput.value,
    highlightWidth: parseInt(widthInput.value, 10),
    highlightStyle: styleSelect.value,
  };
  chrome.storage.local.set(settings);
}

// --- Event Listeners ---
// Listen for toggle changes
toggle.addEventListener('change', () => {
  saveSettings();
  // The content script will react to the storage change,
  // but we can send a message for immediate effect if needed.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'toggleInspector',
        payload: toggle.checked,
      });
    }
  });
});

// Listen for style changes
colorInput.addEventListener('input', saveSettings);
widthInput.addEventListener('change', saveSettings);
styleSelect.addEventListener('change', saveSettings);

// Initial load
document.addEventListener('DOMContentLoaded', loadSettings);
