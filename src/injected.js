function getEventListenersForElement(element) {
  if (!window.getEventListeners) {
    return { error: 'getEventListeners is not available. Are you on a dev build of your browser?' };
  }
  const listeners = window.getEventListeners(element);
  const result = {};
  for (const eventType of listeners.keys()) {
    result[eventType] = listeners[eventType].map(listener => {
      return {
        type: listener.type,
        useCapture: listener.useCapture,
        listener: listener.listener.toString(),
      };
    });
  }
  return result;
}

window.addEventListener('message', event => {
  if (event.source === window && event.data.type === 'GET_EVENT_LISTENERS') {
    const element = window.__PREMIUM_DESIGN_INSPECTOR_SELECTED_ELEMENT__;
    if (element) {
      const eventListeners = getEventListenersForElement(element);
      window.postMessage({ type: 'EVENT_LISTENERS_RESULT', eventListeners }, '*');
    }
  }
});
