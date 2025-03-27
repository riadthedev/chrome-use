/**
 * Handles execution of actions on the page
 */
class ActionController {
    constructor(domBuilder) {
      this.domBuilder = domBuilder;
      this.selectorMap = {};
      this.debug = false;
    }
    
    setDebug(value) {
      this.debug = value;
    }
    
    updateSelectorMap(map) {
      this.selectorMap = map;
    }
    
    // Helper function to find element by XPath
    _findElementByXPath(xpath) {
      try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
      } catch (e) {
        console.error(`Error evaluating XPath: ${xpath}`, e);
        return null;
      }
    }
    
    async executeAction(action) {
      if (this.debug) console.log('Executing action:', action);
      
      try {
        switch (action.type) {
          case 'click_element':
            // Support both old index and new xpath approaches during transition
            if (action.xpath) {
              return await this.clickElementByXPath(action.xpath);
            } else if (action.index !== undefined) {
              return await this.clickElement(action.index);
            } else {
              throw new Error('click_element requires either xpath or index parameter');
            }
          
          case 'input_text':
            // Support both old index and new xpath approaches during transition
            if (action.xpath) {
              return await this.inputTextByXPath(action.xpath, action.text);
            } else if (action.index !== undefined) {
              return await this.inputText(action.index, action.text);
            } else {
              throw new Error('input_text requires either xpath or index parameter');
            }
          
          case 'extract_content':
            return await this.extractContent(action.goal);
          
          case 'scroll':
            return await this.scroll(action.direction, action.amount);
          
          case 'wait':
            return await this.wait(action.seconds || 1);
            
          case 'done':
            return this.done(action.text, action.success);
          
          default:
            throw new Error(`Unknown action type: ${action.type}`);
        }
      } catch (error) {
        console.error('Action execution failed:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }
    
    // Keep the original method for backward compatibility
    async clickElement(index) {
      const element = this.selectorMap[index];
      
      if (!element) {
        throw new Error(`Element with index ${index} not found`);
      }
      
      // Scroll element into view if needed
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Wait for any scroll to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try different click methods
      try {
        // Method 1: Standard click
        element.click();
      } catch (error) {
        try {
          // Method 2: MouseEvent dispatch
          const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          element.dispatchEvent(event);
        } catch (error2) {
          // Method 3: JavaScript click simulation
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Simulate mousedown
          element.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, cancelable: true, view: window,
            clientX: centerX, clientY: centerY
          }));
          
          // Simulate mouseup
          element.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true, cancelable: true, view: window,
            clientX: centerX, clientY: centerY
          }));
        }
      }
      
      // Wait for any DOM updates
      await new Promise(resolve => setTimeout(resolve, 300));
      
      return {
        success: true,
        message: `Clicked element with index ${index}`
      };
    }
    
    // New method using XPath
    async clickElementByXPath(xpath) {
      const element = this._findElementByXPath(xpath);
      
      if (!element) {
        throw new Error(`Element with XPath "${xpath}" not found`);
      }
      
      // Scroll element into view if needed
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Wait for any scroll to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try different click methods
      try {
        // Method 1: Standard click
        element.click();
      } catch (error) {
        try {
          // Method 2: MouseEvent dispatch
          const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          element.dispatchEvent(event);
        } catch (error2) {
          // Method 3: JavaScript click simulation
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Simulate mousedown
          element.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, cancelable: true, view: window,
            clientX: centerX, clientY: centerY
          }));
          
          // Simulate mouseup
          element.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true, cancelable: true, view: window,
            clientX: centerX, clientY: centerY
          }));
        }
      }
      
      // Wait for any DOM updates
      await new Promise(resolve => setTimeout(resolve, 300));
      
      return {
        success: true,
        message: `Clicked element with XPath "${xpath}"`
      };
    }
    
    // Keep the original method for backward compatibility
    async inputText(index, text) {
      const element = this.selectorMap[index];
      
      if (!element) {
        throw new Error(`Element with index ${index} not found`);
      }
      
      // Focus the element
      element.focus();
      
      // Clear existing value for input elements
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = '';
      } else if (element.isContentEditable) {
        // For contentEditable elements
        element.textContent = '';
      }
      
      // Input text character by character for a more natural feel
      for (const char of text) {
        // Standard value update
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.value += char;
        } else if (element.isContentEditable) {
          // For contentEditable elements
          element.textContent += char;
        }
        
        // Dispatch input event
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
        
        // Small delay between characters for natural typing
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Trigger change event
      const changeEvent = new Event('change', { bubbles: true });
      element.dispatchEvent(changeEvent);
      
      return {
        success: true,
        message: `Input text "${text}" into element with index ${index}`
      };
    }
    
    // New method using XPath
    async inputTextByXPath(xpath, text) {
      const element = this._findElementByXPath(xpath);
      
      if (!element) {
        throw new Error(`Element with XPath "${xpath}" not found`);
      }
      
      // Focus the element
      element.focus();
      
      // Clear existing value for input elements
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = '';
      } else if (element.isContentEditable) {
        // For contentEditable elements
        element.textContent = '';
      }
      
      // Input text character by character for a more natural feel
      for (const char of text) {
        // Standard value update
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.value += char;
        } else if (element.isContentEditable) {
          // For contentEditable elements
          element.textContent += char;
        }
        
        // Dispatch input event
        const inputEvent = new Event('input', { bubbles: true });
        element.dispatchEvent(inputEvent);
        
        // Small delay between characters for natural typing
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Trigger change event
      const changeEvent = new Event('change', { bubbles: true });
      element.dispatchEvent(changeEvent);
      
      return {
        success: true,
        message: `Input text "${text}" into element with XPath "${xpath}"`
      };
    }
    
    async extractContent(goal) {
      if (this.debug) console.log('Extracting content with goal:', goal);
      
      let content = '';
      
      // Extract based on goal keywords
      if (goal.toLowerCase().includes('title')) {
        content += `Page title: ${document.title}\n\n`;
      }
      
      if (goal.toLowerCase().includes('text') || goal.toLowerCase().includes('content')) {
        // Get all visible text on the page
        const visibleText = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, div, span'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            return el.offsetWidth > 0 && 
                   el.offsetHeight > 0 && 
                   style.visibility !== 'hidden' && 
                   style.display !== 'none' &&
                   el.textContent.trim().length > 0;
          })
          .map(el => el.textContent.trim())
          .join('\n\n');
        
        content += `Page content:\n${visibleText}\n\n`;
      }
      
      if (goal.toLowerCase().includes('link') || goal.toLowerCase().includes('url')) {
        const links = Array.from(document.querySelectorAll('a[href]'))
          .filter(link => {
            const style = window.getComputedStyle(link);
            return link.offsetWidth > 0 && 
                   link.offsetHeight > 0 && 
                   style.visibility !== 'hidden' && 
                   style.display !== 'none';
          })
          .map(link => ({
            text: link.textContent.trim(),
            href: link.href
          }));
        
        content += `Links:\n${JSON.stringify(links, null, 2)}\n\n`;
      }
      
      if (goal.toLowerCase().includes('image')) {
        const images = Array.from(document.querySelectorAll('img'))
          .filter(img => {
            const style = window.getComputedStyle(img);
            return img.offsetWidth > 0 && 
                   img.offsetHeight > 0 && 
                   style.visibility !== 'hidden' && 
                   style.display !== 'none';
          })
          .map(img => ({
            alt: img.alt,
            src: img.src,
            width: img.width,
            height: img.height
          }));
        
        content += `Images:\n${JSON.stringify(images, null, 2)}\n\n`;
      }
      
      if (goal.toLowerCase().includes('table')) {
        const tables = Array.from(document.querySelectorAll('table'))
          .filter(table => {
            const style = window.getComputedStyle(table);
            return table.offsetWidth > 0 && 
                   table.offsetHeight > 0 && 
                   style.visibility !== 'hidden' && 
                   style.display !== 'none';
          })
          .map(table => {
            const headers = Array.from(table.querySelectorAll('th'))
              .map(th => th.textContent.trim());
            
            const rows = Array.from(table.querySelectorAll('tr'))
              .map(tr => {
                return Array.from(tr.querySelectorAll('td'))
                  .map(td => td.textContent.trim());
              })
              .filter(row => row.length > 0);
            
            return { headers, rows };
          });
        
        content += `Tables:\n${JSON.stringify(tables, null, 2)}\n\n`;
      }
      
      return {
        success: true,
        extracted: content
      };
    }
    
    async scroll(direction = 'down', amount = 0) {
      const scrollAmount = amount || window.innerHeight / 2;
      const scrollY = direction.toLowerCase() === 'down' ? scrollAmount : -scrollAmount;
      
      window.scrollBy({
        top: scrollY,
        behavior: 'smooth'
      });
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return {
        success: true,
        message: `Scrolled ${direction} by ${scrollAmount}px`
      };
    }
    
    async wait(seconds) {
      const ms = Math.max(100, Math.min(30000, seconds * 1000)); // Between 0.1s and 30s
      await new Promise(resolve => setTimeout(resolve, ms));
      
      return {
        success: true,
        message: `Waited for ${seconds} seconds`
      };
    }
    
    done(text, success = true) {
      return {
        success: true,
        isComplete: true,
        finalMessage: text,
        taskSuccess: success
      };
    }
  }
  
  // Export as global variable
  window.ActionController = ActionController;