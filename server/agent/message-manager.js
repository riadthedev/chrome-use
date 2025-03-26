class MessageManager {
    constructor(systemPrompt) {
      this.systemPrompt = systemPrompt;
      this.messages = [];
      this.task = null;
      this.reset();
    }
  
    reset() {
      // Initialize with system prompt
      this.messages = [
        {
          role: 'system',
          parts: [{ text: this.systemPrompt }]
        }
      ];
    }
  
    setTask(task) {
      this.task = task;
      this.messages.push({
        role: 'user',
        parts: [{ text: `Your task is: ${task}. I'll show you the webpage and you should help accomplish this task step by step.` }]
      });
    }
  
    addDOMState(domState, screenshot) {
      const formattedDOM = this._formatDOMForPrompt(domState);
      
      // Create message parts
      const parts = [{ text: formattedDOM }];
      
      // Add screenshot if available
      if (screenshot) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: screenshot
          }
        });
      }
      
      this.messages.push({
        role: 'user',
        parts
      });
      
      this._pruneMessagesIfNeeded();
    }
  
    addActionResult(result) {
      let resultText = '';
      
      if (result.success) {
        resultText = `The action was successful. ${result.message || ''}`;
      } else {
        resultText = `The action failed. Error: ${result.error || 'Unknown error'}`;
      }
      
      this.messages.push({
        role: 'user',
        parts: [{ text: resultText }]
      });
    }
  
    formatPrompt(state) {
      // Return current message history - Gemini API needs the full conversation
      return this.messages;
    }
  
    // Private methods
    _formatDOMForPrompt(domState) {
      let prompt = `Current URL: ${domState.url}\n`;
      prompt += `Page Title: ${domState.title}\n\n`;
      prompt += "Interactive Elements:\n";
      
      // Format elements with indices for LLM
      if (domState.elements && domState.elements.length > 0) {
        domState.elements.forEach(el => {
          prompt += `[${el.index}] <${el.tagName}>${el.innerText || ''}</${el.tagName}>\n`;
        });
      } else {
        prompt += "No interactive elements found on page.\n";
      }
      
      // Add viewport information if available
      if (domState.viewport) {
        prompt += `\nViewport: ${domState.viewport.width}x${domState.viewport.height}, `;
        prompt += `Scroll position: ${domState.viewport.scrollY}/${domState.viewport.maxScroll}px\n`;
      }
      
      prompt += "\nPlease analyze the webpage and decide on the next action to take toward completing the task.";
      
      return prompt;
    }
  
    _pruneMessagesIfNeeded() {
      // Simple token management - keep history manageable
      // In a real implementation, you would track token usage more precisely
      const MAX_MESSAGES = 20; 
      
      if (this.messages.length > MAX_MESSAGES) {
        // Keep system message, task message, and the most recent messages
        const systemMessage = this.messages[0];
        const taskMessage = this.messages.find(m => 
          m.role === 'user' && 
          m.parts[0].text.includes('Your task is:')
        );
        
        // Add a summary message
        const summaryMessage = {
          role: 'user',
          parts: [{ text: `[Previous conversation history removed to save context space. The current task is still: ${this.task}]` }]
        };
        
        // Keep the most recent messages (adjust number as needed)
        const recentMessages = this.messages.slice(-10);
        
        // Reconstruct the message history
        this.messages = [
          systemMessage,
          taskMessage,
          summaryMessage,
          ...recentMessages
        ].filter(Boolean); // Filter out any undefined messages
      }
    }
  }
  
  module.exports = { MessageManager };
  
  // server/llm/gemini-client.js
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  
  class GeminiClient {
    constructor(apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
    }
  
    async generateResponse(messages) {
      try {
        // Format messages for Gemini
        const formattedMessages = this._formatMessagesForGemini(messages);
        
        // Generate response from Gemini
        const result = await this.model.generateContent({
          contents: formattedMessages,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        });
        
        // Extract the text from the response
        const responseText = result.response.text();
        console.log('Gemini response:', responseText.substring(0, 100) + '...');
        
        return responseText;
      } catch (error) {
        console.error('Error generating response from Gemini:', error);
        throw error;
      }
    }
  
    _formatMessagesForGemini(messages) {
      // Gemini expects a different format than our internal message format
      // This method handles the conversion
      return messages.map(msg => ({
        role: msg.role === 'system' ? 'user' : msg.role, // Gemini doesn't have 'system' role
        parts: msg.parts
      }));
    }
  }
  
  module.exports = { GeminiClient };
  
  // server/llm/prompt-templates.js
  const SYSTEM_PROMPT = `You are a browser automation assistant that helps users complete tasks in web pages. 
  You'll receive a task and screenshots of web pages along with information about interactive elements.
  
  For each page, you'll see:
  1. A list of interactive elements with index numbers in brackets [0], [1], etc.
  2. A screenshot of the current page state
  
  Your job is to:
  1. Understand the task goal
  2. Analyze the current page
  3. Decide on the most appropriate next action
  
  You can perform these actions:
  - click: Select an element by its index
    Example: {"type": "click", "index": 5}
  
  - input: Type text into a form field
    Example: {"type": "input", "index": 3, "text": "search query"}
  
  - scroll: Scroll the page up or down
    Example: {"type": "scroll", "direction": "down", "amount": 500}
  
  - done: Complete the task and return the final result
    Example: {"type": "done", "success": true}
  
  IMPORTANT RULES:
  1. ALWAYS respond with a valid JSON object containing a 'type' field and the required parameters for that action
  2. Only use the index numbers provided in the element list
  3. If you can't determine what to do, ask for more context or scroll to see more of the page
  4. When the task is complete, use the 'done' action
  5. Think carefully about each step - the user relies on your accuracy
  
  Example response format:
  {
    "type": "click",
    "index": 2
  }
  
  Now I'll provide you with a task and webpage information to help automate browser interactions.`;
  
  module.exports = {
    SYSTEM_PROMPT
  };