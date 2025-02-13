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

// Simplified type definitions
interface MissingReference {
  nodeId: string;
  nodeName: string;
  type: 'color' | 'text' | 'effect' | 'grid' | 'spacing';
  property: string;
  currentValue: any;
  location: string;
}

// Update ScanType to include all token types
type ScanType = 'colors' | 'typography' | 'spacing' | 'effects' | 'grids';

interface ScanProgress {
  type: ScanType;
  progress: number;
}

// Add a flag to track if scanning should be cancelled
let isScanCancelled = false;

// Add type definitions at the top of the file
type VariableBinding = {
  type: 'VARIABLE';
  id: string;
  name: string;
};

// Update the type guard function
function hasVariableBindings(node: BaseNode): node is SceneNode & { 
  boundVariables: { 
    [key: string]: {
      type: 'VARIABLE';
      id: string;
      value?: any;
    } 
  } 
} {
  return 'boundVariables' in node;
}

// Update the effect properties type
type EffectProperty = 'offset' | 'radius' | 'spread' | 'color';

type EffectPropertyMap = {
  'DROP_SHADOW': EffectProperty[];
  'INNER_SHADOW': EffectProperty[];
  'LAYER_BLUR': EffectProperty[];
  'BACKGROUND_BLUR': EffectProperty[];
};

// Add more type guards based on Figma's API
function hasAutoLayout(node: BaseNode): node is FrameNode | ComponentNode | InstanceNode {
  return 'layoutMode' in node;
}

function hasTextProperties(node: BaseNode): node is TextNode {
  return node.type === 'TEXT';
}

// Add more type guards
function hasTextStyles(node: BaseNode): node is TextNode {
  return node.type === 'TEXT';
}

function hasEffectStyles(node: BaseNode): node is (SceneNode & { effectStyleId: string }) {
  return 'effectStyleId' in node;
}

// Add proper type guards based on Figma's API
function hasFills(node: BaseNode): node is SceneNode & { fills: readonly Paint[] } {
  return 'fills' in node && Array.isArray((node as any).fills);
}

function hasStrokes(node: BaseNode): node is SceneNode & { strokes: readonly Paint[] } {
  return 'strokes' in node && Array.isArray((node as any).strokes);
}

function hasEffects(node: BaseNode): node is SceneNode & { effects: readonly Effect[] } {
  return 'effects' in node && Array.isArray((node as any).effects);
}

// Separate scanning functions for each type
async function scanForColorTokens(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = figma.currentPage.findAll(node => {
      if (!node || node.removed) return false;
      return 'fills' in node || 'strokes' in node || 'backgroundColor' in node;
    });

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i];
      try {
        // Check fills
        if ('fills' in node) {
          const fills = node.fills;
          if (Array.isArray(fills)) {
            fills.forEach((fill: Paint, index) => {
              if (fill.type === 'SOLID') {
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: 'color',
                  property: 'fill',
                  currentValue: fill.color,
                  location: `Fill ${index + 1}`
                });
              }
            });
          }
        }

        progressCallback((i / nodes.length) * 100);
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (err) {
        console.warn(`Error checking node ${node.name}:`, err);
      }
    }

    return missingRefs;
  } catch (err) {
    console.error('Error scanning for colors:', err);
    return missingRefs;
  }
}

async function scanForTextTokens(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = figma.currentPage.findAll(node => node.type === 'TEXT');

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as TextNode;
      try {
        if (!node.textStyleId) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'text',
            property: 'style',
            currentValue: {
              fontSize: node.fontSize,
              fontName: node.fontName
            },
            location: 'Text Style'
          });
        }

        progressCallback((i / nodes.length) * 100);
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (err) {
        console.warn(`Error checking text node ${node.name}:`, err);
      }
    }

    return missingRefs;
  } catch (err) {
    console.error('Error scanning for text styles:', err);
    return missingRefs;
  }
}

// Update the message handler
figma.ui.onmessage = async (msg) => {
  console.log('Plugin received message:', msg);

  if (msg.type === 'resize') {
    const { width, height } = msg;
    
    // Only resize if dimensions actually changed
    if (width !== currentWindowSize.width || height !== currentWindowSize.height) {
      currentWindowSize = { width, height };
      
      // Resize the window
      figma.ui.resize(width, height);
      
      // Save the new size
      try {
        await figma.clientStorage.setAsync('windowSize', currentWindowSize);
      } catch (err) {
        console.error('Failed to save window size:', err);
      }
    }
  }
  
  if (msg.type === 'scan-for-tokens') {
    try {
      isScanCancelled = false;
      const scanType = msg.scanType;

      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: `Scanning for ${scanType}...` 
      });

      let refs: MissingReference[] = [];
      
      switch (scanType) {
        case 'colors':
          refs = await scanForColorTokens(progress => {
            figma.ui.postMessage({ type: 'scan-progress', progress });
          });
          break;
          
        case 'text':
          refs = await scanForTextTokens(progress => {
            figma.ui.postMessage({ type: 'scan-progress', progress });
          });
          break;
          
        // Add other scan types...
      }

      figma.ui.postMessage({ 
        type: 'missing-references-result', 
        references: refs 
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

  // Add cancel handler
  if (msg.type === 'cancel-scan') {
    isScanCancelled = true;
    figma.ui.postMessage({ 
      type: 'scan-cancelled', 
      message: 'Scan cancelled by user' 
    });
  }

  // Only close the plugin when explicitly requested
  if (msg.type === 'close-plugin') {
    figma.closePlugin();
  }
};

// At the start of the file, after the UI setup
let currentWindowSize = {
  width: 400,
  height: 600
};

// Initialize window size
(async function initializeWindowSize() {
  try {
    const savedSize = await figma.clientStorage.getAsync('windowSize');
    if (savedSize) {
      currentWindowSize = savedSize;
      figma.ui.resize(savedSize.width, savedSize.height);
    }
  } catch (err) {
    console.error('Failed to restore window size:', err);
  }
})();

