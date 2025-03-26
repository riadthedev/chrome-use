// Initialize extension when installed
chrome.runtime.onInstalled.addListener(() => {
    console.log('Interactive Element Analyzer extension installed');
    
    // Set default server URL
    chrome.storage.local.set({ 
      serverUrl: 'http://localhost:3000/analyze'
    });
  });
  
  // No additional background processing needed for this version
  // The communication happens directly between popup and content script