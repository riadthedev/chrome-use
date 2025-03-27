/**
 * Background script - manages communication between content scripts and server
 */

// State management
let socket = null;
let activeTab = null;
let taskInProgress = false;
let connectionStatus = 'disconnected';
let serverUrl = 'ws://localhost:3000';
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 3000;
let taskHistory = [];
let settings = {
  highlightElements: true,
  viewportExpansion: 300,
  includedAttributes: ['title', 'type', 'name', 'role', 'aria-label', 'placeholder'],
  debug: false
};

// Initialize when extension is loaded
function init() {
  // Load saved settings
  chrome.storage.local.get(['serverUrl', 'settings'], (result) => {
    if (result.serverUrl) {
      serverUrl = result.serverUrl;
    }
    
    if (result.settings) {
      settings = { ...settings, ...result.settings };
    }
    
    // Attempt initial connection
    connectToServer();
  });
  
  // Set up message listeners
  setupMessageListeners();
  
  // Set up browser action badge
  updateBadge();
}

// Set up message listeners for content script communication
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Track active tab for content script messages
    if (sender && sender.tab) {
      activeTab = sender.tab.id;
    }
    
    switch (message.type) {
      case 'domState':
        handleDomState(message, sender);
        break;
        
      case 'actionResult':
        handleActionResult(message);
        break;
        
      case 'connect':
        connectToServer(message.url);
        sendResponse({ status: connectionStatus });
        break;
        
      case 'disconnect':
        disconnectFromServer();
        sendResponse({ status: connectionStatus });
        break;
        
      case 'pageUnload':
        handlePageUnload(message);
        break;
        
      case 'executeTask':
        handleExecuteTask(message.task);
        sendResponse({ success: true });
        break;
        
      case 'getStatus':
        sendResponse({
          connectionStatus,
          taskInProgress,
          activeTab,
          serverUrl,
          settings
        });
        break;
        
      case 'updateSettings':
        updateSettings(message.settings);
        sendResponse({ success: true });
        break;
        
      case 'error':
        console.error('Error from content script:', message.error);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'error',
            error: message.error
          }));
        }
        break;
    }
    
    return true; // Keep the message channel open for async responses
  });
}

// Connect to WebSocket server
function connectToServer(url) {
  if (url) {
    serverUrl = url;
    // Save to storage
    chrome.storage.local.set({ serverUrl });
  }
  
  // Close existing connection if any
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close();
  }
  
  // Create new connection
  try {
    socket = new WebSocket(serverUrl);
    connectionStatus = 'connecting';
    updateBadge();
    
    socket.onopen = () => {
      console.log('Connected to agent server');
      connectionStatus = 'connected';
      reconnectAttempts = 0;
      updateBadge();
      
      // Broadcast to UI if popup is open
      chrome.runtime.sendMessage({
        type: 'connectionChanged',
        status: connectionStatus
      });
    };
    
    socket.onclose = (event) => {
      console.log(`Disconnected from server: ${event.code} ${event.reason}`);
      connectionStatus = 'disconnected';
      updateBadge();
      
      // Broadcast to UI
      chrome.runtime.sendMessage({
        type: 'connectionChanged',
        status: connectionStatus
      });
      
      // Try to reconnect if closure wasn't intentional
      if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = reconnectDelay * reconnectAttempts;
        console.log(`Attempting to reconnect in ${delay/1000} seconds... (${reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(connectToServer, delay);
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      chrome.runtime.sendMessage({
        type: 'error',
        error: 'WebSocket connection error'
      });
    };
    
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'action' && activeTab) {
          // Forward action to content script
          chrome.tabs.sendMessage(activeTab, message);
        } else if (message.type === 'requestDOM' && activeTab) {
          chrome.tabs.sendMessage(activeTab, { type: 'requestDOM' });
        } else if (message.type === 'taskComplete') {
          taskInProgress = false;
          updateBadge();
          
          // Add to history
          taskHistory.push({
            task: message.task,
            result: message.result,
            success: message.success,
            timestamp: Date.now()
          });
          
          // Notify UI if open
          chrome.runtime.sendMessage({
            type: 'taskComplete',
            task: message.task,
            result: message.result,
            success: message.success
          });
        }
      } catch (error) {
        console.error('Error handling server message:', error);
      }
    };
  } catch (error) {
    console.error('Failed to connect to server:', error);
    connectionStatus = 'error';
    updateBadge();
  }
}

// Disconnect from server
function disconnectFromServer() {
  if (socket) {
    socket.close(1000, "User disconnected");
    socket = null;
  }
  
  connectionStatus = 'disconnected';
  updateBadge();
}

// Handle DOM state updates from content script
function handleDomState(message, sender) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  
  // Forward DOM state to server
  socket.send(JSON.stringify({
    type: 'domState',
    data: message.data,
    url: message.url,
    title: message.title,
    tabId: sender.tab?.id,
    timestamp: message.timestamp || Date.now()
  }));
}

// Handle action results from content script
function handleActionResult(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  
  // Forward action result to server
  socket.send(JSON.stringify({
    type: 'actionResult',
    success: message.success,
    data: message.data,
    error: message.error,
    timestamp: message.timestamp || Date.now()
  }));
}

// Handle page unload events
function handlePageUnload(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  
  // Notify server of page navigation
  socket.send(JSON.stringify({
    type: 'pageUnload',
    url: message.url,
    timestamp: Date.now()
  }));
}

// Start executing a task
function handleExecuteTask(task) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    chrome.runtime.sendMessage({
      type: 'error',
      error: 'Not connected to server'
    });
    return;
  }
  
  if (!activeTab) {
    chrome.runtime.sendMessage({
      type: 'error',
      error: 'No active tab detected'
    });
    return;
  }
  
  // Send task to server
  socket.send(JSON.stringify({
    type: 'executeTask',
    task,
    tabId: activeTab,
    timestamp: Date.now()
  }));
  
  taskInProgress = true;
  updateBadge();
  
  // Update content script settings
  chrome.tabs.sendMessage(activeTab, {
    type: 'updateConfig',
    config: settings
  });
  
  // Request fresh DOM state
  chrome.tabs.sendMessage(activeTab, {
    type: 'requestDOM'
  });
}

// Update extension settings
function updateSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  
  // Save to storage
  chrome.storage.local.set({ settings });
  
  // Update content script if active
  if (activeTab) {
    chrome.tabs.sendMessage(activeTab, {
      type: 'updateConfig',
      config: settings
    });
  }
}

// Update the extension badge based on state
function updateBadge() {
  let color = '#888888'; // Gray (disconnected)
  let text = '';
  
  if (connectionStatus === 'connected') {
    color = '#4CAF50'; // Green
    text = taskInProgress ? 'BUSY' : 'ON';
  } else if (connectionStatus === 'connecting') {
    color = '#FFC107'; // Yellow
    text = '...';
  } else if (connectionStatus === 'error') {
    color = '#F44336'; // Red
    text = 'ERR';
  }
  
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}

// Handle the click on extension icon
chrome.action.onClicked.addListener((tab) => {
  activeTab = tab.id;
  
  // Open popup
  chrome.windows.create({
    url: 'popup.html',
    type: 'popup',
    width: 400,
    height: 600
  });
});

// Initialize on load
init();