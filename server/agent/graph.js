const { StateGraph } = require('@langchain/langgraph');
const { END } = require('@langchain/langgraph');
const { StateSchema } = require('./state-schema');

class AgentGraph {
  constructor({ geminiClient, messageManager, websocket }) {
    this.geminiClient = geminiClient;
    this.messageManager = messageManager;
    this.websocket = websocket;
    this.graph = this.buildGraph();
  }

  buildGraph() {
    // Define the state graph
    const graph = new StateGraph({
      channels: StateSchema
    });

    // Add nodes for each workflow state
    graph.addNode('initialize', this.initialize.bind(this));
    graph.addNode('observe', this.observe.bind(this));
    graph.addNode('think', this.think.bind(this));
    graph.addNode('decide', this.decide.bind(this));
    graph.addNode('execute', this.execute.bind(this));
    graph.addNode('evaluate', this.evaluate.bind(this));

    // Define the workflow edges (transitions between states)
    graph.addEdge('initialize', 'observe');
    graph.addEdge('observe', 'think');
    graph.addEdge('think', 'decide');
    graph.addEdge('decide', 'execute');
    graph.addEdge('execute', 'observe');
    graph.addEdge('evaluate', 'think');

    // Add conditional edge to end the workflow
    graph.addConditionalEdge(
      'decide',
      (state) => state.isComplete ? END : 'execute',
      (state) => {
        return state.nextAction?.type === 'done' || state.isComplete;
      }
    );

    return graph.compile();
  }

  async runNode(nodeName, inputs) {
    try {
      // Run a specific node in the graph with given inputs
      const result = await this.graph.invoke({
        current_node: nodeName,
        ...inputs
      });
      return result;
    } catch (error) {
      console.error(`Error running node ${nodeName}:`, error);
      throw error;
    }
  }

  // Node implementations
  async initialize(state) {
    console.log('Initializing agent with task:', state.task);
    this.messageManager.reset();
    this.messageManager.setTask(state.task);
    
    return {
      ...state,
      history: [],
      isComplete: false
    };
  }

  async observe(state) {
    console.log('Observing DOM state for URL:', state.domState?.url);
    
    // Update message manager with new DOM state
    if (state.domState) {
      this.messageManager.addDOMState(state.domState, state.screenshot);
    }
    
    return {
      ...state,
      history: [...(state.history || []), {
        type: 'observation',
        url: state.domState?.url,
        timestamp: Date.now()
      }]
    };
  }

  async think(state) {
    console.log('Thinking about next action');
    
    // Get response from Gemini
    const prompt = this.messageManager.formatPrompt(state);
    const thinking = await this.geminiClient.generateResponse(prompt);
    
    return {
      ...state,
      thinking
    };
  }

  async decide(state) {
    console.log('Deciding on next action');
    
    // Parse LLM output into structured action
    const nextAction = this.parseAction(state.thinking);
    console.log('Decided action:', nextAction);
    
    // Check if this is a completion action
    const isComplete = nextAction.type === 'done';
    
    return {
      ...state,
      nextAction,
      isComplete
    };
  }

  async execute(state) {
    console.log('Executing action:', state.nextAction);
    
    // Send action to extension via WebSocket
    this.websocket.send(JSON.stringify({
      type: 'action',
      action: state.nextAction
    }));
    
    // For the execute node, we don't update the state immediately
    // The extension will send back the result, which will be processed by the evaluate node
    return state;
  }

  async evaluate(state) {
    console.log('Evaluating action result:', state.lastActionResult);
    
    // Update message manager with action result
    if (state.lastActionResult) {
      this.messageManager.addActionResult(state.lastActionResult);
    }
    
    return {
      ...state,
      history: [...(state.history || []), {
        type: 'action',
        action: state.nextAction,
        result: state.lastActionResult,
        timestamp: Date.now()
      }]
    };
  }

  // Helper methods
  parseAction(thinkingOutput) {
    try {
      // Try to extract JSON from the thinking output
      const jsonMatch = thinkingOutput.match(/```json\n([\s\S]*?)\n```/) || 
                        thinkingOutput.match(/```([\s\S]*?)```/) ||
                        thinkingOutput.match(/{[\s\S]*?}/);
      
      if (jsonMatch) {
        const actionJson = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        
        // Validate the parsed action
        if (!actionJson.type) {
          throw new Error('Action missing type');
        }
        
        return actionJson;
      }
      
      // Fallback: try to parse the entire response as JSON
      try {
        const action = JSON.parse(thinkingOutput);
        if (action.type) {
          return action;
        }
      } catch (e) {
        // Not valid JSON, continue to regex parsing
      }
      
      // Last resort: try to infer action from text
      if (thinkingOutput.includes('click') || thinkingOutput.includes('select')) {
        const indexMatch = thinkingOutput.match(/index[:\s]+(\d+)/i);
        return {
          type: 'click',
          index: indexMatch ? parseInt(indexMatch[1]) : 0
        };
      } else if (thinkingOutput.includes('type') || thinkingOutput.includes('input')) {
        const indexMatch = thinkingOutput.match(/index[:\s]+(\d+)/i);
        const textMatch = thinkingOutput.match(/text[:\s]+"([^"]*)"/i) || 
                          thinkingOutput.match(/text[:\s]+'([^']*)'/i) ||
                          thinkingOutput.match(/text[:\s]+([^\n,]*)/i);
        
        return {
          type: 'input',
          index: indexMatch ? parseInt(indexMatch[1]) : 0,
          text: textMatch ? textMatch[1].trim() : ''
        };
      } else if (thinkingOutput.includes('scroll')) {
        const direction = thinkingOutput.includes('down') ? 'down' : 'up';
        const amountMatch = thinkingOutput.match(/amount[:\s]+(\d+)/i);
        
        return {
          type: 'scroll',
          direction,
          amount: amountMatch ? parseInt(amountMatch[1]) : 500
        };
      } else if (thinkingOutput.includes('done') || thinkingOutput.includes('complete')) {
        return {
          type: 'done',
          success: thinkingOutput.includes('success') && !thinkingOutput.includes('not success')
        };
      }
      
      // Default fallback
      throw new Error('Could not parse action from LLM response');
      
    } catch (error) {
      console.error('Error parsing action:', error);
      return {
        type: 'done',
        success: false,
        error: `Failed to determine next action: ${error.message}`
      };
    }
  }
}

module.exports = { AgentGraph };