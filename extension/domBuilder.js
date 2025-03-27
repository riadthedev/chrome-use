/**
 * DOM Builder - Analyzes and structures the DOM for agent interaction
 * Enhanced to match the robustness of buildDomTree
 */
class DOMBuilder {
    constructor(options = {}) {
        this.options = {
            highlightElements: true,
            focusHighlightIndex: -1,
            viewportExpansion: 300, // Pixels beyond viewport to consider
            debugMode: false,
            ...options
        };

        // DOM state tracking
        this.highlightIndex = 0;
        this.selectorMap = {};
        this.HIGHLIGHT_CONTAINER_ID = "agent-highlight-container";
        this.DOM_CACHE = {
            boundingRects: new WeakMap(),
            computedStyles: new WeakMap(),
            clearCache: () => {
                this.DOM_CACHE.boundingRects = new WeakMap();
                this.DOM_CACHE.computedStyles = new WeakMap();
            }
        };
    }

    build() {
        // Reset state
        this.highlightIndex = 0;
        this.selectorMap = {};

        // Clear any existing highlights
        this.removeHighlights();

        // Build DOM tree and return results
        const result = this._buildDomTree(document.body);

        return {
            elementTree: result.tree,
            selectorMap: this.selectorMap
        };
    }

    removeHighlights() {
        const container = document.getElementById(this.HIGHLIGHT_CONTAINER_ID);
        if (container) {
            container.remove();
        }
    }

    _buildDomTree(node, parentIframe = null) {
        if (!node || node.id === this.HIGHLIGHT_CONTAINER_ID) {
            return { tree: null };
        }

        // Handle text nodes
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (!text || !this._isTextNodeVisible(node)) {
                return { tree: null };
            }
            return {
                tree: {
                    type: "TEXT_NODE",
                    text: text,
                    isVisible: true
                }
            };
        }

        // Only process element nodes
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return { tree: null };
        }

        // Skip unacceptable elements
        if (!this._isElementAccepted(node)) {
            return { tree: null };
        }

        // Check visibility (except for body)
        if (node !== document.body && !this._isElementVisible(node)) {
            return { tree: null };
        }

        // Construct node data
        const nodeData = {
            tagName: node.tagName.toLowerCase(),
            attributes: this._getElementAttributes(node),
            xpath: this._getXPathTree(node),
            children: [],
            isVisible: true,
            isInteractive: false,
            isTopElement: false,
            isInViewport: false,
            highlight_index: null,
            shadowRoot: false
        };

        // Process regular DOM children
        for (const child of node.childNodes) {
            const childResult = this._buildDomTree(child, parentIframe);
            if (childResult.tree) {
                nodeData.children.push(childResult.tree);
            }
        }

        // Handle shadow DOM
        if (node.shadowRoot) {
            nodeData.shadowRoot = true;
            for (const shadowChild of node.shadowRoot.childNodes) {
                const shadowResult = this._buildDomTree(shadowChild, parentIframe);
                if (shadowResult.tree) {
                    nodeData.children.push(shadowResult.tree);
                }
            }
        }

        // Handle iframes
        if (node.tagName.toUpperCase() === 'IFRAME') {
            try {
                const iframeDoc = node.contentDocument || node.contentWindow.document;
                if (iframeDoc) {
                    const iframeResult = this._buildDomTree(iframeDoc.body, node);
                    if (iframeResult.tree) {
                        nodeData.children.push(iframeResult.tree);
                    }
                }
            } catch (e) {
                console.warn('Unable to access iframe:', node);
            }
        }

        // Evaluate interactivity and visibility
        if (this._isInExpandedViewport(node, this.options.viewportExpansion)) {
            nodeData.isInViewport = true;
            if (this._isTopElement(node)) {
                nodeData.isTopElement = true;
                if (this._isInteractiveElement(node)) {
                    nodeData.isInteractive = true;
                    nodeData.highlight_index = this.highlightIndex;
                    this.selectorMap[this.highlightIndex] = node;

                    // Apply highlighting if enabled
                    if (this.options.highlightElements) {
                        if (this.options.focusHighlightIndex >= 0) {
                            if (this.options.focusHighlightIndex === this.highlightIndex) {
                                this._highlightElement(node, this.highlightIndex, parentIframe);
                            }
                        } else {
                            this._highlightElement(node, this.highlightIndex, parentIframe);
                        }
                    }
                    this.highlightIndex++;
                }
            }
        }

        return { tree: nodeData };
    }

    _getElementAttributes(element) {
        const attributes = {};
        const attributeNames = element.getAttributeNames?.() || [];
        for (const name of attributeNames) {
            attributes[name] = element.getAttribute(name);
        }
        return attributes;
    }

    _isElementAccepted(element) {
        const leafElementDenyList = new Set(['svg', 'script', 'style', 'link', 'meta', 'noscript', 'template']);
        return element.tagName && !leafElementDenyList.has(element.tagName.toLowerCase());
    }

    _isElementVisible(element) {
        const style = window.getComputedStyle(element);
        return (
            element.offsetWidth > 0 &&
            element.offsetHeight > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.opacity !== '0'
        );
    }

    _isInExpandedViewport(element, viewportExpansion) {
        if (viewportExpansion === -1) return true;
        const rect = element.getBoundingClientRect();
        return !(
            rect.bottom < -viewportExpansion ||
            rect.top > window.innerHeight + viewportExpansion ||
            rect.right < -viewportExpansion ||
            rect.left > window.innerWidth + viewportExpansion
        );
    }

    _isTopElement(element) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Handle shadow DOM context
        const rootNode = element.getRootNode();
        if (rootNode instanceof ShadowRoot) {
            const topEl = rootNode.elementFromPoint(centerX, centerY);
            if (!topEl) return false;
            let current = topEl;
            while (current && current !== rootNode) {
                if (current === element) return true;
                current = current.parentElement;
            }
            return false;
        }

        // Regular DOM
        const topEl = document.elementFromPoint(centerX, centerY);
        if (!topEl) return false;
        let current = topEl;
        while (current && current !== document.documentElement) {
            if (current === element) return true;
            current = current.parentElement;
        }
        return false;
    }

    _isInteractiveElement(element) {
        const interactiveElements = new Set([
            'a', 'button', 'details', 'embed', 'input', 'label', 'menu', 'menuitem',
            'object', 'select', 'textarea', 'summary'
        ]);
        const interactiveRoles = new Set([
            'button', 'menu', 'menuitem', 'link', 'checkbox', 'radio', 'slider', 'tab',
            'tabpanel', 'textbox', 'combobox', 'grid', 'listbox', 'option', 'progressbar',
            'scrollbar', 'searchbox', 'switch', 'tree', 'treeitem', 'spinbutton', 'tooltip'
        ]);

        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute('role')?.toLowerCase();
        const tabIndex = element.getAttribute('tabindex');
        const style = window.getComputedStyle(element);

        return (
            interactiveElements.has(tagName) ||
            (role && interactiveRoles.has(role)) ||
            (tabIndex !== null && tabIndex !== '-1') ||
            style.cursor === 'pointer' ||
            element.onclick ||
            element.getAttribute('onclick') ||
            element.hasAttribute('ng-click') ||
            element.hasAttribute('@click') ||
            element.hasAttribute('v-on:click') ||
            element.hasAttribute('aria-expanded') ||
            element.hasAttribute('aria-pressed') ||
            element.hasAttribute('aria-selected') ||
            element.hasAttribute('aria-checked') ||
            element.draggable ||
            element.getAttribute('draggable') === 'true'
        );
    }

    _isTextNodeVisible(textNode) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        const isInViewport = this._isInExpandedViewport({ getBoundingClientRect: () => rect }, this.options.viewportExpansion);
        const parentElement = textNode.parentElement;
        if (!parentElement) return false;

        try {
            return isInViewport && parentElement.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true
            });
        } catch (e) {
            const style = window.getComputedStyle(parentElement);
            return isInViewport &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0';
        }
    }

    _highlightElement(element, index, parentIframe = null) {
        let container = document.getElementById(this.HIGHLIGHT_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = this.HIGHLIGHT_CONTAINER_ID;
            container.style.position = 'fixed';
            container.style.pointerEvents = 'none';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.zIndex = '2147483647';
            document.body.appendChild(container);
        }

        const rect = element.getBoundingClientRect();
        const colors = [
            '#FF0000', '#00FF00', '#0000FF', '#FFA500', '#800080',
            '#008080', '#FF69B4', '#4B0082', '#FF4500', '#2E8B57'
        ];
        const colorIndex = index % colors.length;
        const baseColor = colors[colorIndex];
        const backgroundColor = `${baseColor}1A`;

        let top = rect.top;
        let left = rect.left;
        if (parentIframe) {
            const iframeRect = parentIframe.getBoundingClientRect();
            top += iframeRect.top;
            left += iframeRect.left;
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.border = `2px solid ${baseColor}`;
        overlay.style.backgroundColor = backgroundColor;
        overlay.style.pointerEvents = 'none';
        overlay.style.boxSizing = 'border-box';
        overlay.style.top = `${top}px`;
        overlay.style.left = `${left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;

        const label = document.createElement('div');
        label.className = 'agent-highlight-label';
        label.style.position = 'absolute';
        label.style.background = baseColor;
        label.style.color = 'white';
        label.style.padding = '1px 4px';
        label.style.borderRadius = '4px';
        label.style.fontSize = `${Math.min(12, Math.max(8, rect.height / 2))}px`;
        label.textContent = index.toString();

        const labelWidth = 20;
        const labelHeight = 16;
        let labelTop = top + 2;
        let labelLeft = left + rect.width - labelWidth - 2;
        if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
            labelTop = top - labelHeight - 2;
            labelLeft = left + rect.width - labelWidth;
        }

        label.style.top = `${labelTop}px`;
        label.style.left = `${labelLeft}px`;

        container.appendChild(overlay);
        container.appendChild(label);
    }

    _getXPathTree(element, stopAtBoundary = true) {
        const segments = [];
        let currentElement = element;

        while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
            if (stopAtBoundary && (currentElement.parentNode instanceof ShadowRoot || currentElement.parentNode instanceof HTMLIFrameElement)) {
                break;
            }

            let index = 0;
            let sibling = currentElement.previousSibling;
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === currentElement.nodeName) {
                    index++;
                }
                sibling = sibling.previousSibling;
            }

            const tagName = currentElement.nodeName.toLowerCase();
            const xpathIndex = index > 0 ? `[${index + 1}]` : '';
            segments.unshift(`${tagName}${xpathIndex}`);

            currentElement = currentElement.parentNode;
        }

        return segments.join('/');
    }

    _getCachedBoundingRect(element) {
        if (!element) return null;
        if (this.DOM_CACHE.boundingRects.has(element)) {
            return this.DOM_CACHE.boundingRects.get(element);
        }
        const rect = element.getBoundingClientRect();
        this.DOM_CACHE.boundingRects.set(element, rect);
        return rect;
    }

    _getCachedComputedStyle(element) {
        if (!element) return null;
        if (this.DOM_CACHE.computedStyles.has(element)) {
            return this.DOM_CACHE.computedStyles.get(element);
        }
        const style = window.getComputedStyle(element);
        this.DOM_CACHE.computedStyles.set(element, style);
        return style;
    }

    getFormattedDOMString(includeAttributes = []) {
        let result = [];
        const indices = Object.keys(this.selectorMap).map(Number);
        
        // --- Attributes to check for active state ---
        const activeStateAttributes = ['aria-selected', 'aria-current', 'aria-pressed', 'aria-checked', 'checked', 'selected'];
        // --- Common active state classes ---
        const activeStateClasses = ['active', 'selected', 'current', 'highlighted', 'focused', 'checked'];
        
        for (const index of indices) {
            const element = this.selectorMap[index];
            if (!element) continue; // Safety check
        
            const tagName = element.tagName.toLowerCase();
            let text = element.textContent?.trim() || ''; // Use optional chaining and provide default
        
            // --- Get element value ---
            let valueAttr = '';
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
                // Truncate long values to avoid excessive token usage, adjust limit as needed
                const value = (element.value || '').substring(0, 200); 
                if (value) {
                    valueAttr = ` value="${value}"`;
                } else if (element.tagName === 'INPUT' && !element.value) {
                     // Explicitly show empty value for inputs if it's empty
                     valueAttr = ` value=""`;
                }
            } else if (element.isContentEditable) {
                // For contentEditable, use textContent as the "value"
                 const value = (element.textContent || '').substring(0, 200); // Truncate
                 if (value) {
                     valueAttr = ` value="${value}"`;
                 }
            }
            
            // --- Get XPath ---
            const xpath = this._getXPathTree(element);
            
            // --- Build attributes string ---
            const attrs = [];
            
            // 1. Include explicitly requested attributes (avoiding value duplication)
            if (includeAttributes.length > 0) {
                for (const attrName of includeAttributes) {
                    if (element.hasAttribute(attrName)) {
                        // Avoid duplicating the value attribute if already added
                        if (attrName.toLowerCase() !== 'value') {
                            attrs.push(`${attrName}="${element.getAttribute(attrName)}"`);
                        }
                    }
                }
            }
            
            // 2. Add Active State Attributes if present and not already included
            for (const activeAttr of activeStateAttributes) {
                if (element.hasAttribute(activeAttr) && 
                    !includeAttributes.includes(activeAttr)) {
                    attrs.push(`${activeAttr}="${element.getAttribute(activeAttr)}"`);
                }
            }
            
            // 3. Check for active state classes
            const classList = element.classList;
            if (classList && classList.length > 0) {
                let hasActiveClass = false;
                for (const cls of classList) {
                    if (activeStateClasses.some(activeClass => 
                        cls.toLowerCase().includes(activeClass))) {
                        hasActiveClass = true;
                        break;
                    }
                }
                
                // Add class attribute if not already included
                if (!includeAttributes.includes('class')) {
                    attrs.push(`class="${Array.from(classList).join(' ')}"`);
                }
                
                // Add explicit active state indicator
                if (hasActiveClass) {
                    attrs.push(`data-state="active"`);
                }
            }
            
            // 4. Add original index as data attribute for reference
            attrs.push(`data-agent-idx="${index}"`);
            
            let attributesStr = '';
            if (attrs.length > 0) {
                attributesStr = ` ${attrs.join(' ')}`;
            }
        
            // Combine explicit value attribute with other requested attributes
            const allAttrs = `${valueAttr}${attributesStr}`;
        
            // Limit text content length as well
            text = text.substring(0, 100); // Limit text content in the output
        
            // Use both xpath and index for transition period
            result.push(`[${index}][xpath="${xpath}"]<${tagName}${allAttrs}>${text}</${tagName}>`);
        }
        
        return result.join('\n');
    }
    
}

// Export as global variable for the content script
window.DOMBuilder = DOMBuilder;