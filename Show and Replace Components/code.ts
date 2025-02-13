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
  type: ScanType;
  property: string;
  currentValue: any;
  location: string;
  variableName?: string;
  variableValue?: any;
}

// Update ScanType to match the UI options exactly
type ScanType = 
  | 'vertical-gap'
  | 'horizontal-padding'
  | 'vertical-padding'
  | 'corner-radius'
  | 'fill'
  | 'stroke'
  | 'typography';

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
  return 'layoutMode' in node && node.layoutMode !== 'NONE';
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

// Update the type guard function to be more specific
function hasCornerRadius(node: BaseNode): node is RectangleNode | ComponentNode | InstanceNode | FrameNode {
  if (node.type !== 'RECTANGLE' && 
      node.type !== 'COMPONENT' && 
      node.type !== 'INSTANCE' && 
      node.type !== 'FRAME') {
    return false;
  }
  
  // Check if the node has cornerRadius property
  return 'cornerRadius' in node || (
    'topLeftRadius' in node &&
    'topRightRadius' in node &&
    'bottomLeftRadius' in node &&
    'bottomRightRadius' in node
  );
}

// Add interface for corner radius bound variables
interface CornerRadiusVariables {
  cornerRadius?: VariableBinding;
  topLeftRadius?: VariableBinding;
  topRightRadius?: VariableBinding;
  bottomLeftRadius?: VariableBinding;
  bottomRightRadius?: VariableBinding;
}

// Function to scan for missing text styles
async function scanForTextTokens(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = figma.currentPage.findAll(node => node.type === 'TEXT');
    console.log(`Found ${nodes.length} text nodes`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) {
        console.log('Scan cancelled by user');
        break;
      }
      
      const node = nodes[i] as TextNode;
      try {
        if (node.textStyleId && typeof node.textStyleId === 'string') {
          const style = await figma.getStyleByIdAsync(node.textStyleId);
          if (!style || style.remote) {
            console.log(`Missing text style in node: ${node.name}`);
            missingRefs.push({
              nodeId: node.id,
              nodeName: node.name || 'Unnamed Text Node',
              type: 'typography',
              property: 'textStyleId',
              currentValue: node.textStyleId,
              location: 'Text Style'
            });
          }
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

// Function to scan for missing color variables
async function scanForColorTokens(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Get all available variables in the document using async method
    const localVariables = await figma.variables.getLocalVariablesAsync();
    const libraryVariables = await Promise.all(
      (await figma.variables.getLocalVariablesAsync())
        .filter(v => v.remote)
        .map(async v => {
          try {
            return await figma.variables.importVariableByKeyAsync(v.key);
          } catch (err) {
            console.warn(`Failed to import variable: ${v.name}`, err);
            return null;
          }
        })
    );

    const nodes = figma.currentPage.findAll(node => {
      if (!node || node.removed) return false;
      return 'fills' in node || 'strokes' in node || 'backgroundColor' in node;
    });
    console.log(`Found ${nodes.length} nodes with color properties`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) {
        console.log('Scan cancelled by user');
        break;
      }
      
      const node = nodes[i];
      try {
        // Check for bound variables
        if ('boundVariables' in node) {
          const boundVars = (node as any).boundVariables;
          // Use Object.keys() instead of entries
          const keys = Object.keys(boundVars);
          for (const key of keys) {
            const binding = boundVars[key];
            if (binding.type === 'VARIABLE') {
              // Check if the variable exists locally
              const localVar = localVariables.find(v => v.id === binding.id);
              // Check if it's a library variable that's missing
              const libraryVar = libraryVariables.find(v => v?.id === binding.id);
              
              if (!localVar && !libraryVar) {
                console.log(`Missing library variable in node: ${node.name}`);
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Unnamed Node',
                  type: 'fill',
                  property: key,
                  currentValue: binding.id,
                  location: `Missing Library Variable`,
                  variableName: binding.name || 'Unknown Variable',
                  variableValue: binding.value || null
                });
              }
            }
          }
        }

        // Check fills
        if ('fills' in node) {
          const fills = node.fills;
          if (Array.isArray(fills)) {
            fills.forEach((fill: Paint, index) => {
              if (fill.type === 'SOLID' && !node.boundVariables?.fills?.[index]) {
                console.log(`Missing color variable in fill of node: ${node.name}`);
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Unnamed Node',
                  type: 'fill',
                  property: `fills[${index}]`,
                  currentValue: fill.color,
                  location: 'Fill'
                });
              }
            });
          }
        }

        // Check strokes
        if ('strokes' in node) {
          const strokes = node.strokes;
          if (Array.isArray(strokes)) {
            strokes.forEach((stroke: Paint, index) => {
              if (stroke.type === 'SOLID' && !node.boundVariables?.strokes?.[index]) {
                console.log(`Missing color variable in stroke of node: ${node.name}`);
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Unnamed Node',
                  type: 'stroke',
                  property: `strokes[${index}]`,
                  currentValue: stroke.color,
                  location: 'Stroke'
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

// Function to group missing references by property
function groupMissingReferences(missingRefs: MissingReference[]): Record<string, MissingReference[]> {
  return missingRefs.reduce((groups, ref) => {
    if (!groups[ref.property]) {
      groups[ref.property] = [];
    }
    groups[ref.property].push(ref);
    return groups;
  }, {} as Record<string, MissingReference[]>);
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
      const scanType = msg.scanType as ScanType;

      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: `Scanning for ${scanType}...` 
      });

      let refs: MissingReference[] = [];
      
      switch (scanType) {
        case 'vertical-gap':
          refs = await scanForVerticalGap(progress => {
            figma.ui.postMessage({ type: 'scan-progress', progress });
          });
          break;
          
        case 'horizontal-padding':
        case 'vertical-padding':
          refs = await scanForPadding(
            progress => {
              figma.ui.postMessage({ type: 'scan-progress', progress });
            },
            scanType
          );
          break;
          
        case 'corner-radius':
          refs = await scanForCornerRadius(progress => {
            figma.ui.postMessage({ type: 'scan-progress', progress });
          });
          break;
          
        case 'fill':
        case 'stroke':
          refs = await scanForColorTokens(progress => {
            figma.ui.postMessage({ type: 'scan-progress', progress });
          });
          break;
          
        case 'typography':
          refs = await scanForTextTokens(progress => {
            figma.ui.postMessage({ type: 'scan-progress', progress });
          });
          break;
      }

      const groupedRefs = groupMissingReferences(refs);

      figma.ui.postMessage({ 
        type: 'missing-references-result', 
        references: groupedRefs 
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

  if (msg.type === 'select-group') {
    const { nodeIds } = msg;
    console.log('Attempting to select nodes:', nodeIds);
    
    try {
      // Validate nodeIds array
      if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
        throw new Error('Invalid node IDs provided');
      }

      // Add a timeout to prevent infinite waiting
      const timeout = 5000; // 5 seconds
      const getNodeWithTimeout = async (id: string) => {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), timeout);
        });

        try {
          const nodePromise = figma.getNodeByIdAsync(id);
          const node = await Promise.race([nodePromise, timeoutPromise]);
          return node;
        } catch (err) {
          console.warn(`Failed to get node ${id}:`, err);
          return null;
        }
      };

      // Get nodes with timeout and error handling
      const nodes = await Promise.all(
        nodeIds.map(async (id: string) => {
          if (typeof id !== 'string') {
            console.warn('Invalid node ID:', id);
            return null;
          }
          return getNodeWithTimeout(id);
        })
      );

      // Use Figma's type checking
      const validNodes = nodes.filter((node): node is SceneNode => {
        if (!node) return false;
        try {
          // First check if node is a record/object
          if (typeof node !== 'object' || node === null) return false;
          
          // Now we can safely check for properties
          const nodeAsAny = node as any;
          if (!nodeAsAny.type || !nodeAsAny.id) return false;
          
          // Check if it's a valid scene node type
          const validSceneNodeTypes = new Set([
            'RECTANGLE',
            'ELLIPSE',
            'POLYGON',
            'STAR',
            'VECTOR',
            'TEXT',
            'FRAME',
            'COMPONENT',
            'INSTANCE',
            'BOOLEAN_OPERATION',
            'GROUP',
            'LINE',
            'STAMP'
          ]);
          
          const isSceneNode = validSceneNodeTypes.has(nodeAsAny.type as string);
          console.log(`Node ${nodeAsAny.id} type: ${nodeAsAny.type}, isSceneNode: ${isSceneNode}`);
          return isSceneNode;
        } catch (err) {
          console.warn('Error checking node validity:', err);
          return false;
        }
      });

      console.log('Valid nodes to select:', validNodes.length);
      
      if (validNodes.length > 0) {
        try {
          // Ensure nodes are still valid and selectable
          const accessibleNodes = validNodes.filter(node => {
            try {
              // Check if node is still valid and on the current page
              return (
                node.id && 
                node.parent && 
                (node.parent === figma.currentPage || node.parent.parent === figma.currentPage)
              );
            } catch {
              return false;
            }
          });

          if (accessibleNodes.length > 0) {
            figma.currentPage.selection = accessibleNodes;
            figma.viewport.scrollAndZoomIntoView(accessibleNodes);
            figma.ui.postMessage({ 
              type: 'success', 
              message: `Selected ${accessibleNodes.length} nodes in Figma` 
            });
          } else {
            throw new Error('No accessible nodes found');
          }
        } catch (error) {
          throw new Error(`Failed to select nodes: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        figma.ui.postMessage({ 
          type: 'error', 
          message: 'No valid nodes found to select' 
        });
      }
    } catch (error) {
      console.error('Error in select-group:', error);
      figma.ui.postMessage({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to select nodes'
      });
    }
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

async function scanForVerticalGap(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = figma.currentPage.findAll(node => hasAutoLayout(node) && node.layoutMode === 'VERTICAL');
    console.log(`Found ${nodes.length} nodes with vertical auto-layout`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as FrameNode;
      if (!node.boundVariables?.itemSpacing) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'vertical-gap',
          property: 'itemSpacing',
          currentValue: node.itemSpacing,
          location: 'Auto Layout'
        });
      }

      progressCallback((i / nodes.length) * 100);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for vertical gaps:', err);
  }
  
  return missingRefs;
}

async function scanForPadding(
  progressCallback: (progress: number) => void,
  type: 'horizontal-padding' | 'vertical-padding'
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = figma.currentPage.findAll(hasAutoLayout);
    console.log(`Found ${nodes.length} nodes with auto-layout`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as FrameNode;
      const boundVars = node.boundVariables || {};

      if (type === 'horizontal-padding') {
        if (!boundVars.paddingLeft && node.paddingLeft > 0) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'horizontal-padding',
            property: 'paddingLeft',
            currentValue: node.paddingLeft,
            location: 'Left Padding'
          });
        }
        if (!boundVars.paddingRight && node.paddingRight > 0) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'horizontal-padding',
            property: 'paddingRight',
            currentValue: node.paddingRight,
            location: 'Right Padding'
          });
        }
      } else {
        if (!boundVars.paddingTop && node.paddingTop > 0) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'vertical-padding',
            property: 'paddingTop',
            currentValue: node.paddingTop,
            location: 'Top Padding'
          });
        }
        if (!boundVars.paddingBottom && node.paddingBottom > 0) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'vertical-padding',
            property: 'paddingBottom',
            currentValue: node.paddingBottom,
            location: 'Bottom Padding'
          });
        }
      }

      progressCallback((i / nodes.length) * 100);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for padding:', err);
  }
  
  return missingRefs;
}

async function scanForCornerRadius(
  progressCallback: (progress: number) => void
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = figma.currentPage.findAll(hasCornerRadius);
    console.log(`Found ${nodes.length} nodes with corner radius`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as RectangleNode | ComponentNode | InstanceNode | FrameNode;
      const cornerRadius = node.cornerRadius;
      
      // Cast boundVariables to our interface
      const boundVars = node.boundVariables as CornerRadiusVariables | undefined;

      // Check main corner radius
      if (cornerRadius !== figma.mixed && 
          typeof cornerRadius === 'number' && 
          cornerRadius > 0 && 
          !boundVars?.cornerRadius) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'corner-radius',
          property: 'cornerRadius',
          currentValue: cornerRadius,
          location: 'Corner Radius'
        });
      }

      // Check individual corners if they exist
      if ('topLeftRadius' in node) {
        const corners = [
          { prop: 'topLeftRadius', name: 'Top Left' },
          { prop: 'topRightRadius', name: 'Top Right' },
          { prop: 'bottomLeftRadius', name: 'Bottom Left' },
          { prop: 'bottomRightRadius', name: 'Bottom Right' }
        ] as const;

        for (const corner of corners) {
          const radius = node[corner.prop];
          const hasBinding = boundVars?.[corner.prop];

          // Simplified check - removed figma.mixed check
          if (typeof radius === 'number' && 
              radius > 0 && 
              !hasBinding) {
            missingRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              type: 'corner-radius',
              property: corner.prop,
              currentValue: radius,
              location: `${corner.name} Corner Radius`
            });
          }
        }
      }

      progressCallback((i / nodes.length) * 100);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for corner radius:', err);
  }
  
  return missingRefs;
}

