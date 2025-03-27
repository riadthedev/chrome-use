/**
 * Message Manager Service
 * Manages conversation history and message formatting
 */

const { MessageMetadata, MessageHistory } = require('./views');

class MessageManager {
  constructor(task, options = {}) {
    this.task = task;
    this.history = new MessageHistory();
    this.maxTokens = options.maxTokens || 8000;
    this.actionHistory = []; // Add this to track actions
    
    // Initialize with system message and task
    this.addSystemMessage();
    this.addTaskMessage();
  }

  /**
   * Add system message with instructions
   */
  addSystemMessage() {
    const systemContent = `You are an AI agent that interacts with web pages. You will be given information about the current state of a webpage and must decide what action to take next. The goal is to complete the user's task.

Your response should be a JSON object with this structure:
{
  "current_state": {
    "evaluation": "Your analysis of the current page state",
    "next_goal": "What you want to accomplish next"
  },
  "action": {
    "type": "action_name",
    // Additional parameters based on action type
  }
}

Available actions:
- click_element: Click on an element by XPath. Parameters: { xpath: string }
- input_text: Type text into an input field. Parameters: { xpath: string, text: string }
- extract_content: Extract information from the page. Parameters: { goal: string }
- scroll: Scroll the page. Parameters: { direction: "up"|"down", amount: number (optional) }
- wait: Wait for specified seconds. Parameters: { seconds: number (optional, default 1) }
- done: Mark task as complete. Parameters: { text: string, success: boolean }

Carefully analyze the webpage elements provided. Elements are identified by [xpath="..."] attributes. Include the element's current 'value' in your analysis. Choose actions that make progress toward completing the task efficiently. Avoid repeating actions that don't lead to progress.

**CRITICAL: Before using 'input_text', check if the target element already has the desired value or similar content. Do NOT use 'input_text' if the field is already correctly filled. Target elements using the full 'xpath' value provided in the square brackets.**`;

    const message = { role: 'system', content: systemContent };
    this.addMessage(message);
  }

  /**
   * Add the initial task message
   */
  addTaskMessage() {
    const message = { role: 'user', content: `Your task is: "${this.task}"` };
    this.addMessage(message);
  }

  /**
   * Add a DOM state message
   */
  addStateMessage(state) {
    // Add action history summary before the state if we have actions
    const summary = this.generateActionSummary();
    if (summary) {
      this.addMessage({
        role: 'system',
        content: summary
      });
    }
    
    // Format the DOM state for the LLM
    const formattedState = this.formatStateMessage(state);
    
    // Log the formatted state for debugging
    console.log('[MessageManager] Formatted state message:', formattedState);
    
    const message = { role: 'user', content: formattedState };
    this.addMessage(message);
  }

  /**
   * Add action result to history
   */
  addActionResultMessage(result) {
    let content = '';
    
    if (result.success) {
      content = `Action completed: ${result.data?.message || 'Success'}`;
    } else {
      content = `Action failed: ${result.error || 'Unknown error'}`;
    }
    
    const message = { role: 'system', content };
    this.addMessage(message);
    
    // Store the action in history
    if (result.action) {
      this.addActionToHistory(result.action, result);
    }
  }

  /**
   * Add navigation event to history
   */
  addNavigationMessage(url) {
    const message = { 
      role: 'system', 
      content: `Page navigation occurred. New URL: ${url}` 
    };
    this.addMessage(message);
  }

  /**
   * Add a message to history with token counting
   */
  addMessage(message) {
    const tokenEstimate = this.estimateTokens(message.content);
    const metadata = new MessageMetadata(tokenEstimate);
    
    this.history.addMessage(message, metadata);
    
    // Trim history if over token limit
    while (this.history.getTotalTokens() > this.maxTokens) {
      const trimmed = this.history.trimIfNeeded(this.maxTokens);
      if (!trimmed) break;
    }
  }

  /**
   * Get all messages for LLM
   */
  getMessages() {
    return this.history.getMessages();
  }

  /**
   * Format DOM state into a message for the LLM
   */
  formatStateMessage(state) {
  let message = `Task: ${this.task}\n\n`;
  message += `Current URL: ${state.url}\nTitle: ${state.title}\n\n`;
  message += 'Interactive elements:\n';
  message += state.data.interactiveElements;
  return message;
}

  /**
   * Estimate tokens in text (simple approximation)
   */
  estimateTokens(text) {
    // Very rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Add action to history
   */
  addActionToHistory(action, result) {
    this.actionHistory.push({
      action,
      result,
      timestamp: Date.now(),
      url: result.url || 'unknown'
    });
  }
  
  /**
   * Generate a summary of past actions
   */
  generateActionSummary() {
    if (this.actionHistory.length === 0) return '';
    
    let summary = 'Previous actions:\n';
    this.actionHistory.forEach((entry, index) => {
      let actionStr = `Step ${index + 1}: ${entry.action.type}`;
      
      // Add details based on action type
      if (entry.action.type === 'click_element' && entry.action.xpath !== undefined) {
        actionStr += ` on element [${entry.action.xpath}]`;
      } else if (entry.action.type === 'input_text' && entry.action.xpath !== undefined) {
        actionStr += ` on element [${entry.action.xpath}] with text "${entry.action.text}"`;
      } else if (entry.action.type === 'extract_content') {
        actionStr += ` with goal "${entry.action.goal}"`;
      } else if (entry.action.type === 'scroll') {
        actionStr += ` ${entry.action.direction}`;
      }
      
      // Add result
      const outcomeStr = entry.result.success ? 'succeeded' : 'failed';
      summary += `${actionStr}, ${outcomeStr}\n`;
    });
    
    return summary;
  }
}

module.exports = { MessageManager };