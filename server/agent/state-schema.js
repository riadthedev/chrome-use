const { z } = require('zod');

// Define schema for agent state
const StateSchema = z.object({
  sessionId: z.string(),
  task: z.string().optional(),
  domState: z.object({
    url: z.string(),
    title: z.string(),
    elements: z.array(z.object({
      index: z.number(),
      tagName: z.string(),
      innerText: z.string().optional(),
      attributes: z.record(z.string()).optional(),
      isVisible: z.boolean().optional(),
      boundingRect: z.object({
        top: z.number(),
        left: z.number(),
        width: z.number(),
        height: z.number()
      }).optional()
    })),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
      scrollY: z.number(),
      maxScroll: z.number()
    }).optional()
  }).optional(),
  screenshot: z.string().optional(),
  thinking: z.any().optional(),
  nextAction: z.object({
    type: z.enum(['click', 'input', 'scroll', 'done']),
    index: z.number().optional(),
    text: z.string().optional(),
    direction: z.enum(['up', 'down']).optional(),
    amount: z.number().optional(),
    success: z.boolean().optional()
  }).optional(),
  lastActionResult: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    message: z.string().optional()
  }).optional(),
  history: z.array(z.any()).optional().default([]),
  isComplete: z.boolean().optional().default(false)
});

module.exports = { StateSchema };