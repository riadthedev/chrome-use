/**
 * Agent Views
 * Data models and structures for the agent system
 */

/**
 * Action Model - Represents an action to be executed by the extension
 */
class ActionModel {
    constructor(data) {
      // Extract action type
      this.type = data.type || '';
      
      // Copy all parameters
      Object.keys(data).forEach(key => {
        if (key !== 'type') {
          this[key] = data[key];
        }
      });
    }
    
    /**
     * Get the index parameter if present (for element interactions)
     */
    getIndex() {
      return this.index !== undefined ? this.index : null;
    }
    
    /**
     * Check if action is valid
     */
    isValid() {
      // Must have a type
      if (!this.type) {
        return false;
      }
      
      // Type-specific validation
      switch (this.type) {
        case 'click_element':
          return this.index !== undefined;
          
        case 'input_text':
          return this.index !== undefined && this.text !== undefined;
          
        case 'extract_content':
          return this.goal !== undefined;
          
        case 'scroll':
          return true; // direction and amount are optional
          
        case 'wait':
          return true; // seconds is optional
          
        case 'done':
          return true; // text and success are optional
          
        default:
          return false;
      }
    }
    
    /**
     * Serialize to JSON
     */
    toJSON() {
      const result = { type: this.type };
      
      // Add all other properties
      Object.keys(this).forEach(key => {
        if (key !== 'type') {
          result[key] = this[key];
        }
      });
      
      return result;
    }
  }
  
  /**
   * Agent History - Tracks the history of agent actions and states
   */
  class AgentHistory {
    constructor() {
      this.steps = [];
      this.startTime = Date.now();
    }
    
    /**
     * Add a step to the history
     */
    addStep(state, action, result) {
      this.steps.push({
        state,
        action,
        result,
        timestamp: Date.now()
      });
    }
    
    /**
     * Get the most recent step
     */
    getLastStep() {
      if (this.steps.length === 0) {
        return null;
      }
      return this.steps[this.steps.length - 1];
    }
    
    /**
     * Get total duration in milliseconds
     */
    getTotalDuration() {
      return Date.now() - this.startTime;
    }
    
    /**
     * Convert to JSON-compatible object
     */
    toJSON() {
      return {
        steps: this.steps,
        startTime: this.startTime,
        totalSteps: this.steps.length,
        totalDurationMs: this.getTotalDuration()
      };
    }
  }
  
  /**
   * Task Result - Represents the final result of a task
   */
  class TaskResult {
    constructor(success, message) {
      this.success = success;
      this.message = message;
      this.completedAt = Date.now();
    }
    
    /**
     * Convert to JSON-compatible object
     */
    toJSON() {
      return {
        success: this.success,
        message: this.message,
        completedAt: this.completedAt
      };
    }
  }
  
  module.exports = {
    ActionModel,
    AgentHistory,
    TaskResult
  };