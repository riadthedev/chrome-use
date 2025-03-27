/**
 * Server for Web Agent Chrome Extension
 * Handles WebSocket connections and LLM interactions
 */

// Import dependencies
const WebSocket = require('ws');
const dotenv = require('dotenv');
const { AgentService } = require('./agent/service');
const { MessageManager } = require('./agent/message-manager/service');
const { setupLLM } = require('./llm/setup');
const logger = require('./utils/logger'); // Import our logger

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3000;
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini';
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-pro';
const API_KEY = process.env.API_KEY; // Gemini API key

// Server state
const clients = new Map(); // Map clients to their agent instances
let connectionCounter = 0;

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: PORT });

logger.log(`WebSocket server started on port ${PORT}`);
logger.log(`Using LLM provider: ${LLM_PROVIDER}, model: ${MODEL_NAME}`);

// Setup LLM client
const llm = setupLLM(LLM_PROVIDER, MODEL_NAME, API_KEY);

// Add Gemini-specific message formatting helper
function formatMessagesForGemini(messages) {
  const result = [];
  let systemMessage = '';
  
  // Collect system messages
  const systemMessages = messages.filter(m => m.role === 'system');
  if (systemMessages.length > 0) {
    systemMessage = systemMessages.map(m => m.content).join('\n');
  }
  
  // Process conversation messages
  for (const message of messages) {
    if (message.role === 'system') continue;
    
    const role = message.role === 'assistant' ? 'model' : 'user';
    let content = message.content;
    
    // Add system message to first user message
    if (role === 'user' && systemMessage && result.length === 0) {
      content = `${systemMessage}\n\n${content}`;
    }
    
    result.push({
      role,
      parts: [{
        text: content
      }]
    });
  }
  
  return result;
}

// Handle new connections
wss.on('connection', (ws) => {
  const clientId = ++connectionCounter;
  let clientState = {
    id: clientId,
    agent: null,
    tabId: null,
    task: null,
    isExecuting: false,
    lastDomState: null,
    startTime: Date.now()
  };
  
  // Add to clients map
  clients.set(ws, clientState);
  
  logger.log(`Client ${clientId} connected. Total clients: ${clients.size}`);
  
  // Handle incoming messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Update tab ID if available
      if (data.tabId && !clientState.tabId) {
        clientState.tabId = data.tabId;
      }
      
      // Process message based on type
      switch (data.type) {
        case 'domState':
          await handleDomState(ws, clientState, data);
          break;
          
        case 'actionResult':
          await handleActionResult(ws, clientState, data);
          break;
          
        case 'executeTask':
          await handleExecuteTask(ws, clientState, data);
          break;
          
        case 'pageUnload':
          handlePageUnload(ws, clientState, data);
          break;
          
        case 'error':
          logger.error(`Client ${clientId} error:`, data.error);
          break;
          
        default:
          logger.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      logger.error(`Error processing message from client ${clientId}:`, error);
    }
  });
  
  // Handle disconnections
  ws.on('close', () => {
    logger.log(`Client ${clientId} disconnected`);
    
    // Clean up resources
    if (clientState.agent) {
      clientState.agent = null;
    }
    
    // Remove from clients map
    clients.delete(ws);
  });
  
  // Send initial confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    clientId: clientId,
    message: 'Connected to Web Agent server'
  }));
});

// Handle DOM state updates
async function handleDomState(ws, clientState, data) {
  // Store DOM state
  clientState.lastDomState = data;
  
  // If agent is executing a task, process this state
  if (clientState.isExecuting && clientState.agent) {
    try {
      await clientState.agent.processState(data);
      
      // Get next action if not waiting for a result and not already generating an action
      if (!clientState.waitingForResult && !clientState.isGeneratingAction) {
        // Set flag to prevent concurrent action generation
        clientState.isGeneratingAction = true;
        
        try {
          const nextAction = await clientState.agent.getNextAction();
          
          // Mark as waiting for result
          clientState.waitingForResult = true;
          
          // Send action to client
          ws.send(JSON.stringify({
            type: 'action',
            action: nextAction
          }));
        } finally {
          // Always clear the generating flag when done
          clientState.isGeneratingAction = false;
        }
      }
    } catch (error) {
      logger.error(`Error processing state for client ${clientState.id}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Error processing state: ${error.message}`
      }));
    }
  }
}

// Handle action results
async function handleActionResult(ws, clientState, data) {
  // Not waiting for results anymore
  clientState.waitingForResult = false;
  
  if (!clientState.isExecuting || !clientState.agent) {
    return;
  }
  
  try {
    // Process action result
    await clientState.agent.processActionResult(data);
    
    // Check if task is complete
    if (clientState.agent.isTaskComplete()) {
      const finalResult = clientState.agent.getFinalResult();
      
      // Send task completion message
      ws.send(JSON.stringify({
        type: 'taskComplete',
        task: clientState.task,
        result: finalResult.message,
        success: finalResult.success
      }));
      
      // Reset execution state
      clientState.isExecuting = false;
      clientState.task = null;
    } else {
      // Request new DOM state for next action
      ws.send(JSON.stringify({
        type: 'requestDOM'
      }));
    }
  } catch (error) {
    logger.error(`Error processing action result for client ${clientState.id}:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      error: `Error processing action result: ${error.message}`
    }));
  }
}

// Handle execute task request
async function handleExecuteTask(ws, clientState, data) {
  if (clientState.isExecuting) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'A task is already in progress'
    }));
    return;
  }
  
  try {
    // Create new agent for this task
    const messageManager = new MessageManager(data.task);
    clientState.agent = new AgentService({
      llm,
      task: data.task,
      messageManager,
      formatMessages: null // Remove the formatter to avoid double formatting
    });
    
    // Update state
    clientState.isExecuting = true;
    clientState.task = data.task;
    clientState.waitingForResult = false;
    clientState.isGeneratingAction = false; // Add this for action generation tracking
    
    logger.log(`Client ${clientState.id} started task: ${data.task}`);
    
    // Request DOM state to start processing
    ws.send(JSON.stringify({
      type: 'requestDOM'
    }));
  } catch (error) {
    logger.error(`Error starting task for client ${clientState.id}:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      error: `Error starting task: ${error.message}`
    }));
    
    // Reset execution state
    clientState.isExecuting = false;
    clientState.task = null;
    clientState.agent = null;
  }
}

// Handle page unload (navigation)
function handlePageUnload(ws, clientState, data) {
  logger.log(`Client ${clientState.id} navigated from: ${data.url}`);
  
  // If task is in progress, we need to adapt
  if (clientState.isExecuting && clientState.agent) {
    // Tell agent about navigation
    clientState.agent.handleNavigation(data.url);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logger.log('Server shutting down');
  
  // Close all client connections
  wss.clients.forEach(client => {
    client.close();
  });
  
  // Close the logger
  logger.close();
  
  process.exit(0);
});