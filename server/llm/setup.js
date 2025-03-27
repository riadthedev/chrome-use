/**
 * LLM Setup
 * Configures and provides LLM clients for different providers
 */

const { OpenAI } = require('openai');
const axios = require('axios');
const logger = require('../utils/logger'); // Import our logger

/**
 * Factory function to create the appropriate LLM client
 */
function setupLLM(provider, model, apiKey) {
  if (!apiKey) {
    throw new Error(`API key required for ${provider}`);
  }

  switch (provider.toLowerCase()) {
    case 'openai':
      return new OpenAIClient(apiKey, model);
    case 'anthropic':
      return new AnthropicClient(apiKey, model);
    case 'gemini':
      return new GeminiClient(apiKey, model);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * OpenAI client implementation
 */
class OpenAIClient {
  constructor(apiKey, model = 'gpt-4-1106-preview') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateResponse(messages) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.2,
        max_tokens: 2048
      });

      return response.choices[0].message.content;
    } catch (error) {
      logger.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

/**
 * Anthropic client implementation
 */
class AnthropicClient {
  constructor(apiKey, model = 'claude-2') {
    this.apiKey = apiKey;
    this.model = model;
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
  }

  async generateResponse(messages) {
    try {
      // Convert from ChatML format to Anthropic format
      const promptMessages = this.convertToAnthropicFormat(messages);
      
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: promptMessages,
          max_tokens: 2048,
          temperature: 0.2
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      return response.data.content[0].text;
    } catch (error) {
      logger.error('Anthropic API error:', error.response?.data || error.message);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }

  convertToAnthropicFormat(messages) {
    const result = [];
    
    for (const message of messages) {
      // Map roles
      let role = message.role;
      if (role === 'system') {
        // For Claude, we handle system messages differently
        // For simplicity, we'll make system messages user messages with a special prefix
        result.push({
          role: 'user',
          content: `<system>\n${message.content}\n</system>`
        });
        continue;
      } else if (role === 'assistant') {
        role = 'assistant';
      } else {
        role = 'user';
      }
      
      result.push({
        role,
        content: message.content
      });
    }
    
    return result;
  }
}

/**
 * Gemini client implementation
 */
class GeminiClient {
  constructor(apiKey, model = 'gemini-pro') {
    this.apiKey = apiKey;
    this.model = model;
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }

  async generateResponse(messages) {
    try {
      // Convert ChatML format to Gemini format
      const geminiMessages = this.convertToGeminiFormat(messages);
      
      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        {
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const responseText = response.data.candidates[0].content.parts[0].text;
      return responseText;
    } catch (error) {
      logger.error('Gemini API error:', error.response?.data || error.message);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  convertToGeminiFormat(messages) {
    const result = [];
    let systemMessage = '';
    
    // Extract system message if present
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      systemMessage = systemMessages.map(m => m.content).join('\n');
    }
    
    // Process conversation messages
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      // Skip system messages as we've handled them separately
      if (message.role === 'system') continue;
      
      const role = message.role === 'assistant' ? 'model' : 'user';
      let content = message.content;
      
      // Add system message to the first user message
      if (role === 'user' && systemMessage && !result.some(m => m.role === 'user')) {
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
}

module.exports = { setupLLM };