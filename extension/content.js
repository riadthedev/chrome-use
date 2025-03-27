/**
 * Content script - runs in the page context and coordinates DOM analysis and actions
 */

// Initialize state
let isProcessing = false;
let domUpdateTimeout = null;
let domBuilder = null;
let actionController = null;
let observerActive = false;
let lastDomState = null;
let pendingActionQueue = [];
let config = {
  highlightElements: true,
  viewportExpansion: 300,
  includedAttributes: ['title', 'type', 'name', 'role', 'aria-label', 'placeholder'],
  debug: false
};

// Initialize when both scripts are loaded
function init() {
  if (window.DOMBuilder && window.ActionController) {
    console.log('Agent Extension initialized');
    
    // Create instances
    domBuilder = new window.DOMBuilder({
      highlightElements: config.highlightElements,
      viewportExpansion: config.viewportExpansion,
      debugMode: config.debug
    });
    
    actionController = new window.ActionController(domBuilder);
    actionController.setDebug(config.debug);
    
    // Listen for messages from background script
    setupMessageListeners();
    
    // Monitor DOM changes
    setupDomObserver();
    
    // Initial DOM collection (wait a moment for page to settle)
    setTimeout(collectAndSendDOM, 1000);
  } else {
    // Retry if scripts aren't loaded yet
    setTimeout(init, 100);
  }
}

// Set up message listeners
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (config.debug) console.log('Received message:', message);
    
    switch (message.type) {
      case 'action':
        handleAction(message.action);
        break;
        
      case 'requestDOM':
        collectAndSendDOM();
        break;
        
      case 'updateConfig':
        updateConfig(message.config);
        break;
        
      case 'status':
        sendResponse({
          status: 'active',
          isProcessing,
          url: window.location.href,
          title: document.title
        });
        break;
    }
    
    // Return true if using sendResponse asynchronously
    return true;
  });
}

// Set up DOM mutation observer
function setupDomObserver() {
  if (observerActive) return;
  
  const observer = new MutationObserver((mutations) => {
    // Only update if significant changes occurred and not currently processing
    const significantChanges = mutations.some(mutation => 
      (mutation.type === 'childList' && mutation.addedNodes.length > 0) || 
      (mutation.type === 'attributes' && 
       (mutation.attributeName === 'style' || mutation.attributeName === 'class'))
    );
    
    if (significantChanges && !isProcessing) {
      // Debounce DOM updates
      clearTimeout(domUpdateTimeout);
      domUpdateTimeout = setTimeout(collectAndSendDOM, 500);
    }
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'disabled', 'hidden']
  });
  
  observerActive = true;
}

// Collect DOM state and send to background script
function collectAndSendDOM() {
  if (!domBuilder || isProcessing) return;
  
  try {
    // Analyze DOM
    const domState = domBuilder.build();
    
    // Update action controller's selector map (keep for backward compatibility)
    actionController.updateSelectorMap(domBuilder.selectorMap);
    
    // Format DOM for LLM
    const formattedDOM = domBuilder.getFormattedDOMString(config.includedAttributes);
    
    // Cache current state
    lastDomState = {
      formattedDOM,
      selectorMap: Object.keys(domBuilder.selectorMap).map(index => ({
        index: parseInt(index),
        tagName: domBuilder.selectorMap[index].tagName.toLowerCase(),
        text: domBuilder.selectorMap[index].textContent.trim().substring(0, 100)
      }))
    };
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'domState',
      data: {
        interactiveElements: formattedDOM,
        elementCount: Object.keys(domBuilder.selectorMap).length
      },
      url: window.location.href,
      title: document.title,
      timestamp: Date.now()
    });
    
    if (config.debug) {
      console.log('DOM state collected:', Object.keys(domBuilder.selectorMap).length, 'interactive elements');
    }
  } catch (error) {
    console.error('Error collecting DOM:', error);
    chrome.runtime.sendMessage({
      type: 'error',
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
}

// Handle incoming action request
async function handleAction(action) {
  if (!actionController) return;
  
  // Queue action if currently processing
  if (isProcessing) {
    pendingActionQueue.push(action);
    return;
  }
  
  isProcessing = true;
  
  try {
    const result = await actionController.executeAction(action);
    
    // Send result back to background
    chrome.runtime.sendMessage({
      type: 'actionResult',
      success: result.success,
      data: result,
      timestamp: Date.now()
    });
    
    // Small delay to let page update if needed
    setTimeout(() => {
      isProcessing = false;
      
      // Update DOM state after action
      collectAndSendDOM();
      
      // Process next action in queue if any
      if (pendingActionQueue.length > 0) {
        const nextAction = pendingActionQueue.shift();
        handleAction(nextAction);
      }
    }, 300);
  } catch (error) {
    console.error('Action execution failed:', error);
    chrome.runtime.sendMessage({
      type: 'actionResult',
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
    
    isProcessing = false;
    
    // Update DOM after error
    collectAndSendDOM();
  }
}

// Update configuration
function updateConfig(newConfig) {
  if (!newConfig) return;
  
  // Update config
  Object.assign(config, newConfig);
  
  // Update DOMBuilder if it exists
  if (domBuilder) {
    domBuilder.options.highlightElements = config.highlightElements;
    domBuilder.options.viewportExpansion = config.viewportExpansion;
    domBuilder.options.debugMode = config.debug;
  }
  
  // Update ActionController if it exists
  if (actionController) {
    actionController.setDebug(config.debug);
  }
  
  // Re-analyze DOM with new settings
  if (!isProcessing) {
    collectAndSendDOM();
  }
}

// Initialize when the page is ready
if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}

// Add unload handler
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({
    type: 'pageUnload',
    url: window.location.href
  });
});

// Inject custom CSS for highlights
const style = document.createElement('style');
style.textContent = `
  #agent-highlight-container {
    z-index: 2147483647;
    pointer-events: none;
  }
  
  .agent-highlight-label {
    font-family: Arial, sans-serif;
    font-size: 12px;
    font-weight: bold;
    z-index: 2147483647;
  }
`;
document.head.appendChild(style);

console.log('Agent extension content script loaded');