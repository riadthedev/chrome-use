/**
 * Agent Service
 * Core agent logic for processing web pages and determining actions
 */

const { ActionModel } = require('./views');
const logger = require('../utils/logger'); // Import our logger

class AgentService {
  constructor(config) {
    this.llm = config.llm;
    this.task = config.task;
    this.messageManager = config.messageManager;
    this.formatMessages = config.formatMessages;
    
    this.state = {
      steps: 0,
      isComplete: false,
      lastResult: null,
      finalResult: null,
      lastAction: null
    };
    
    // Tracking navigation
    this.currentUrl = null;
    this.pageHistory = [];
    
    logger.log(`Agent initialized with task: ${this.task}`);
  }
  
  /**
   * Process a DOM state update from the extension
   */
  async processState(domState) {
    // Track URL changes
    if (this.currentUrl !== domState.url) {
      if (this.currentUrl) {
        this.pageHistory.push(this.currentUrl);
      }
      this.currentUrl = domState.url;
    }
    
    // Add the current state to message history
    this.messageManager.addStateMessage(domState);
    
    logger.log(`[Agent] Processed DOM state with ${domState.data.elementCount} elements at ${domState.url}`);
    return domState;
  }
  
  /**
   * Generate the next action to take based on current context
   */
  async getNextAction() {
    logger.log(`[Agent] Generating next action (step ${this.state.steps + 1})`);
    
    // Get messages for LLM
    const messages = this.messageManager.getMessages();
    
    try {
      // Generate LLM response
      const llmResponse = await this.callLLM(messages);
      
      // Log the full LLM response for debugging
      logger.log('[Agent] LLM response:', llmResponse);
      
      // Parse response into structured action
      const action = this.parseActionFromLLM(llmResponse);
      
      // Store the action for history tracking
      this.state.lastAction = action;
      
      // Log the action for debugging
      logger.log('[Agent] Next action:', JSON.stringify(action));
      
      return action;
    } catch (error) {
      logger.error('[Agent] Error generating next action:', error);
      throw new Error(`Failed to generate next action: ${error.message}`);
    }
  }
  
  /**
   * Process result of an executed action
   */
  async processActionResult(result) {
    // Update step counter
    this.state.steps++;
    
    // Store result
    this.state.lastResult = result;
    
    // Add action to result for history tracking
    result.action = this.state.lastAction;
    
    // Add result to history
    this.messageManager.addActionResultMessage(result);
    
    logger.log(`[Agent] Processed action result for step ${this.state.steps}`);
    
    // Check if the action indicates task completion
    if (result.data && result.data.isComplete) {
      this.state.isComplete = true;
      this.state.finalResult = {
        message: result.data.finalMessage || 'Task completed',
        success: result.data.taskSuccess !== false
      };
      logger.log(`[Agent] Task marked as complete: ${this.state.finalResult.message}`);
    }
    
    return result;
  }
  
  /**
   * Check if the task is complete
   */
  isTaskComplete() {
    return this.state.isComplete;
  }
  
  /**
   * Get the final result of the task
   */
  getFinalResult() {
    if (!this.isTaskComplete()) {
      return { message: 'Task not complete', success: false };
    }
    
    return this.state.finalResult;
  }
  
  /**
   * Handle page navigation events
   */
  handleNavigation(url) {
    logger.log(`[Agent] Handling navigation to: ${url}`);
    this.pageHistory.push(this.currentUrl);
    this.currentUrl = url;
    
    // Add navigation event to message history
    this.messageManager.addNavigationMessage(url);
  }
  
  /**
   * Call the LLM with the current conversation
   */
  async callLLM(messages) {
    try {
      // Format messages if formatter is provided
      const formattedMessages = this.formatMessages ? 
        this.formatMessages(messages) : 
        messages;
        
      const response = await this.llm.generateResponse(formattedMessages);
      return response;
    } catch (error) {
      logger.error('LLM call failed:', error);
      throw new Error(`LLM call failed: ${error.message}`);
    }
  }
  
  /**
   * Parse the LLM response into an action
   */
  parseActionFromLLM(response) {
    try {
      // Extract JSON if it's embedded in markdown or text
      let actionJson = response;
      
      // Handle responses that might have markdown code blocks
      if (response.includes('```json')) {
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          actionJson = jsonMatch[1];
        }
      } else if (response.includes('```')) {
        const codeMatch = response.match(/```\n?([\s\S]*?)\n?```/);
        if (codeMatch && codeMatch[1]) {
          actionJson = codeMatch[1];
        }
      }
      
      // Parse the JSON structure
      const parsed = JSON.parse(actionJson);
      
      // Validate response structure
      if (!parsed.action || !parsed.current_state) {
        throw new Error('Invalid response structure: missing action or current_state');
      }
      
      // Map to our action model
      const actionModel = {
        type: parsed.action.type,
        ...parsed.action
      };
      
      // Validate xpath for element actions
      if ((actionModel.type === 'click_element' || actionModel.type === 'input_text') && 
          !actionModel.xpath && actionModel.index === undefined) {
        throw new Error(`Action type ${actionModel.type} requires 'xpath' parameter`);
      }
      
      return actionModel;
    } catch (error) {
      logger.error('Failed to parse LLM response:', error);
      // Fallback to a simple error action
      return {
        type: 'error',
        message: `Failed to parse response: ${error.message}`
      };
    }
  }
}

module.exports = { AgentService };