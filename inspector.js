// --- Global State ---
let isInspectorActive = false;
let highlightedElement = null;
let pinnedElement = null;
let childHighlights = [];
let infoBox = null;
let settings = {};

const DEFAULT_SETTINGS = {
  inspectorEnabled: false,
  highlightColor: '#f44336',
  highlightWidth: 2,
  highlightStyle: 'solid',
};

// --- Style Generation ---
function getOutlineStyle(type) {
  const { highlightColor, highlightWidth, highlightStyle } = settings;
  switch (type) {
    case 'temp':
      return `${highlightWidth}px ${highlightStyle} ${highlightColor}B3`; // 70% opacity
    case 'pinned':
      return `${highlightWidth + 1}px ${highlightStyle} ${highlightColor}`;
    case 'child':
      return `1px dashed ${highlightColor}E6`; // 90% opacity
    default:
      return 'none';
  }
}

// --- Info Box Logic ---
function createInfoBox() {
  if (document.getElementById('inspector-info-box')) return;
  infoBox = document.createElement('div');
  infoBox.id = 'inspector-info-box';
  document.body.appendChild(infoBox);

  let isDragging = false, offsetX, offsetY;
  const header = document.createElement('div');
  header.id = 'inspector-info-box-header';
  header.textContent = 'Element Inspector';
  infoBox.appendChild(header);

  header.addEventListener('mousedown', (e) => { isDragging = true; offsetX = e.clientX - infoBox.getBoundingClientRect().left; offsetY = e.clientY - infoBox.getBoundingClientRect().top; });
  document.addEventListener('mousemove', (e) => { if (isDragging) { infoBox.style.left = `${e.clientX - offsetX}px`; infoBox.style.top = `${e.clientY - offsetY}px`; infoBox.style.right = 'auto'; } });
  document.addEventListener('mouseup', () => { isDragging = false; });
}

function getEventHandlers(element) {
    const events = [];
    for (const prop in element) {
        if (prop.startsWith('on') && element[prop]) {
            events.push(prop.substring(2));
        }
    }
    return events.length ? events.join(', ') : '<em>none found</em>';
}

function updateInfoBox(element) {
  if (!infoBox) createInfoBox();

  const styles = window.getComputedStyle(element);
  const eventHandlers = getEventHandlers(element);

  infoBox.style.display = 'block';
  infoBox.innerHTML = `
    <div id="inspector-info-box-header">Element Inspector</div>
    <div id="inspector-info-box-content">
      <p><strong>Tag:</strong> ${element.tagName.toLowerCase()}</p>
      <p><strong>ID:</strong> ${element.id || '<em>none</em>'}</p>
      <p><strong>Classes:</strong> ${element.classList.value || '<em>none</em>'}</p>
      <hr>
      <p><strong>Font Size:</strong> ${styles.fontSize}</p>
      <p><strong>Color:</strong> ${styles.color}</p>
      <p><strong>Padding:</strong> ${styles.padding}</p>
      <p><strong>Margin:</strong> ${styles.margin}</p>
      <hr>
      <p><strong>JS Events:</strong> ${eventHandlers}</p>
      <button id="highlight-children-btn">Highlight Children (${element.children.length})</button>
    </div>`;
  document.getElementById('highlight-children-btn').addEventListener('click', () => highlightChildren(element));
}

function hideInfoBox() { if (infoBox) infoBox.style.display = 'none'; }
function highlightChildren(element) { clearChildHighlights(); for (const child of element.children) { child.style.outline = getOutlineStyle('child'); childHighlights.push(child); } }
function clearChildHighlights() { childHighlights.forEach(child => child.style.outline = ''); childHighlights = []; }

// --- Inspector Logic ---
function handleMouseOver(e) {
  if (e.target === pinnedElement || infoBox?.contains(e.target)) return;
  if (highlightedElement) highlightedElement.style.outline = '';
  highlightedElement = e.target;
  highlightedElement.style.outline = getOutlineStyle('temp');
}

function handleMouseOut(e) { if (highlightedElement) { highlightedElement.style.outline = ''; highlightedElement = null; } }

function handleClick(e) {
  if (infoBox?.contains(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  clearChildHighlights();

  if (e.target === pinnedElement) {
    pinnedElement.style.outline = '';
    pinnedElement = null;
    hideInfoBox();
    return;
  }
  if (pinnedElement) pinnedElement.style.outline = '';

  pinnedElement = e.target;
  pinnedElement.style.outline = getOutlineStyle('pinned');
  updateInfoBox(pinnedElement);
}

function startInspector() {
  if (isInspectorActive) return;
  isInspectorActive = true;
  chrome.storage.local.get(DEFAULT_SETTINGS, (loadedSettings) => {
    settings = loadedSettings;
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleClick, true);
  });
}

function stopInspector() {
  if (!isInspectorActive) return;
  isInspectorActive = false;
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  document.removeEventListener('click', handleClick, true);
  if (highlightedElement) highlightedElement.style.outline = '';
  if (pinnedElement) pinnedElement.style.outline = '';
  clearChildHighlights();
  if (infoBox) infoBox.remove();
  highlightedElement = pinnedElement = infoBox = null;
}

// --- Init and Listeners ---
function applySettingsChanges() {
    if (pinnedElement) pinnedElement.style.outline = getOutlineStyle('pinned');
    if (highlightedElement) highlightedElement.style.outline = getOutlineStyle('temp');
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const oldSettings = { ...settings };
    let needsUpdate = false;
    for (let key in changes) {
      if (key in settings) {
        settings[key] = changes[key].newValue;
        if (oldSettings[key] !== settings[key]) needsUpdate = true;
      }
    }
    if (isInspectorActive && needsUpdate) applySettingsChanges();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'toggleInspector') {
    message.payload ? startInspector() : stopInspector();
  }
});

chrome.storage.local.get('inspectorEnabled', (data) => {
  if (data.inspectorEnabled) {
    startInspector();
  } else {
    chrome.storage.local.get(DEFAULT_SETTINGS, (loadedSettings) => {
        settings = loadedSettings;
    });
  }
});
