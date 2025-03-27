// Popup script
document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const serverUrlInput = document.getElementById('server-url');
  const connectBtn = document.getElementById('connect-btn');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const taskInput = document.getElementById('task-input');
  const executeBtn = document.getElementById('execute-btn');
  const currentTab = document.getElementById('current-tab');
  const taskStatus = document.getElementById('task-status');
  const resultsContainer = document.getElementById('results-container');
  
  // Settings elements
  const highlightElements = document.getElementById('highlight-elements');
  const viewportExpansion = document.getElementById('viewport-expansion');
  const debugMode = document.getElementById('debug-mode');
  const applySettingsBtn = document.getElementById('apply-settings');
  
  // State management
  let connectionStatus = 'disconnected';
  let taskInProgress = false;
  
  // Initialize UI
  function init() {
    // Get current status from background script
    chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
      if (response) {
        updateConnectionStatus(response.connectionStatus);
        taskInProgress = response.taskInProgress;
        updateTaskStatus();
        
        // Update server URL field
        serverUrlInput.value = response.serverUrl || 'ws://localhost:3000';
        
        // Update settings values
        if (response.settings) {
          highlightElements.checked = response.settings.highlightElements;
          viewportExpansion.value = response.settings.viewportExpansion;
          debugMode.checked = response.settings.debug;
        }
        
        // Update tab info
        if (response.activeTab) {
          chrome.tabs.get(response.activeTab, (tab) => {
            if (tab) {
              currentTab.textContent = tab.title || tab.url;
            }
          });
        }
      }
    });
    
    // Load task history
    loadTaskHistory();
    
    // Set up event listeners
    setupEventListeners();
  }
  
  // Set up UI event listeners
  function setupEventListeners() {
    // Connect button
    connectBtn.addEventListener('click', () => {
      const url = serverUrlInput.value.trim();
      if (url) {
        chrome.runtime.sendMessage({
          type: 'connect',
          url: url
        }, (response) => {
          if (response) {
            updateConnectionStatus(response.status);
          }
        });
      }
    });
    
    // Disconnect button
    disconnectBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'disconnect'
      }, (response) => {
        if (response) {
          updateConnectionStatus(response.status);
        }
      });
    });
    
    // Execute task button
    executeBtn.addEventListener('click', () => {
      const task = taskInput.value.trim();
      if (task) {
        chrome.runtime.sendMessage({
          type: 'executeTask',
          task: task
        }, (response) => {
          if (response && response.success) {
            taskInProgress = true;
            updateTaskStatus();
          }
        });
      }
    });
    
    // Apply settings button
    applySettingsBtn.addEventListener('click', () => {
      const settings = {
        highlightElements: highlightElements.checked,
        viewportExpansion: parseInt(viewportExpansion.value, 10),
        debug: debugMode.checked
      };
      
      chrome.runtime.sendMessage({
        type: 'updateSettings',
        settings: settings
      });
    });
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'connectionChanged') {
        updateConnectionStatus(message.status);
      } else if (message.type === 'taskComplete') {
        taskInProgress = false;
        updateTaskStatus();
        addTaskResult(message.task, message.result, message.success);
      } else if (message.type === 'error') {
        showError(message.error);
      }
    });
  }
  
  // Update connection status in UI
  function updateConnectionStatus(status) {
    connectionStatus = status;
    
    // Remove all status classes
    document.body.classList.remove('status-connected', 'status-connecting', 'status-error');
    
    // Update UI based on status
    switch (status) {
      case 'connected':
        statusText.textContent = 'Connected';
        document.body.classList.add('status-connected');
        executeBtn.disabled = false;
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        break;
        
      case 'connecting':
        statusText.textContent = 'Connecting...';
        document.body.classList.add('status-connecting');
        executeBtn.disabled = true;
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        break;
        
      case 'error':
        statusText.textContent = 'Connection Error';
        document.body.classList.add('status-error');
        executeBtn.disabled = true;
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        break;
        
      default:
        statusText.textContent = 'Disconnected';
        executeBtn.disabled = true;
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
    }
  }
  
  // Update task status in UI
  function updateTaskStatus() {
    taskStatus.textContent = taskInProgress ? 'Yes' : 'No';
    executeBtn.disabled = taskInProgress || connectionStatus !== 'connected';
  }
  
  // Load task history from storage
  function loadTaskHistory() {
    chrome.storage.local.get(['taskHistory'], (result) => {
      if (result.taskHistory && result.taskHistory.length > 0) {
        resultsContainer.innerHTML = '';
        
        // Show most recent tasks first
        result.taskHistory.reverse().forEach(item => {
          addTaskResult(item.task, item.result, item.success, item.timestamp);
        });
      }
    });
  }
  
  // Add a task result to the UI
  function addTaskResult(task, result, success, timestamp = Date.now()) {
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    
    const resultTask = document.createElement('div');
    resultTask.className = 'result-task';
    resultTask.textContent = `Task: ${task}`;
    
    const resultResponse = document.createElement('div');
    resultResponse.className = `result-response ${success ? 'result-success' : 'result-failure'}`;
    resultResponse.textContent = result || (success ? 'Completed successfully' : 'Failed to complete');
    
    const resultTime = document.createElement('div');
    resultTime.className = 'result-time';
    resultTime.textContent = new Date(timestamp).toLocaleString();
    
    resultItem.appendChild(resultTask);
    resultItem.appendChild(resultResponse);
    resultItem.appendChild(resultTime);
    
    // Clear empty state if present
    const emptyState = resultsContainer.querySelector('.empty-state');
    if (emptyState) {
      resultsContainer.removeChild(emptyState);
    }
    
    // Add to container
    resultsContainer.prepend(resultItem);
    
    // Limit to 10 most recent results
    const resultItems = resultsContainer.querySelectorAll('.result-item');
    if (resultItems.length > 10) {
      resultsContainer.removeChild(resultItems[resultItems.length - 1]);
    }
  }
  
  // Show error message
  function showError(message) {
    // Create a temporary error notification
    const errorElement = document.createElement('div');
    errorElement.className = 'error-notification';
    errorElement.textContent = message;
    document.body.appendChild(errorElement);
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorElement.classList.add('fade-out');
      setTimeout(() => {
        document.body.removeChild(errorElement);
      }, 500);
    }, 5000);
  }
  
  // Initialize
  init();
});