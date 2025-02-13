// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, { 
  width: 400, 
  height: 600,
  themeColors: true,
  title: "Missing References Finder"
});

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.

console.clear(); // Clear previous logs
console.log('Plugin code started');

interface MissingReference {
  nodeId: string;
  nodeName: string;
  referenceType: string;
  propertyType: string;
  currentValue: any;
  missingSource?: string;
}

// Add scan type definitions
type ScanType = 'colors' | 'typography' | 'spacing' | 'effects';

interface ScanProgress {
  type: ScanType;
  progress: number;
}

async function findMissingColorTokens(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Only get nodes that can have color properties
    const nodes = figma.currentPage.findAll(node => {
      if (!node || node.removed) return false;
      return 'fills' in node || 'strokes' in node;
    });

    const totalNodes = nodes.length;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      
      try {
        // Check fills
        if ('fills' in node) {
          const fills = node.fills;
          if (Array.isArray(fills)) {
            fills.forEach(fill => {
              if (fill.type === 'SOLID' && !fill.boundVariables?.color) {
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Unnamed Node',
                  referenceType: 'token',
                  propertyType: 'fill',
                  currentValue: fill.color,
                  missingSource: 'Color Token'
                });
              }
            });
          }
        }

        // Check strokes
        if ('strokes' in node) {
          const strokes = node.strokes;
          if (Array.isArray(strokes)) {
            strokes.forEach(stroke => {
              if (stroke.type === 'SOLID' && !stroke.boundVariables?.color) {
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Unnamed Node',
                  referenceType: 'token',
                  propertyType: 'stroke',
                  currentValue: stroke.color,
                  missingSource: 'Color Token'
                });
              }
            });
          }
        }

        // Update progress
        if (i % 10 === 0) {
          progressCallback((i / totalNodes) * 100);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch (err) {
        console.warn('Error checking node:', node.name, err);
      }
    }

    progressCallback(100);
    return missingRefs;
  } catch (err) {
    console.error('Error scanning for color tokens:', err);
    return missingRefs;
  }
}

async function findMissingTypographyTokens(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Only get text nodes
    const nodes = figma.currentPage.findAll(node => node.type === 'TEXT');
    const totalNodes = nodes.length;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as TextNode;
      try {
        if (!node.textStyleId) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name || 'Unnamed Text',
            referenceType: 'style',
            propertyType: 'typography',
            currentValue: {
              fontSize: node.fontSize,
              fontName: node.fontName
            },
            missingSource: 'Typography Style'
          });
        }

        // Update progress
        if (i % 10 === 0) {
          progressCallback((i / totalNodes) * 100);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch (err) {
        console.warn('Error checking text node:', node.name, err);
      }
    }

    progressCallback(100);
    return missingRefs;
  } catch (err) {
    console.error('Error scanning for typography tokens:', err);
    return missingRefs;
  }
}

// Handle messages from the UI
figma.ui.onmessage = async (msg) => {
  console.log('Plugin received message:', msg);

  if (msg.type === 'resize') {
    // Get the new size
    const { width, height } = msg;
    
    // Apply minimum dimensions
    const newWidth = Math.max(320, width);
    const newHeight = Math.max(400, height);
    
    // Resize the window
    figma.ui.resize(newWidth, newHeight);
  }
  
  if (msg.type === 'scan-for-tokens') {
    try {
      // Scan for colors first
      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: 'Scanning for color tokens...' 
      });
      
      const colorRefs = await findMissingColorTokens(progress => {
        figma.ui.postMessage({ 
          type: 'scan-progress',
          scanType: 'colors',
          progress 
        });
      });

      // Then scan for typography
      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: 'Scanning for typography tokens...' 
      });
      
      const typographyRefs = await findMissingTypographyTokens(progress => {
        figma.ui.postMessage({ 
          type: 'scan-progress',
          scanType: 'typography',
          progress 
        });
      });

      // Combine results
      const allRefs = [...colorRefs, ...typographyRefs];
      
      figma.ui.postMessage({ 
        type: 'missing-references-result', 
        references: allRefs
      });

    } catch (err) {
      console.error('Scan failed:', err);
      figma.ui.postMessage({ 
        type: 'error', 
        message: 'Scan failed. Please try again.' 
      });
    }
  }
  
  if (msg.type === 'apply-token') {
    const { nodeId, tokenType, tokenValue } = msg;
    const node = figma.getNodeById(nodeId);
    
    if (node) {
      try {
        const variable = figma.variables.getVariableById(tokenValue);
        if (!variable) {
          throw new Error('Variable not found');
        }

        if (tokenType === 'fill' && 'fills' in node) {
          const fills = [...(node.fills as Paint[])];
          if (fills.length > 0 && fills[0].type === 'SOLID') {
            await figma.variables.setBoundVariableForPaint(
              fills[0] as SolidPaint,
              'color',
              variable
            );
            node.fills = fills;
          }
        } else if (tokenType === 'stroke' && 'strokes' in node) {
          const strokes = [...(node.strokes as Paint[])];
          if (strokes.length > 0 && strokes[0].type === 'SOLID') {
            await figma.variables.setBoundVariableForPaint(
              strokes[0] as SolidPaint,
              'color',
              variable
            );
            node.strokes = strokes;
          }
        } else if (tokenType === 'effect' && 'effects' in node) {
          const effects = [...(node.effects as Effect[])];
          if (effects.length > 0) {
            await figma.variables.setBoundVariableForEffect(
              effects[0],
              'spread', // or appropriate effect property
              variable
            );
            node.effects = effects;
          }
        }
        figma.ui.postMessage({ type: 'success', message: `${tokenType} token applied successfully` });
      } catch (error: any) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to apply token: ${error.message}` 
        });
      }
    }
  }

  if (msg.type === 'apply-style') {
    const { nodeId, styleType, styleId } = msg;
    const node = figma.getNodeById(nodeId);
    const style = figma.getStyleById(styleId);
    
    if (node && style) {
      try {
        switch (styleType) {
          case 'fill':
            if ('fillStyleId' in node) {
              node.fillStyleId = styleId;
            }
            break;
          case 'stroke':
            if ('strokeStyleId' in node) {
              node.strokeStyleId = styleId;
            }
            break;
          case 'effect':
            if ('effectStyleId' in node) {
              node.effectStyleId = styleId;
            }
            break;
          case 'text':
            if (node.type === 'TEXT') {
              node.textStyleId = styleId;
            }
            break;
        }
        figma.ui.postMessage({ type: 'success', message: `${styleType} style applied successfully` });
      } catch (error: any) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to apply style: ${error.message}` 
        });
      }
    }
  }

  if (msg.type === 'swap-component') {
    const { nodeId } = msg;
    const node = figma.getNodeById(nodeId);
    
    if (node && node.type === 'INSTANCE') {
      try {
        // Use component browser instead of showComponentPicker
        await figma.showUI(__html__, { width: 400, height: 600 });
        const components = figma.currentPage.findAll(node => node.type === "COMPONENT");
        
        if (components.length > 0) {
          const newInstance = (components[0] as ComponentNode).createInstance();
          newInstance.x = node.x;
          newInstance.y = node.y;
          newInstance.resize(node.width, node.height);
          node.parent?.insertChild(node.parent.children.indexOf(node), newInstance);
          node.remove();
          figma.ui.postMessage({ type: 'success', message: 'Component swapped successfully' });
        } else {
          throw new Error('No components found to swap with');
        }
      } catch (error: any) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to swap component: ${error.message}` 
        });
      }
    }
  }

  // Only close the plugin when explicitly requested
  if (msg.type === 'close-plugin') {
    figma.closePlugin();
  }
};

// Wrap the window size restoration in an IIFE
(async function restoreWindowSize() {
  try {
    const savedSize = await figma.clientStorage.getAsync('windowSize');
    if (savedSize) {
      figma.ui.resize(savedSize.width, savedSize.height);
    }
  } catch (err) {
    console.error('Failed to restore window size:', err);
  }
})();

