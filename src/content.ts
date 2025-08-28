let iframe: HTMLIFrameElement | null = null;
let highlighter: Highlighter | null = null;
let isInspectorActive = false;

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

function handleMouseOver(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target || iframe?.contains(target) || highlighter?.box.contains(target)) {
    return;
  }
  highlighter?.highlight(target);
}

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

  // Send the element info to the iframe panel
  iframe?.contentWindow?.postMessage({ action: 'element_selected', payload: elementInfo }, '*');

  // For now, clicking an element stops the inspector to "pin" it visually
  stopInspector();
}

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
  startInspector(); // Start inspector when panel is first created
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle_panel') {
    togglePanel();
    sendResponse({ status: 'done' });
  }
});

// Listen for messages from the iframe
window.addEventListener("message", (event) => {
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
        }
    }
}, false);
