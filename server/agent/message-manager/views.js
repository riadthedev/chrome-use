/**
 * Message Manager Views
 * Data models for message management
 */

/**
 * Message Metadata - Information about messages
 */
class MessageMetadata {
    constructor(tokens = 0) {
      this.tokens = tokens;
      this.timestamp = Date.now();
    }
  }
  
  /**
   * Message History - Container for chat history
   */
  class MessageHistory {
    constructor() {
      this.messages = [];
      this.currentTokens = 0;
    }
  
    /**
     * Add message with metadata to history
     */
    addMessage(message, metadata) {
      this.messages.push({
        message,
        metadata
      });
      this.currentTokens += metadata.tokens;
    }
  
    /**
     * Get all messages
     */
    getMessages() {
      return this.messages.map(m => m.message);
    }
  
    /**
     * Get total tokens in history
     */
    getTotalTokens() {
      return this.currentTokens;
    }
  
    /**
     * Remove oldest non-system message if over token limit
     */
    trimIfNeeded(maxTokens) {
      if (this.currentTokens <= maxTokens) {
        return false;
      }
  
      // Find first non-system message index
      let indexToRemove = -1;
      for (let i = 0; i < this.messages.length; i++) {
        if (this.messages[i].message.role !== 'system') {
          indexToRemove = i;
          break;
        }
      }
  
      if (indexToRemove >= 0) {
        const removed = this.messages.splice(indexToRemove, 1)[0];
        this.currentTokens -= removed.metadata.tokens;
        return true;
      }
  
      return false;
    }
  }
  
  module.exports = {
    MessageMetadata,
    MessageHistory
  };