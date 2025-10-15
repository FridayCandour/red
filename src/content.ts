let iframe: HTMLIFrameElement | null = null;
let highlighter: Highlighter | null = null;
let isInspectorActive = false;
let pinnedElement: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;

/**
 * Manages the element highlighter overlay.
 */
class Highlighter {
  private box: HTMLDivElement;
  private label: HTMLDivElement;

  constructor() {
    this.box = document.createElement('div');
    this.box.style.position = 'absolute';
    this.box.style.backgroundColor = 'rgba(10, 123, 232, 0.2)';
    this.box.style.border = '2px solid #0a7be8';
    this.box.style.borderRadius = '4px';
    this.box.style.zIndex = '2147483646';
    this.box.style.pointerEvents = 'none';
    this.box.style.transition = 'all 100ms ease-in-out';
    this.box.style.display = 'none';

    this.label = document.createElement('div');
    this.label.style.position = 'absolute';
    this.label.style.backgroundColor = '#0a7be8';
    this.label.style.color = 'white';
    this.label.style.fontFamily = 'sans-serif';
    this.label.style.fontSize = '12px';
    this.label.style.padding = '4px 8px';
    this.label.style.borderRadius = '4px';
    this.box.appendChild(this.label);

    document.body.appendChild(this.box);
  }

  highlight(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    this.box.style.display = 'block';
    this.box.style.width = `${rect.width}px`;
    this.box.style.height = `${rect.height}px`;
    this.box.style.top = `${rect.top + window.scrollY}px`;
    this.box.style.left = `${rect.left + window.scrollX}px`;
    this.label.textContent = `${element.tagName.toLowerCase()} ${element.id ? '#' + element.id : ''} ${element.className ? '.' + element.className.split(' ').join('.') : ''}`;
  }

  hide() {
    this.box.style.display = 'none';
  }

  destroy() {
    this.box.remove();
  }
}

/**
 * Activates the in-page inspector: creates the highlighter if needed and attaches global event listeners.
 *
 * Once called (no-op if already active) this sets the internal `isInspectorActive` flag to true, ensures a
 * Highlighter instance exists (which creates DOM overlay elements), and registers capture-phase `mouseover`
 * and `click` listeners on `document` to drive hover highlighting and element selection.
 *
 * Side effects:
 * - May create and insert DOM elements via `new Highlighter()`.
 * - Registers global event listeners that must be removed by `stopInspector()` to avoid continued interception
 *   of user interactions.
 */
function startInspector() {
  if (isInspectorActive) return;
  isInspectorActive = true;
  if (!highlighter) {
    highlighter = new Highlighter();
  }
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('click', handleMouseClick, true);
  console.log('Inspector started');
}

/**
 * Stops the in-page inspector: disables inspection mode, hides the highlighter, and removes event listeners.
 *
 * If the inspector is not active this is a no-op. When active, it sets the internal active flag to false,
 * hides the highlighter overlay (if present), and removes the document-level `mouseover` and `click`
 * listeners that were registered in the capture phase.
 */
function stopInspector() {
  if (!isInspectorActive) return;
  isInspectorActive = false;
  if (highlighter) {
    highlighter.hide();
  }
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('click', handleMouseClick, true);
  console.log('Inspector stopped');
}

/**
 * Handles document mouseover events by highlighting the hovered element.
 *
 * If the event target is absent, is inside the inspector iframe, or is part of the highlighter overlay itself, no action is taken. Otherwise the highlighter is instructed to highlight the target element.
 *
 * @param e - The mouseover event (expected from document-level listener)
 */
function handleMouseOver(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target || iframe?.contains(target) || highlighter?.box.contains(target)) {
    return;
  }
  highlighter?.highlight(target);
}

/**
 * Handle mouse clicks while the inspector is active: collect the clicked element's metadata, send it to the panel, and stop the inspector.
 *
 * Ignores clicks targeting the panel iframe or when the inspector is inactive. Prevents the default action and stops propagation for handled clicks. Gathers the element's tag, id, class list, rounded width/height, and key computed style properties (fontFamily, fontSize, fontWeight, color, backgroundColor), posts a message to the iframe with action `element_selected` and the collected payload, then stops the inspector to "pin" the selection.
 *
 * @param e - The MouseEvent triggered by the user's click.
 */
function handleMouseClick(e: MouseEvent) {
  if (!isInspectorActive) return;
  const target = e.target as HTMLElement;
  if (!target || iframe?.contains(target)) {
      return;
  }

  e.preventDefault();
  e.stopPropagation();

  const rect = target.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(target);

  const elementInfo = {
    tag: target.tagName.toLowerCase(),
    id: target.id,
    classes: target.className,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    fontFamily: computedStyle.fontFamily,
    fontSize: computedStyle.fontSize,
    fontWeight: computedStyle.fontWeight,
    color: computedStyle.color,
    backgroundColor: computedStyle.backgroundColor,
  };

  pinnedElement = target;

  (window as any).__PREMIUM_DESIGN_INSPECTOR_SELECTED_ELEMENT__ = target;
  window.postMessage({ type: 'GET_EVENT_LISTENERS' }, '*');

  // Send the element info to the iframe panel
  iframe?.contentWindow?.postMessage({ action: 'element_selected', payload: elementInfo }, '*');

  // For now, clicking an element stops the inspector to "pin" it visually
  stopInspector();

  // Send the element's CSS to the panel
  const cssText = pinnedElement.style.cssText;
  iframe?.contentWindow?.postMessage({ action: 'css_updated', payload: cssText }, '*');
}

/**
 * Toggles the right-side inspector panel: shows/hides it, or creates it if missing.
 *
 * When an existing panel iframe is present this toggles its `display` between `block` and `none`
 * and starts or stops the element inspector accordingly. If no iframe exists, this creates the
 * panel iframe (loads `index.html` from the extension via `chrome.runtime.getURL`), applies
 * positioning and sizing styles (fixed, 380px wide, full viewport height), appends it to
 * document.body, and starts the inspector.
 *
 * Side effects:
 * - Mutates global `iframe`.
 * - Appends an iframe to the document when creating the panel.
 * - Calls `startInspector()` or `stopInspector()` to control inspection lifecycle.
 */
function togglePanel() {
  if (iframe) {
    const isVisible = iframe.style.display === 'block';
    iframe.style.display = isVisible ? 'none' : 'block';
    // When panel is hidden, stop the inspector. When shown, start it.
    isVisible ? stopInspector() : startInspector();
    return;
  }

  iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('index.html');
  iframe.style.width = '380px';
  iframe.style.height = '100vh';
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.right = '0';
  iframe.style.zIndex = '2147483647';
  iframe.style.border = 'none';
  iframe.style.display = 'block';
  iframe.classList.add('premium-design-inspector-iframe');

  document.body.appendChild(iframe);
  injectScript(chrome.runtime.getURL('src/injected.js'));
  startInspector(); // Start inspector when panel is first created
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle_panel') {
    togglePanel();
    sendResponse({ status: 'done' });
  }
});

function toggleDomTreeHighlight(shouldHighlight: boolean) {
    if (!pinnedElement) return;

    function traverse(element: Element) {
        if (shouldHighlight) {
            element.classList.add('red');
        } else {
            element.classList.remove('red');
        }

        for (const child of element.children) {
            traverse(child);
        }
    }

    traverse(pinnedElement);
}

// Listen for messages from the iframe and the injected script
window.addEventListener("message", (event) => {
    // Messages from the iframe panel
    if (event.source !== window && event.data.action) {
        switch(event.data.action) {
            case 'close_panel':
                if (iframe) {
                    iframe.style.display = "none";
                    stopInspector();
                }
                break;
            case 'start_inspector':
                startInspector();
                break;
            case 'stop_inspector':
                stopInspector();
                break;
            case 'toggle_dom_tree_highlight':
                toggleDomTreeHighlight(event.data.payload);
                break;
            case 'update_css':
                if (pinnedElement) {
                    pinnedElement.style.cssText = event.data.payload;
                }
                break;
        }
    }

    // Messages from the injected script
    if (event.source === window && event.data.type === 'EVENT_LISTENERS_RESULT') {
        iframe?.contentWindow?.postMessage({ action: 'event_listeners_updated', payload: event.data.eventListeners }, '*');
    }
}, false);
