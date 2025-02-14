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
  title: "Relinky"
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
  type: string;
  property: string;
  currentValue: any;
  location: string;
  variableName?: string;
  variableValue?: any;
  preview?: string;
}

// Update ScanType to include new types
type ScanType = 'vertical-gap' | 'horizontal-padding' | 'vertical-padding' | 'corner-radius' | 'fill' | 'stroke' | 'typography';

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
function hasAutoLayout(node: BaseNode): node is FrameNode {
  return node.type === 'FRAME' && 'layoutMode' in node;
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

// Add this helper function to format typography values
function formatTypographyValue(value: any): string {
  if (!value || typeof value !== 'object') return 'Unknown';
  
  const {
    fontFamily = '',
    fontWeight = '',
    fontSize = ''
  } = value;

  return `${fontFamily} ${fontWeight} ${fontSize}px`;
}

// Update the scanForTextTokens function with better progress reporting
async function scanForTextTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[]
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Use type guard to ensure we only get TextNodes
    const textNodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => node.type === 'TEXT') as TextNode[];
    const totalNodes = textNodes.length;
    let processedNodes = 0;
    
    for (const node of textNodes) {
      if (isScanCancelled) break;
      
      try {
        // Now TypeScript knows this is a TextNode
        if (!node.textStyleId) {
          const fontName = node.fontName;
          let fontFamily = '';
          let fontWeight = '';
          
          if (typeof fontName === 'object' && 'family' in fontName) {
            fontFamily = fontName.family;
            fontWeight = fontName.style;
          }

          // Structure the typography data
          const typographyValue = {
            fontFamily,
            fontWeight,
            fontSize: node.fontSize,
            lineHeight: node.lineHeight === figma.mixed ? 'MIXED' :
                       typeof node.lineHeight === 'number' ? node.lineHeight :
                       'unit' in (node.lineHeight || {}) ? node.lineHeight.unit :
                       null,
            letterSpacing: node.letterSpacing === figma.mixed ? 'MIXED' :
                          typeof node.letterSpacing === 'number' ? node.letterSpacing :
                          'value' in (node.letterSpacing || {}) ? node.letterSpacing.value :
                          null,
            paragraphSpacing: node.paragraphSpacing,
            textCase: node.textCase,
            textDecoration: node.textDecoration,
            content: node.characters.substring(0, 50)
          };

          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'typography',
            property: 'textStyleId',
            currentValue: typographyValue,
            location: 'Text Layer',
            preview: formatTypographyValue(typographyValue)
          });
        }
      } catch (err) {
        console.warn(`Error processing text node ${node.name}:`, err);
      }

      // Update progress more frequently
      processedNodes++;
      // Ensure progress is a whole number between 0 and 100
      const progress = Math.round((processedNodes / totalNodes) * 100);
      progressCallback(progress);

      // Add a small delay every few nodes to prevent UI freezing
      if (processedNodes % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } catch (err) {
    console.error('Error scanning for text tokens:', err);
  }
  
  return missingRefs;
}

// Function to scan for missing color variables
async function scanForColorTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[]
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = (nodesToScan || figma.currentPage.findAll()).filter(node => {
      if (!node || node.removed) return false;
      return 'fills' in node || 'strokes' in node || 'backgroundColor' in node;
    });

    const totalNodes = nodes.length;
    let processedNodes = 0;

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i];
      try {
        // Check for bound variables
        if ('boundVariables' in node) {
          const boundVars = (node as any).boundVariables;
          const keys = Object.keys(boundVars);
          for (const key of keys) {
            const binding = boundVars[key];
            if (binding.type === 'VARIABLE') {
              // Get local variables
              const localVariables = await figma.variables.getLocalVariablesAsync();
              const localVar = localVariables.find(v => v.id === binding.id);
              
              // Get library variables
              const remoteVariables = localVariables.filter(v => v.remote);
              const libraryVar = await Promise.all(
                remoteVariables.map(async v => {
                  try {
                    return await figma.variables.importVariableByKeyAsync(v.key);
                  } catch (err) {
                    console.warn(`Failed to import variable: ${v.key}`, err);
                    return null;
                  }
                })
              ).then(vars => vars.find(v => v?.id === binding.id));
              
              if (!localVar && !libraryVar) {
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

        // Update progress
        processedNodes++;
        const progress = Math.round((processedNodes / totalNodes) * 100);
        progressCallback(progress);

        // Add a small delay every few nodes to prevent UI freezing
        if (processedNodes % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
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

// Update the grouping function to group by exact values
function groupMissingReferences(missingRefs: MissingReference[]): Record<string, MissingReference[]> {
  return missingRefs.reduce((groups, ref) => {
    // Create a unique key combining property and value
    const key = `${ref.property}:${JSON.stringify(ref.currentValue)}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(ref);
    return groups;
  }, {} as Record<string, MissingReference[]>);
}

// Update the PluginMessage interface to include all possible message types
interface PluginMessage {
  type: string;
  scanType?: ScanType;
  scanScope?: 'entire-page' | 'selected-frames';
  selectedFrameIds?: string[];
  width?: number;
  height?: number;
  nodeId?: string;
  nodeIds?: string[];
  tokenType?: string;
  tokenValue?: string;
  styleType?: string;
  styleId?: string;
  message?: string;
  progress?: number;
  references?: Record<string, MissingReference[]>;
}

// Add this function near the top of the file
figma.on('selectionchange', async () => {
  const selection = figma.currentPage.selection;
  const validSelection = selection.filter(node => 
    node.type === 'FRAME' || 
    node.type === 'COMPONENT' || 
    node.type === 'COMPONENT_SET' || 
    node.type === 'SECTION'
  );
  
  figma.ui.postMessage({ 
    type: 'selection-updated',
    hasSelection: validSelection.length > 0,
    count: validSelection.length
  });
});

// Update scanForMissingReferences to use async node fetching
async function scanForMissingReferences(
  scanType: ScanType,
  selectedFrameIds?: string[],
  progressCallback?: (progress: number) => void
): Promise<MissingReference[]> {
  let nodesToScan: SceneNode[] = [];
  
  try {
    console.log(`Starting scan for ${scanType}`);
    // Get the nodes to scan based on selection
    if (selectedFrameIds && selectedFrameIds.length > 0) {
      console.log(`Scanning selected frames: ${selectedFrameIds.length} frames`);
      // Use Promise.all to fetch all nodes asynchronously
      const selectedFrames = await Promise.all(
        selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
      );

      // Filter out null values and include SECTION type
      const validFrames = selectedFrames.filter((node): node is FrameNode | ComponentNode | ComponentSetNode | SectionNode => 
        node !== null && 
        (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'SECTION')
      );
      
      // Get all children of selected frames and sections
      nodesToScan = validFrames.reduce<SceneNode[]>((acc, frame) => {
        // For sections, we need to get all their child frames
        if (frame.type === 'SECTION') {
          const sectionChildren = frame.children.reduce<SceneNode[]>((children, child) => {
            if (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'COMPONENT_SET') {
              return [...children, child, ...child.findAll()];
            }
            return children;
          }, []);
          return [...acc, ...sectionChildren];
        }
        // Include the frame itself and its immediate children only
        return [...acc, frame, ...frame.children];
      }, []);
    } else {
      console.log('Scanning entire page');
      nodesToScan = figma.currentPage.findAll();
    }

    console.log(`Found ${nodesToScan.length} nodes to scan`);
    let refs: MissingReference[] = [];
    
    switch (scanType) {
      case 'vertical-gap':
        refs = await scanForVerticalGap(progress => {
          if (progressCallback) progressCallback(progress);
        }, nodesToScan);
        break;
      case 'horizontal-padding':
      case 'vertical-padding':
        refs = await scanForPadding(progress => {
          if (progressCallback) progressCallback(progress);
        }, scanType, nodesToScan);
        break;
      case 'corner-radius':
        refs = await scanForCornerRadius(progress => {
          if (progressCallback) progressCallback(progress);
        }, nodesToScan);
        break;
      case 'fill':
      case 'stroke':
        refs = await scanForColorTokens(progress => {
          if (progressCallback) progressCallback(progress);
        }, nodesToScan);
        break;
      case 'typography':
        refs = await scanForTextTokens(progress => {
          if (progressCallback) progressCallback(progress);
        }, nodesToScan);
        break;
    }

    console.log(`Scan complete. Found ${refs.length} issues`);

    // After getting the refs, check if empty and send appropriate message
    if (refs.length === 0) {
      figma.ui.postMessage({ 
        type: 'scan-complete',
        status: 'success',
        message: 'No unlinked parameters found!'
      });
    } else {
      figma.ui.postMessage({ 
        type: 'missing-references-result', 
        references: groupMissingReferences(refs) 
      });
    }
    
    return refs;
  } catch (error) {
    console.error('Error in scanForMissingReferences:', error);
    throw error;
  }
}

// Add at the top with other interfaces
interface DocumentChangeHandler {
  lastScanType?: ScanType;
  isWatching: boolean;
  timeoutId?: number;
  changeHandler?: () => void;
}

// Add this state object near the top of the file
const documentState: DocumentChangeHandler = {
  isWatching: false
};

// Update the startWatchingDocument function
async function startWatchingDocument(scanType: ScanType) {
  if (documentState.isWatching) {
    return; // Already watching
  }

  try {
    await figma.loadAllPagesAsync();
    
    documentState.isWatching = true;
    documentState.lastScanType = scanType;

    const documentChangeHandler = async () => {
      if (documentState.timeoutId) {
        clearTimeout(documentState.timeoutId);
      }

      documentState.timeoutId = setTimeout(async () => {
        if (!documentState.lastScanType) return;

        try {
          // Show scanning state in UI
          figma.ui.postMessage({ 
            type: 'watch-scan-started'
          });
          
          // Perform a new scan
          const missingRefs = await scanForMissingReferences(
            documentState.lastScanType,
            undefined,
            (progress) => {
              figma.ui.postMessage({ 
                type: 'scan-progress', 
                progress 
              });
            }
          );

          // Check if there are any missing references
          if (missingRefs.length === 0) {
            figma.ui.postMessage({ 
              type: 'scan-complete',
              status: 'success',
              message: 'No unlinked parameters found!'
            });
            // Clear previous results
            figma.ui.postMessage({
              type: 'missing-references-result',
              references: {}
            });
          } else {
            figma.ui.postMessage({
              type: 'missing-references-result',
              references: groupMissingReferences(missingRefs)
            });
          }
        } catch (err) {
          console.error('Error during watch scan:', err);
          figma.ui.postMessage({ 
            type: 'error', 
            message: 'Failed to update scan results' 
          });
        }
      }, 500); // Debounce time for document changes
    };

    // Store the handler in the state
    documentState.changeHandler = documentChangeHandler;
    figma.on('documentchange', documentChangeHandler);
   
    // Notify UI that watching has started
    figma.ui.postMessage({ 
      type: 'watch-status',
      isWatching: true 
    });
  } catch (err) {
    console.error('Failed to start document watching:', err);
    figma.ui.postMessage({ 
      type: 'error', 
      message: 'Failed to start watching document for changes' 
    });
  }
}

// Update the stopWatchingDocument function
function stopWatchingDocument() {
  documentState.isWatching = false;
  if (documentState.timeoutId) {
    clearTimeout(documentState.timeoutId);
  }
  if (documentState.changeHandler) {
    figma.off('documentchange', documentState.changeHandler);
  }
 
  // Notify UI that watching has stopped
  figma.ui.postMessage({ 
    type: 'watch-status',
    isWatching: false 
  });
}

// Update the message handler to include watch controls
figma.ui.onmessage = async (msg: PluginMessage) => {
  console.log('Plugin received message:', msg);

  if (msg.type === 'resize' && msg.width && msg.height) {
    // Ensure width and height are numbers
    const width = Number(msg.width);
    const height = Number(msg.height);
    
    if (!isNaN(width) && !isNaN(height)) {
      currentWindowSize = { width, height };
      figma.ui.resize(width, height);
      
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

      console.log('Starting scan with progress tracking');
      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: `Scanning for ${scanType}...` 
      });

      const refs = await scanForMissingReferences(
        scanType,
        msg.scanScope === 'selected-frames' ? msg.selectedFrameIds : undefined,
        (progress) => {
          console.log(`Sending progress update: ${progress}%`);
          figma.ui.postMessage({ 
            type: 'scan-progress', 
            progress 
          });
        }
      );

      if (isScanCancelled) {
        figma.ui.postMessage({ type: 'scan-cancelled' });
        return;
      }

      const groupedRefs = groupMissingReferences(refs);
      figma.ui.postMessage({ 
        type: 'missing-references-result', 
        references: groupedRefs 
      });

      // Start watching after initial scan
      startWatchingDocument(scanType);
    } catch (err) {
      console.error('Scan failed:', err);
      figma.ui.postMessage({ 
        type: 'error', 
        message: err instanceof Error ? err.message : 'Scan failed. Please try again.' 
      });
    }
  } else if (msg.type === 'start-watching') {
    await startWatchingDocument(msg.scanType as ScanType);
  } else if (msg.type === 'stop-watching') {
    stopWatchingDocument();
  }
  
  if (msg.type === 'apply-token' && msg.nodeId && msg.tokenType && msg.tokenValue) {
    const node = figma.getNodeById(msg.nodeId);
    
    if (node) {
      try {
        const variable = await figma.variables.getVariableByIdAsync(msg.tokenValue);
        if (!variable) {
          throw new Error('Variable not found');
        }

        if (msg.tokenType === 'fill' && 'fills' in node) {
          const fills = [...(node.fills as Paint[])];
          if (fills.length > 0 && fills[0].type === 'SOLID') {
          await figma.variables.setBoundVariableForPaint(
              fills[0] as SolidPaint,
            'color',
              variable
            );
            node.fills = fills;
          }
        } else if (msg.tokenType === 'stroke' && 'strokes' in node) {
          const strokes = [...(node.strokes as Paint[])];
          if (strokes.length > 0 && strokes[0].type === 'SOLID') {
          await figma.variables.setBoundVariableForPaint(
              strokes[0] as SolidPaint,
            'color',
              variable
            );
            node.strokes = strokes;
          }
        } else if (msg.tokenType === 'effect' && 'effects' in node) {
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
        figma.ui.postMessage({ type: 'success', message: `${msg.tokenType} token applied successfully` });
      } catch (error: any) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to apply token: ${error.message}` 
        });
      }
    }
  }

  if (msg.type === 'apply-style' && msg.nodeId && msg.styleType && msg.styleId) {
    const node = figma.getNodeById(msg.nodeId);
    const style = figma.getStyleById(msg.styleId);
    
    if (node && style) {
      try {
        switch (msg.styleType) {
          case 'fill':
            if ('fillStyleId' in node) {
              try {
                (node as any).fillStyleId = msg.styleId;
              } catch (err) {
                console.warn('Failed to set fillStyleId:', err);
              }
            }
            break;
          case 'stroke':
            if ('strokeStyleId' in node) {
              try {
                (node as any).strokeStyleId = msg.styleId;
              } catch (err) {
                console.warn('Failed to set strokeStyleId:', err);
              }
            }
            break;
          case 'effect':
            if ('effectStyleId' in node) {
              try {
                (node as any).effectStyleId = msg.styleId;
              } catch (err) {
                console.warn('Failed to set effectStyleId:', err);
              }
            }
            break;
          case 'text':
            if (node.type === 'TEXT') {
              try {
                node.textStyleId = msg.styleId;
              } catch (err) {
                console.warn('Failed to set textStyleId:', err);
              }
            }
            break;
        }
        figma.ui.postMessage({ type: 'success', message: `${msg.styleType} style applied successfully` });
      } catch (error) {
        figma.ui.postMessage({ 
          type: 'error', 
          message: `Failed to apply style: ${error instanceof Error ? error.message : String(error)}` 
        });
      }
    }
  }

  if (msg.type === 'swap-component' && msg.nodeId) {
    const node = figma.getNodeById(msg.nodeId);
    
    if (node && node.type === 'INSTANCE') {
      try {
        const components = figma.currentPage.findAll(n => n.type === "COMPONENT");
        
        if (components.length > 0) {
          const newInstance = (components[0] as ComponentNode).createInstance();
          if (node.parent) {
            newInstance.x = node.x;
            newInstance.y = node.y;
            newInstance.resize(node.width, node.height);
            node.parent.insertChild(node.parent.children.indexOf(node), newInstance);
            node.remove();
          }
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
    try {
      // Check if nodeIds exists and is an array
      if (!msg.nodeIds || !Array.isArray(msg.nodeIds)) {
        throw new Error('Invalid node IDs provided');
      }

      // Fetch nodes asynchronously
      const nodes = await Promise.all(
        msg.nodeIds.map(id => figma.getNodeByIdAsync(id))
      );
      
      // Filter out null values and ensure nodes are SceneNodes
      const validNodes = nodes.filter((node): node is SceneNode => 
        node !== null && 'type' in node && node.type !== 'DOCUMENT'
      );

      if (validNodes.length > 0) {
        figma.currentPage.selection = validNodes;
        // Optionally scroll to show the selected nodes
        figma.viewport.scrollAndZoomIntoView(validNodes);
        // Notify UI that selection is complete
        figma.ui.postMessage({ type: 'selection-complete' });
      } else {
        throw new Error('No valid nodes found to select');
      }
    } catch (err) {
      console.error('Error in select-group:', err);
      figma.ui.postMessage({ 
        type: 'error', 
        message: err instanceof Error ? err.message : 'Failed to select nodes' 
      });
    }
  }

  if (msg.type === 'get-selected-frame-ids') {
    const selection = figma.currentPage.selection;
    const validSelection = selection.filter(node => 
      node.type === 'FRAME' || 
      node.type === 'COMPONENT' || 
      node.type === 'COMPONENT_SET' || 
      node.type === 'SECTION'
    );
    figma.ui.postMessage({
      type: 'selected-frame-ids',
      ids: validSelection.map(node => node.id)
    });
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
  progressCallback: (progress: number) => void,
  nodesToScan: SceneNode[]
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Filter nodes with vertical auto-layout from the provided nodes
    const nodes = nodesToScan.filter(node => 
      hasAutoLayout(node) && node.layoutMode === 'VERTICAL'
    );
    
    console.log(`Found ${nodes.length} nodes with vertical auto-layout`);

    // Process nodes with progress updates
    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as FrameNode;
      
      // Check if itemSpacing is not bound to a variable and is greater than 0
      if (node.itemSpacing > 0 && !node.boundVariables?.itemSpacing) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'vertical-gap',
          property: 'itemSpacing',
          currentValue: node.itemSpacing,
          location: 'Vertical Gap'
        });
      }

      // Calculate and report progress
      const progress = ((i + 1) / nodes.length) * 100;
      progressCallback(progress);

      // Add a small delay to prevent UI freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for vertical gaps:', err);
  }
  
  return missingRefs;
}

async function scanForPadding(
  progressCallback: (progress: number) => void,
  type: 'horizontal-padding' | 'vertical-padding',
  nodesToScan?: SceneNode[]
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = (nodesToScan || figma.currentPage.findAll()).filter(hasAutoLayout);
    console.log(`Found ${nodes.length} nodes with auto-layout`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as FrameNode;
      const boundVars = node.boundVariables || {};

      if (type === 'horizontal-padding') {
        if (node.paddingLeft > 0 && !boundVars.paddingLeft) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'horizontal-padding',
            property: 'paddingLeft',
            currentValue: node.paddingLeft,
            location: 'Left Padding'
          });
        }
        if (node.paddingRight > 0 && !boundVars.paddingRight) {
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
        if (node.paddingTop > 0 && !boundVars.paddingTop) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'vertical-padding',
            property: 'paddingTop',
            currentValue: node.paddingTop,
            location: 'Top Padding'
          });
        }
        if (node.paddingBottom > 0 && !boundVars.paddingBottom) {
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

      // Calculate and report progress
      const progress = ((i + 1) / nodes.length) * 100;
      progressCallback(progress);

      // Add a small delay to prevent UI freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for padding:', err);
  }
  
  return missingRefs;
}

async function scanForCornerRadius(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[]
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Update the type check for cornerRadius
    const nodes = (nodesToScan || figma.currentPage.findAll()).filter(node => {
      if ('cornerRadius' in node) {
        const radius = (node as any).cornerRadius;
        return typeof radius === 'number' && radius > 0;
      }
      return false;
    });
    
    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as SceneNode & { cornerRadius: number };
      const boundVars = (node as any).boundVariables || {};
      
      if (!boundVars.cornerRadius) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'corner-radius',
          property: 'cornerRadius',
          currentValue: node.cornerRadius,
          location: 'Shape'
        });
      }

      const progress = ((i + 1) / nodes.length) * 100;
      progressCallback(progress);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for corner radius:', err);
  }
  
  return missingRefs;
}

