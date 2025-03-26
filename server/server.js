const express = require('express');
const cors = require('cors');
const { createCanvas, loadImage } = require('canvas');
const bodyParser = require('body-parser');


const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for Chrome extension
app.use(cors());

// Increase payload size limit for images
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.post('/analyze', async (req, res) => {
  try {
    // Extract data from request
    const { screenshot, elements, scrollInfo } = req.body;
    
    if (!screenshot || !elements || !Array.isArray(elements)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data. Screenshot and elements array required.'
      });
    }
    
    // Process base64 image data
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Load image
    const image = await loadImage(imageBuffer);
    
    // Create canvas with image dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Draw screenshot
    ctx.drawImage(image, 0, 0);
    
    // Define colors for highlighting
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFA500', 
      '#800080', '#008080', '#FF69B4', '#4B0082',
      '#FF4500', '#2E8B57', '#DC143C', '#4682B4'
    ];
    
    // Extract scroll position and pixel ratio
    const scrollX = scrollInfo?.scrollX || 0;
    const scrollY = scrollInfo?.scrollY || 0;
    const devicePixelRatio = scrollInfo?.devicePixelRatio || 1;
    
    // Draw bounding boxes for each interactive element
    elements.forEach((element) => {
      const { index, bounds, viewportBounds } = element;
      
      // Skip elements with invalid bounds
      if (!bounds || typeof bounds.x !== 'number' || 
          typeof bounds.y !== 'number' || 
          typeof bounds.width !== 'number' || 
          typeof bounds.height !== 'number') {
        console.warn('Skipping element with invalid bounds:', element);
        return;
      }
      
      // Get color based on index
      const colorIndex = index % colors.length;
      const color = colors[colorIndex];
      
      // Adjust position for the screenshot (which is relative to viewport)
      // AND scale by devicePixelRatio to account for high-DPI displays
      const x = (bounds.x - scrollX) * devicePixelRatio;
      const y = (bounds.y - scrollY) * devicePixelRatio;
      const width = bounds.width * devicePixelRatio;
      const height = bounds.height * devicePixelRatio;
      
      // Only draw elements that are actually visible in the viewport (screenshot)
      if (x < -width || y < -height || 
          x > image.width || y > image.height) {
        console.log(`Element ${index} is outside viewport, skipping`);
        return;
      }
      
      // Draw rectangle with scaled lineWidth
      ctx.lineWidth = 2 * devicePixelRatio;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, width, height);
      
      // Add semi-transparent fill
      ctx.fillStyle = `${color}33`; // 20% opacity
      ctx.fillRect(x, y, width, height);
      
      // Draw index label with scaled font
      ctx.fillStyle = color;
      ctx.font = `bold ${14 * devicePixelRatio}px Arial`;
      
      // Create text background for better visibility
      const text = index.toString();
      const textWidth = ctx.measureText(text).width;
      const padding = 4 * devicePixelRatio;
      const labelWidth = textWidth + (padding * 2);
      const labelHeight = 18 * devicePixelRatio;
      
      // Position label (top-right by default)
      let labelX = x + width - labelWidth;
      let labelY = y;
      
      // Adjust if too close to edge
      if (labelX < 0) labelX = x;
      if (labelY < 14 * devicePixelRatio) labelY = y + (14 * devicePixelRatio);
      
      // Ensure label is within image bounds
      if (labelX + labelWidth > image.width) labelX = image.width - labelWidth;
      if (labelY < 0) labelY = 14 * devicePixelRatio;
      
      // Draw label background
      ctx.fillStyle = color;
      ctx.fillRect(labelX, labelY - (14 * devicePixelRatio), labelWidth, labelHeight);
      
      // Draw text
      ctx.fillStyle = 'white';
      ctx.fillText(text, labelX + padding, labelY);
      
      // Add element info with scaled font
      const tagInfo = element.tagName + (element.id ? `#${element.id}` : '');
      const infoY = y + height + (14 * devicePixelRatio);
      if (infoY < image.height) {
        ctx.font = `${10 * devicePixelRatio}px Arial`;
        ctx.fillStyle = 'black';
        ctx.fillText(tagInfo, x, infoY);
      }
    });
    
    // Convert to base64
    const annotatedImage = canvas.toDataURL('image/png');
    
    // Send response
    res.json({
      success: true,
      annotatedImage,
      elementCount: elements.length
    });
    
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});