document.addEventListener('DOMContentLoaded', function() {
    // Save server URL when changed
    const serverUrlInput = document.getElementById('server-url');
    serverUrlInput.addEventListener('change', function() {
      chrome.storage.local.set({ serverUrl: serverUrlInput.value });
    });
    
    // Load saved server URL
    chrome.storage.local.get('serverUrl', function(data) {
      if (data.serverUrl) {
        serverUrlInput.value = data.serverUrl;
      }
    });
    
    // Handle analyze button click
    const analyzeBtn = document.getElementById('analyze-btn');
    analyzeBtn.addEventListener('click', async function() {
      const statusEl = document.getElementById('status');
      const imageEl = document.getElementById('annotated-image');
      
      // Update UI state
      analyzeBtn.disabled = true;
      statusEl.className = '';
      statusEl.textContent = 'Analyzing page...';
      statusEl.style.display = 'block';
      document.getElementById('image-container').style.display = 'none';
      
      try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Execute content script to get interactive elements
        // We need to get the elements BEFORE taking the screenshot to ensure coordinates match
        const result = await chrome.tabs.sendMessage(tab.id, { 
          action: 'getInteractiveElements'
        });
        
        if (!result || !result.success) {
          throw new Error(result?.error || 'Failed to analyze page');
        }
        
        // Now capture screenshot after analysis
        const screenshotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {format: 'png'});
        
        // Get server URL
        const serverUrl = serverUrlInput.value;
        
        // Send data to server
        const response = await fetch(serverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            screenshot: screenshotUrl,
            elements: result.elements,
            scrollInfo: result.scrollInfo
          })
        });
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Server processing failed');
        }
        
        // Display the annotated image
        imageEl.src = data.annotatedImage;
        document.getElementById('image-container').style.display = 'block';
        
        // Setup download button
        const downloadBtn = document.getElementById('download-btn');
        downloadBtn.onclick = function() {
          // Create a temporary link element
          const a = document.createElement('a');
          a.href = data.annotatedImage;
          a.download = 'annotated-page-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.png';
          // Trigger download
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };
        
        // Update status
        statusEl.className = 'success';
        statusEl.textContent = 'Analysis complete! Found ' + 
          result.elements.length + ' interactive elements.';
        
      } catch (error) {
        // Handle errors
        statusEl.className = 'error';
        statusEl.textContent = 'Error: ' + error.message;
        console.error(error);
      }
      
      // Re-enable button
      analyzeBtn.disabled = false;
    });
  });