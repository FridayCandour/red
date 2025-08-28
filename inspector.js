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

  // Main container
  infoBox = document.createElement('div');
  infoBox.id = 'inspector-info-box';
  document.body.appendChild(infoBox);

  // Draggable Header
  const header = document.createElement('div');
  header.id = 'inspector-info-box-header';
  header.innerHTML = `<span>Element Inspector</span>`; // Wrapper for title
  infoBox.appendChild(header);

  let isDragging = false, offsetX, offsetY;
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - infoBox.getBoundingClientRect().left;
    offsetY = e.clientY - infoBox.getBoundingClientRect().top;
    infoBox.style.transition = 'none'; // Disable transition while dragging
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      infoBox.style.left = `${e.clientX - offsetX}px`;
      infoBox.style.top = `${e.clientY - offsetY}px`;
      infoBox.style.right = 'auto';
      infoBox.style.bottom = 'auto';
    }
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    infoBox.style.transition = ''; // Re-enable transition
  });

  // Tabs container
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'inspector-tabs';
  infoBox.appendChild(tabsContainer);

  // Tab buttons
  tabsContainer.innerHTML = `
    <button class="inspector-tab-btn active" data-tab="properties">Properties</button>
    <button class="inspector-tab-btn" data-tab="accessibility">Accessibility</button>
  `;

  // Content panels container
  const contentContainer = document.createElement('div');
  contentContainer.className = 'inspector-content-container';
  infoBox.appendChild(contentContainer);

  contentContainer.innerHTML = `
    <div id="inspector-content-properties" class="inspector-tab-content active"></div>
    <div id="inspector-content-accessibility" class="inspector-tab-content"></div>
  `;

  // Tab switching logic
  tabsContainer.addEventListener('click', (e) => {
    if (e.target.matches('.inspector-tab-btn')) {
      const tabName = e.target.dataset.tab;
      infoBox.querySelectorAll('.inspector-tab-btn').forEach(btn => btn.classList.remove('active'));
      infoBox.querySelectorAll('.inspector-tab-content').forEach(content => content.classList.remove('active'));
      e.target.classList.add('active');
      infoBox.querySelector(`#inspector-content-${tabName}`).classList.add('active');
    }
  });
}

function getEventHandlers(element) {
    const events = [];
    // A more robust way to get event listeners might be needed for a real product,
    // but this is a decent approximation for many cases.
    for (const prop in element) {
        if (prop.startsWith('on') && typeof element[prop] === 'function') {
            events.push(prop.substring(2));
        }
    }
    // Check for listeners attached via addEventListener (very difficult, often requires devtools-level access)
    // For now, we'll stick to 'on' properties.
    return events.length ? events.join(', ') : '<em>none found</em>';
}

// --- Accessibility Logic ---

/**
 * Parses a CSS color string.
 * @param {string} colorStr - e.g., 'rgb(255, 255, 255)', '#fff', 'rgba(0,0,0,0.5)'
 * @returns {{r: number, g: number, b: number, a: number}|null}
 */
function parseColor(colorStr) {
  if (!colorStr) return null;

  // For 'transparent'
  if (colorStr.toLowerCase() === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  let match;
  // Match rgb(a) format
  match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1,
    };
  }

  // Match hex format
  match = colorStr.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
  if (match) {
    return {
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
      a: 1,
    };
  }
  // Match 3-digit hex format
  match = colorStr.match(/#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])/);
  if (match) {
    return {
      r: parseInt(match[1] + match[1], 16),
      g: parseInt(match[2] + match[2], 16),
      b: parseInt(match[3] + match[3], 16),
      a: 1,
    };
  }

  return null; // Could not parse
}

/**
 * Calculates luminance of a color.
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getLuminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Blends a foreground color with a background color.
 */
function blendColors(fg, bg) {
    const alpha = fg.a;
    return {
        r: Math.round((1 - alpha) * bg.r + alpha * fg.r),
        g: Math.round((1 - alpha) * bg.g + alpha * fg.g),
        b: Math.round((1 - alpha) * bg.b + alpha * fg.b),
        a: bg.a // The new color is opaque on top of the background
    };
}


/**
 * Finds the effective background color of an element.
 */
function getEffectiveBackgroundColor(element) {
    let current = element;
    while (current) {
        const style = window.getComputedStyle(current);
        const colorStr = style.backgroundColor;
        const color = parseColor(colorStr);

        if (color && color.a === 1) {
            return color; // Found an opaque background
        }

        // If we hit the body or html and it's transparent, default to white
        if (current.tagName === 'BODY' || current.tagName === 'HTML') {
             if (color && color.a === 0) {
                 return { r: 255, g: 255, b: 255, a: 1 };
             }
        }

        if (color && color.a > 0) {
            // If we hit a semi-transparent color, we must blend it with what's behind it.
            const parentBg = getEffectiveBackgroundColor(current.parentElement);
            return blendColors(color, parentBg);
        }
        current = current.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 }; // Default to white if no background found
}


/**
 * Calculates the contrast ratio between two colors.
 * https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(color1.r, color1.g, color1.b);
  const lum2 = getLuminance(color2.r, color2.g, color2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function checkColorContrast(element) {
    const results = [];
    const style = window.getComputedStyle(element);
    // Only check contrast if there's text content in the element, ignoring children.
    const hasTextContent = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0);
    if (!hasTextContent) {
        return [];
    }

    const colorStr = style.color;
    const fontSize = parseInt(style.fontSize, 10);
    const isBold = parseInt(style.fontWeight, 10) >= 700;

    const fgColor = parseColor(colorStr);
    if (!fgColor || fgColor.a === 0) return results; // No text color or transparent

    const bgColor = getEffectiveBackgroundColor(element);

    // If the foreground color has alpha, we must blend it with the background
    const finalFgColor = fgColor.a < 1 ? blendColors(fgColor, bgColor) : fgColor;

    const ratio = getContrastRatio(finalFgColor, bgColor);

    const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);
    const requiredRatio = isLargeText ? 3 : 4.5;
    const requiredRatioAAA = isLargeText ? 4.5 : 7;

    if (ratio < requiredRatio) {
        results.push({
            id: 'contrast',
            level: 'fail',
            message: `Contrast ratio is ${ratio.toFixed(2)}:1. Fails WCAG AA for ${isLargeText ? 'large' : 'normal'} text (needs ${requiredRatio}:1).`
        });
    } else if (ratio < requiredRatioAAA) {
         results.push({
            id: 'contrast',
            level: 'warn',
            message: `Contrast ratio is ${ratio.toFixed(2)}:1. Passes WCAG AA, but fails AAA (needs ${requiredRatioAAA}:1).`
        });
    } else {
         results.push({
            id: 'contrast',
            level: 'pass',
            message: `Contrast ratio is ${ratio.toFixed(2)}:1. Passes WCAG AAA.`
        });
    }
    return results;
}

function checkImageAlt(element) {
    const results = [];
    if (element.tagName.toLowerCase() === 'img') {
        const alt = element.getAttribute('alt');
        if (alt === null) {
            results.push({ id: 'alt-text', level: 'fail', message: 'Image is missing an `alt` attribute.' });
        } else if (alt.trim() === '') {
            results.push({ id: 'alt-text', level: 'warn', message: 'Image has an empty `alt` attribute. This is valid only for decorative images.' });
        } else {
            results.push({ id: 'alt-text', level: 'pass', message: 'Image has a descriptive `alt` attribute.' });
        }
    }
    return results;
}

function checkFormLabel(element) {
    const results = [];
    const tagName = element.tagName.toLowerCase();
    const isHidden = element.type === 'hidden';

    if (['input', 'textarea', 'select'].includes(tagName) && !isHidden) {
        // Check for wrapping label
        if (element.closest('label')) {
            results.push({ id: 'form-label', level: 'pass', message: 'Element is wrapped in a `<label>`.' });
            return results;
        }
        // Check for `for` attribute
        if (element.id && document.querySelector(`label[for="${element.id}"]`)) {
            results.push({ id: 'form-label', level: 'pass', message: 'A `<label>` is associated via the `for` attribute.' });
            return results;
        }
        // Check for aria-label or aria-labelledby
        if (element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')) {
            results.push({ id: 'form-label', level: 'pass', message: 'Element has an `aria-label` or `aria-labelledby` attribute.' });
            return results;
        }

        results.push({ id: 'form-label', level: 'fail', message: 'Form element is not associated with any kind of label.' });
    }
    return results;
}

/**
 * Runs all accessibility checks on a given element.
 * @param {HTMLElement} element The element to check.
 * @returns {Array} A list of accessibility issues.
 */
function checkAccessibility(element) {
  const checks = [
    ...checkImageAlt(element),
    ...checkFormLabel(element),
    ...checkColorContrast(element),
  ];
  return checks;
}

function updateInfoBox(element) {
  if (!infoBox) createInfoBox();

  // --- Update Properties Tab ---
  const propertiesPanel = document.getElementById('inspector-content-properties');
  if (propertiesPanel) {
    const styles = window.getComputedStyle(element);
    const eventHandlers = getEventHandlers(element);
    propertiesPanel.innerHTML = `
      <div class="info-section">
        <p><strong>Tag:</strong> ${element.tagName.toLowerCase()}</p>
        <p><strong>ID:</strong> ${element.id || '<em>none</em>'}</p>
        <p><strong>Classes:</strong> ${element.classList.value || '<em>none</em>'}</p>
      </div>
      <div class="info-section">
        <p><strong>Font Size:</strong> ${styles.fontSize}</p>
        <p><strong>Color:</strong> ${styles.color}</p>
        <p><strong>Padding:</strong> ${styles.padding}</p>
        <p><strong>Margin:</strong> ${styles.margin}</p>
      </div>
      <div class="info-section">
        <p><strong>JS Events:</strong> ${eventHandlers}</p>
        <button id="highlight-children-btn">Highlight Children (${element.children.length})</button>
      </div>`;

    const highlightBtn = document.getElementById('highlight-children-btn');
    if (highlightBtn) {
      highlightBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent re-triggering the main click listener
        highlightChildren(element);
      });
    }
  }

  // --- Update Accessibility Tab ---
  updateAccessibilityPanel(element);

  infoBox.style.display = 'block';
}

function updateAccessibilityPanel(element) {
    const results = checkAccessibility(element);
    const accessibilityPanel = document.getElementById('inspector-content-accessibility');
    const header = document.getElementById('inspector-info-box-header');

    // --- Update Header Badge ---
    if (header) {
        // Remove existing badge before adding a new one
        const existingBadge = header.querySelector('.a11y-issue-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        const issueCount = results.filter(r => r.level === 'fail' || r.level === 'warn').length;

        if (issueCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'a11y-issue-badge';
            badge.textContent = issueCount;
            badge.title = `${issueCount} accessibility issue(s) found`;
            header.appendChild(badge);
        }
    }

    // --- Populate Panel ---
    if (!accessibilityPanel) return;

    if (results.length === 0) {
        accessibilityPanel.innerHTML = `
            <div class="a11y-result a11y-level-info">
                <span class="a11y-icon">ℹ️</span>
                <div class="a11y-message">No specific accessibility checks fired for this element. This does not guarantee accessibility.</div>
            </div>`;
        return;
    }

    let html = '';
    results.forEach(result => {
        const icon = {
            pass: '✅',
            warn: '⚠️',
            fail: '❌',
        }[result.level];

        html += `
            <div class="a11y-result a11y-level-${result.level}">
                <span class="a11y-icon">${icon}</span>
                <div class="a11y-message">${result.message}</div>
            </div>
        `;
    });

    accessibilityPanel.innerHTML = html;
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
