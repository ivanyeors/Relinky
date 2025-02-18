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
  position: { x: 100, y: 100 },
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
type ScanType = 'inactive-tokens' | 'vertical-gap' | 'horizontal-padding' | 'vertical-padding' | 'corner-radius' | 'fill' | 'stroke' | 'typography';

interface ScanProgress {
  type: ScanType;
  progress: number;
}

// Add a flag to track if scanning should be cancelled
let isScanCancelled = false;

// Add interface for variable binding types based on Figma API
interface VariableAlias {
  type: "VARIABLE_ALIAS";
  id: string;
}

interface VariableBinding {
  type: "VARIABLE";
  id: string;
}

type FillBinding = VariableAlias | VariableBinding | VariableAlias[];

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

// Update helper function to properly check if a node is truly visible
function isNodeVisible(node: BaseNode): boolean {
  try {
    // Check if the node itself has a visible property
    if ('visible' in node && !(node as SceneNode).visible) {
      return false;
    }

    // Check if node is inside a collapsed group
    // A node in a collapsed group is effectively hidden
    let current: BaseNode | null = node;
    while (current && current.parent) {
      if (current.parent.type === 'GROUP') {
        const parentGroup = current.parent as GroupNode;
        // If any parent group is collapsed, the node is not visible
        if (!parentGroup.expanded) {
          return false;
        }
      }
      
      // Check parent visibility
      if ('visible' in current.parent && !(current.parent as SceneNode).visible) {
        return false;
      }
      
      current = current.parent;
    }

    return true;
  } catch (err) {
    console.warn('Error checking node visibility:', err);
    // Default to visible if there's an error
    return true;
  }
}

// Add helper to check if a node should be included in scan
function shouldIncludeNode(node: BaseNode, ignoreHiddenLayers: boolean): boolean {
  // If we're not ignoring hidden layers, include all nodes
  if (!ignoreHiddenLayers) {
    return true;
  }

  // Check visibility status
  return isNodeVisible(node);
}

// Update scanForTextTokens to respect hidden layers setting
async function scanForTextTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false // Add parameter
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Use type guard to ensure we only get TextNodes
    const textNodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => {
        if (node.type !== 'TEXT') return false;
        
        // Check visibility if ignoreHiddenLayers is true
        if (ignoreHiddenLayers && !isNodeVisible(node)) {
          return false;
        }
        
        return true;
      }) as TextNode[];
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

// Update scanForColorTokens to respect hidden layers setting
async function scanForColorTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false // Add parameter
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = (nodesToScan || figma.currentPage.findAll()).filter(node => {
      if (!node || node.removed) return false;
      
      // Check visibility if ignoreHiddenLayers is true
      if (ignoreHiddenLayers && !isNodeVisible(node)) {
        return false;
      }
      
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
              // Only add if there's no variable binding for this fill
              if (fill.type === 'SOLID' && 
                  (!node.boundVariables?.fills?.[index] || 
                   !node.boundVariables?.fills?.[index]?.type)) {
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
              // Only add if there's no variable binding for this stroke
              if (stroke.type === 'SOLID' && 
                  (!node.boundVariables?.strokes?.[index] || 
                   !node.boundVariables?.strokes?.[index]?.type)) {
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
  scanEntirePage?: boolean;
  isRescan?: boolean;
  ignoreHiddenLayers?: boolean;
}

// Add these at the top with other state variables
let lastSelectedFrameIds: string[] = [];
let initialScanSelection: string[] = []; // Store initial selection when first scan is clicked

// Update the selection change handler
figma.on('selectionchange', async () => {
  const selection = figma.currentPage.selection;
  
  // Check for instances in selection
  const hasInstances = selection.some(node => node.type === 'INSTANCE');
  
  const validSelection = selection.filter(node => 
    node.type === 'FRAME' || 
    node.type === 'COMPONENT' || 
    node.type === 'COMPONENT_SET' || 
    node.type === 'SECTION'
  );
  
  // Only update lastSelectedFrameIds if we have a valid selection
  if (validSelection.length > 0) {
    lastSelectedFrameIds = validSelection.map(node => node.id);
  }
  
  // Send more detailed selection info to UI
  figma.ui.postMessage({ 
    type: 'selection-updated',
    hasSelection: validSelection.length > 0,
    count: validSelection.length,
    selectedFrameIds: validSelection.map(node => node.id),
    hasInstances // Add this flag
  });
});

// Update scanForMissingReferences to pass the ignoreHiddenLayers setting
async function scanForMissingReferences(
  scanType: ScanType,
  selectedFrameIds?: string[],
  progressCallback?: (progress: number) => void,
  ignoreHiddenLayers: boolean = false // Add parameter
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
        (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'SECTION') &&
        shouldIncludeNode(node, ignoreHiddenLayers)
      );
      
      // Get all children of selected frames and sections
      nodesToScan = validFrames.reduce<SceneNode[]>((acc, frame) => {
        // For sections, we need to get all their child frames
        if (frame.type === 'SECTION') {
          const sectionChildren = frame.children.reduce<SceneNode[]>((children, child) => {
            if (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'COMPONENT_SET') {
              if (shouldIncludeNode(child, ignoreHiddenLayers)) {
                // Only include visible children if ignoreHiddenLayers is true
                const visibleDescendants = child.findAll(n => shouldIncludeNode(n, ignoreHiddenLayers));
                return [...children, child, ...visibleDescendants];
              }
            }
            return children;
          }, []);
          return [...acc, ...sectionChildren];
        }
        // Include the frame itself and all its visible descendants
        if (shouldIncludeNode(frame, ignoreHiddenLayers)) {
          const visibleDescendants = frame.findAll(n => shouldIncludeNode(n, ignoreHiddenLayers));
          return [...acc, frame, ...visibleDescendants];
        }
        return acc;
      }, []);
    } else {
      console.log('Scanning entire page');
      nodesToScan = figma.currentPage.findAll(n => shouldIncludeNode(n, ignoreHiddenLayers));
    }

    console.log(`Found ${nodesToScan.length} nodes to scan (ignoreHiddenLayers: ${ignoreHiddenLayers})`);
    let refs: MissingReference[] = [];
    
    switch (scanType) {
      case 'inactive-tokens':
        refs = await scanForInactiveTokens(progress => {
          if (progressCallback) progressCallback(progress);
        }, nodesToScan);
        break;
      case 'vertical-gap':
        refs = await scanForVerticalGap(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
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
        refs = await scanForColorTokens(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'typography':
        refs = await scanForTextTokens(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
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
      const groupedRefs = groupMissingReferences(refs);
      figma.ui.postMessage({ 
        type: 'missing-references-result', 
        scanType: scanType,
        references: groupedRefs 
      });
    }
    
    return refs;
  } catch (err) {
    console.error('Error in scanForMissingReferences:', err);
    return [];
  }
}

// Add this interface near the top with other interfaces
interface DocumentChangeHandler {
  lastScanType?: ScanType;
  isWatching: boolean;
  timeoutId?: ReturnType<typeof setTimeout>; // Fix for the setTimeout type error
  changeHandler?: () => void;
  scanEntirePage?: boolean;
  selectedFrameIds?: string[];
}

// Add this state object near the top of the file
const documentState: DocumentChangeHandler = {
  isWatching: false
};

// Update the startWatchingDocument function
async function startWatchingDocument(scanType: ScanType, scanEntirePage: boolean = false) {
  if (documentState.isWatching) {
    return; // Already watching
  }

  try {
    await figma.loadAllPagesAsync();
    
    documentState.isWatching = true;
    documentState.lastScanType = scanType;
    documentState.scanEntirePage = scanEntirePage;
    
    // If not scanning entire page, store the current selection
    if (!scanEntirePage) {
      const selection = figma.currentPage.selection;
      documentState.selectedFrameIds = selection
        .filter(node => 
          node.type === 'FRAME' || 
          node.type === 'COMPONENT' || 
          node.type === 'COMPONENT_SET' || 
          node.type === 'SECTION'
        )
        .map(node => node.id);
    }

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
          
          // Clear previous results before new scan
          figma.ui.postMessage({
            type: 'clear-results'
          });
          
          // Perform a new scan
          const missingRefs = await scanForMissingReferences(
            documentState.lastScanType,
            documentState.scanEntirePage ? undefined : documentState.selectedFrameIds,
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
      }, 1000); // Increase debounce time to reduce unnecessary scans
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

  if (msg.type === 'resize') {
    // Validate dimensions
    const width = Math.min(Math.max(msg.width || 300, 300), 800);
    const height = Math.min(Math.max(msg.height || 400, 400), 900);
    
    // Use figma.ui.resize instead of figma.window.resizeTo
    figma.ui.resize(width, height);

    // Optionally save the size preference
    try {
      await figma.clientStorage.setAsync('windowSize', { width, height });
    } catch (err) {
      console.error('Failed to save window size:', err);
    }
  }
  
  if (msg.type === 'stop-scan') {
    console.log('Received stop scan request');
    isScanCancelled = true;
    
    // Notify UI that scan was cancelled
    figma.ui.postMessage({ 
      type: 'scan-cancelled'
    });
    return;
  }

  if (msg.type === 'scan-for-tokens') {
    try {
      isScanCancelled = false;
      const scanType = msg.scanType as ScanType;
      const isRescan = msg.isRescan || false;

      console.log('Starting scan with progress tracking');
      console.log('Scan scope:', msg.scanScope);
      console.log('Selected frame IDs:', msg.selectedFrameIds);
      console.log('Scan entire page:', msg.scanEntirePage);
      console.log('Is rescan:', isRescan);

      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: `Scanning for ${scanType}...`
      });

      // If it's not scanning entire page, handle selection
      if (!msg.scanEntirePage) {
        let frameIdsToUse: string[];
        
        if (isRescan) {
          // Use initial selection for rescan
          frameIdsToUse = initialScanSelection;
          
          // Reselect the initial frames
          const framesToSelect = await Promise.all(
            frameIdsToUse.map(id => figma.getNodeByIdAsync(id))
          );
          
          // Filter out any null values and ensure they're valid frame types
          const validFrames = framesToSelect.filter((node): node is FrameNode | ComponentNode | ComponentSetNode | SectionNode => 
            node !== null && 
            (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'SECTION')
          );
          
          // Update the selection
          figma.currentPage.selection = validFrames;
        } else {
          // This is the initial scan - store the selection
          frameIdsToUse = Array.isArray(msg.selectedFrameIds) ? msg.selectedFrameIds : [];
          initialScanSelection = frameIdsToUse; // Store initial selection
        }

        // Perform the scan with the appropriate frame IDs
        const refs = await scanForMissingReferences(
          scanType,
          frameIdsToUse,
          (progress) => {
            if (isScanCancelled) return;
            console.log(`Sending progress update: ${progress}%`);
            figma.ui.postMessage({ 
              type: 'scan-progress', 
              progress
            });
          },
          msg.ignoreHiddenLayers || false
        );

        // Check if scan was cancelled before sending results
        if (isScanCancelled) {
          figma.ui.postMessage({ type: 'scan-cancelled' });
          return;
        }

        const groupedRefs = groupMissingReferences(refs);
        figma.ui.postMessage({ 
          type: 'missing-references-result', 
          scanType: scanType,
          references: groupedRefs 
        });
      } else {
        // Reset stored selections when scanning entire page
        lastSelectedFrameIds = [];
        initialScanSelection = [];
        
        // Perform scan for entire page as before
        const refs = await scanForMissingReferences(
          scanType,
          undefined,
          (progress) => {
            if (isScanCancelled) return;
            console.log(`Sending progress update: ${progress}%`);
            figma.ui.postMessage({ 
              type: 'scan-progress', 
              progress
            });
          },
          msg.ignoreHiddenLayers || false
        );

        // Rest of the existing code...
      }
    } catch (err) {
      console.error('Scan failed:', err);
      figma.ui.postMessage({ 
        type: 'error', 
        message: err instanceof Error ? err.message : 'Scan failed. Please try again.' 
      });
    }
  } else if (msg.type === 'start-watching') {
    await startWatchingDocument(msg.scanType as ScanType, msg.scanEntirePage ?? false);
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
    
    // Send both the IDs and the count
    figma.ui.postMessage({
      type: 'selected-frame-ids',
      ids: validSelection.map(node => node.id),
      count: validSelection.length
    });
  }

  if (msg.type === 'list-variables') {
    await listAllVariables();
  }

  // Handle resize messages
  if (msg.type === 'resize') {
    if (typeof msg.width === 'number' && typeof msg.height === 'number') {
      figma.ui.resize(msg.width, msg.height);
    }
  }

  if (msg.type === 'scan-library-tokens') {
    try {
      const results = await scanForLibraryTokens(msg.scanType);
      figma.ui.postMessage({
        type: 'library-tokens-result',
        activeTokens: results.activeLibraryTokens,
        inactiveTokens: results.inactiveLibraryTokens,
        scanType: msg.scanType
      });
    } catch (err) {
      console.error('Error in scan-library-tokens:', err);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to scan library tokens'
      });
    }
  }

  if (msg.type === 'pause-library-scan') {
    console.log('Pausing scan...');
    isScanPaused = true;
    figma.ui.postMessage({ type: 'library-scan-paused' });
  }

  if (msg.type === 'resume-library-scan') {
    console.log('Resuming scan...');
    isScanPaused = false;
    figma.ui.postMessage({ type: 'library-scan-resumed' });
  }

  if (msg.type === 'stop-library-scan') {
    console.log('Stopping scan...');
    isScanStopped = true;
    isScanPaused = false;
    figma.ui.postMessage({ type: 'library-scan-stopped' });
  }
};

// At the start of the file, after the UI setup
let currentWindowSize = {
  width: 400,
  height: 600
};

// Initialize window size from saved preferences
(async function initializeWindowSize() {
  try {
    const savedSize = await figma.clientStorage.getAsync('windowSize');
    if (savedSize) {
      // Use figma.ui.resize instead of figma.window.resizeTo
      figma.ui.resize(savedSize.width, savedSize.height);
    }
  } catch (err) {
    console.error('Failed to restore window size:', err);
  }
})();

async function scanForVerticalGap(
  progressCallback: (progress: number) => void,
  nodesToScan: SceneNode[],
  ignoreHiddenLayers: boolean = false // Add parameter
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = nodesToScan.filter(node => {
      if (!hasAutoLayout(node) || node.layoutMode !== 'VERTICAL') {
        return false;
      }
      
      // Check visibility if ignoreHiddenLayers is true
      if (ignoreHiddenLayers && !isNodeVisible(node)) {
        return false;
      }
      
      return node.itemSpacing > 0 && !node.boundVariables?.itemSpacing;
    });
    
    console.log(`Found ${nodes.length} nodes with unlinked vertical auto-layout`);

    // Process nodes with progress updates
    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as FrameNode;
      
      missingRefs.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'vertical-gap',
        property: 'itemSpacing',
        currentValue: node.itemSpacing,
        location: 'Vertical Gap'
      });

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

// Single interface for libraries that matches Figma's API
interface Library {
  key: string;
  name: string;
  enabled: boolean;
  type: 'REMOTE' | 'LOCAL';
}

// Add interfaces for better token handling
interface TokenVariable {
  variableId: string;
  variableName: string;
  variableKey: string;
  variableType: VariableResolvedDataType;  // Use Figma's built-in type
  isRemote: boolean;
  libraryName?: string;
  libraryKey?: string;
  isEnabled?: boolean;
}

interface TokenGroup {
  name: string;
  variables: TokenVariable[];
  isEnabled: boolean;
  libraryName?: string;
}

// Update the scanning function with proper types
async function scanForInactiveTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[]
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  const tokenGroups: Record<string, TokenGroup> = {};
  
  try {
    const allVariables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    // Map collections with proper Library type
    const libraryMap = new Map(
      collections.map(collection => [collection.key, {
        key: collection.key,
        name: collection.name,
        enabled: collection.remote,
        type: collection.remote ? 'REMOTE' : 'LOCAL'
      } as Library])
    );

    // Process variables
    for (const variable of allVariables) {
      if (variable.remote) {
        const libraryKey = variable.key.split(':')[0];
        const library = libraryMap.get(libraryKey);
        
        const groupKey = library ? library.name : 'Unknown Library';
        if (!tokenGroups[groupKey]) {
          tokenGroups[groupKey] = {
            name: groupKey,
            variables: [],
            isEnabled: !!library?.enabled,
            libraryName: library?.name
          };
        }

        tokenGroups[groupKey].variables.push({
          variableId: variable.id,
          variableName: variable.name,
          variableKey: variable.key,
          variableType: variable.resolvedType,
          isRemote: variable.remote,
          libraryName: library?.name,
          libraryKey,
          isEnabled: library?.enabled
        });
      }
    }

    // Now scan nodes for variables
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => hasVariableBindings(node));
    
    console.log('Found nodes with variables:', nodes.length);

    for (const node of nodes) {
      if (isScanCancelled) break;

      try {
        if (!node.boundVariables) continue;

        for (const [key, binding] of Object.entries(node.boundVariables)) {
          if (binding && typeof binding === 'object' && 'type' in binding && binding.type === 'VARIABLE') {
            try {
              const variable = await figma.variables.getVariableByIdAsync(binding.id);
              
              if (variable?.remote) {
                const libraryKey = variable.key.split(':')[0];
                const library = libraryMap.get(libraryKey);
                const groupKey = library?.name || 'Unknown Library';
                const group = tokenGroups[groupKey];

                if (!library?.enabled) {
                  missingRefs.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    type: 'inactive-tokens',
                    property: key,
                    currentValue: {
                      variableName: variable.name,
                      libraryName: library?.name || 'Unknown Library',
                      libraryKey,
                      groupName: groupKey,
                      totalGroupVariables: group?.variables.length || 0
                    },
                    location: 'Inactive Library Token',
                    variableName: variable.name,
                    preview: `${groupKey} (${group?.variables.length || 0} tokens)`
                  });
                }
              }
            } catch (err) {
              // Handle inaccessible variables
              const groupKey = 'Inaccessible Libraries';
              if (!tokenGroups[groupKey]) {
                tokenGroups[groupKey] = {
                  name: groupKey,
                  variables: [],
                  isEnabled: false
                };
              }

              missingRefs.push({
                nodeId: node.id,
                nodeName: node.name,
                type: 'inactive-tokens',
                property: key,
                currentValue: {
                  bindingId: binding.id,
                  groupName: groupKey
                },
                location: 'Inaccessible Library Token',
                variableName: 'Unknown Variable',
                preview: `${groupKey}`
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Error processing node ${node.name}:`, err);
      }

      progressCallback(Math.round((nodes.indexOf(node) + 1) / nodes.length * 100));
    }

    console.log('Scan complete. Groups:', tokenGroups);
    console.log('Found missing refs:', missingRefs.length);
  } catch (err) {
    console.error('Error scanning for inactive tokens:', err);
  }
  
  return missingRefs;
}

async function scanForFillVariables(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[]
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => hasFills(node));
    
    console.log('Found nodes with fills:', nodes.length);

    const allVariables = await figma.variables.getLocalVariablesAsync();
    console.log('Found variables:', allVariables.length);

    for (const node of nodes) {
      try {
        if (node.boundVariables) {
          console.log('Node bound variables:', {
            nodeName: node.name,
            boundVars: node.boundVariables
          });

          const fillBindings = node.boundVariables['fills'] as FillBinding;
          
          if (Array.isArray(fillBindings)) {
            // Handle array of variable bindings
            for (const binding of fillBindings) {
              if (binding.type === 'VARIABLE_ALIAS') {
                // Cast binding to VariableAlias type and access id
                const variableBinding = binding as VariableAlias;
                const variable = await figma.variables.getVariableByIdAsync(variableBinding.id);
                console.log('Found variable:', variable);

                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: 'fill-variable',
                  property: 'fills',
                  currentValue: {
                    variableId: variableBinding.id,
                    variableName: variable?.name || 'Unknown',
                    variableType: variable?.resolvedType || 'Unknown',
                    isRemote: variable?.remote || false
                  },
                  location: 'Fill Color Variable',
                  variableName: variable?.name || 'Unknown Variable',
                  preview: `Variable: ${variable?.name || 'Unknown'}`
                });
              }
            }
          } else if (fillBindings?.type === 'VARIABLE_ALIAS') {
            // Handle single variable binding
            const variable = await figma.variables.getVariableByIdAsync(fillBindings.id);
            console.log('Found variable:', variable);
            
            missingRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              type: 'fill-variable',
              property: 'fills',
              currentValue: {
                variableId: fillBindings.id,
                variableName: variable?.name || 'Unknown',
                variableType: variable?.resolvedType || 'Unknown',
                isRemote: variable?.remote || false
              },
              location: 'Fill Color Variable',
              variableName: variable?.name || 'Unknown Variable',
              preview: `Variable: ${variable?.name || 'Unknown'}`
            });
          }
        }
      } catch (err) {
        console.warn(`Error processing node ${node.name}:`, err);
      }

      progressCallback(Math.round((nodes.indexOf(node) + 1) / nodes.length * 100));
    }

    console.log('Fill variables scan complete. Found:', missingRefs.length);
    console.log('Details:', missingRefs);

  } catch (err) {
    console.error('Error scanning for fill variables:', err);
  }
  
  return missingRefs;
}

async function listAllVariables() {
  try {
    const localVariables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    // Convert collections to Library type with all required properties
    const libraries: Library[] = collections.map(collection => ({
      key: collection.key,
      name: collection.name,
      enabled: collection.remote,
      type: collection.remote ? 'REMOTE' : 'LOCAL' // Add required type property
    }));

    // Prepare analysis data
    const analysisData = {
      totalVariables: localVariables.length,
      libraryVariables: localVariables.filter(v => v.remote).length,
      localVariables: localVariables.filter(v => !v.remote).length,
      libraries: libraries.map(lib => ({
        key: lib.key,
        name: lib.name,
        enabled: lib.enabled,
        type: lib.type,
        variableCount: localVariables.filter(v => v.remote && v.key.startsWith(lib.key)).length
      }))
    };

    // Find nodes with variable bindings
    const nodesWithVariables = figma.currentPage.findAll(node => {
      return 'boundVariables' in node && node.boundVariables !== null;
    });

    console.log('Nodes with variables:', nodesWithVariables.length);
    console.log('Analysis data:', analysisData);

    // Send analysis data to UI
    figma.ui.postMessage({
      type: 'variables-analysis',
      data: analysisData
    });

  } catch (err) {
    console.error('Error listing variables:', err);
    figma.ui.postMessage({
      type: 'variables-analysis-error',
      message: 'Failed to analyze variables'
    });
  }
}

// Add new interfaces
interface LibraryToken {
  id: string;
  name: string;
  key: string;
  type: VariableResolvedDataType;
  libraryName: string;
  isActive: boolean;
  value?: any;
  collection?: {
    name: string;
    id: string;
  };
  sourceType: 'REMOTE' | 'LOCAL';
  subscribedID: string;
  usages: Array<{
    nodeId: string;
    nodeName: string;
    property: string;
    mode: string;
  }>;
}

interface TokenScanResult {
  activeLibraryTokens: LibraryToken[];
  inactiveLibraryTokens: LibraryToken[];
}

// Add separate interface for library token scan options
interface LibraryTokenScanOption {
  value: string;
  label: string;
  description: string;
  icon: string;
}

// Add library token scan options (for "Unlinked Tokens" page)
const LIBRARY_TOKEN_SCAN_OPTIONS: LibraryTokenScanOption[] = [
  {
    value: 'all',
    label: 'All Library Tokens',
    description: 'Find all tokens from inactive libraries',
    icon: 'tokens'
  },
  {
    value: 'colors',
    label: 'Color Tokens',
    description: 'Find color tokens from inactive libraries',
    icon: 'fill'
  },
  {
    value: 'typography',
    label: 'Typography Tokens',
    description: 'Find typography tokens from inactive libraries',
    icon: 'typography'
  },
  {
    value: 'spacing',
    label: 'Spacing Tokens',
    description: 'Find spacing tokens from inactive libraries',
    icon: 'spacing'
  }
];

interface PublishedVariable {
  id: string;
  subscribedId: string;
  name: string;
  key: string;
  resolvedType: VariableResolvedDataType;
  description?: string;
  remote: boolean;
  libraryName: string;
  isPublished: boolean;
}

// Add scan control state
let isScanPaused = false;
let isScanStopped = false;

async function scanForLibraryTokens(scanType: string = 'all'): Promise<TokenScanResult> {
  // Reset control flags at start
  isScanPaused = false;
  isScanStopped = false;

  const result: TokenScanResult = {
    activeLibraryTokens: [],
    inactiveLibraryTokens: []
  };

  try {
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Find nodes using variables
    const nodesWithVariables = figma.currentPage.findAll(node => {
      return ('boundVariables' in node && node.boundVariables !== null) ||
             ('resolvedVariableModes' in node && node.resolvedVariableModes !== null);
    });

    // Track processed variables
    const processedVariables = new Map<string, PublishedVariable>();

    console.log('Initial scan:', {
      variables: variables.length,
      collections: collections.length,
      nodesWithVariables: nodesWithVariables.length
    });

    // Process nodes
    for (const node of nodesWithVariables) {
      // Check for stop
      if (isScanStopped) {
        figma.ui.postMessage({ type: 'library-scan-stopped' });
        return result;
      }

      // Check for pause
      while (isScanPaused && !isScanStopped) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      try {
        // Check resolved modes first (includes inherited modes)
        if ('resolvedVariableModes' in node && node.resolvedVariableModes) {
          const resolvedModes = node.resolvedVariableModes;
          
          // Process each variable reference
          for (const [variableRef, modeInfo] of Object.entries(resolvedModes)) {
            // Parse the variable reference
            const matches = variableRef.match(/VariableCollectionId:([^/]+)\/(\d+):(\d+)/);
            if (matches) {
              const [_, collectionId, variableId, variableSubId] = matches;
              const [modeId, aliasId] = modeInfo.split(':');

              console.log('Variable Usage:', {
                collectionId,
                variableId: `${variableId}:${variableSubId}`,
                modeId,
                aliasId,
                nodeName: node.name,
                nodeType: node.type
              });
            }
          }
        }

        // Then check explicit bindings
        if (node.boundVariables) {
          for (const [property, binding] of Object.entries(node.boundVariables)) {
            if (!binding || typeof binding !== 'object' || !('type' in binding)) continue;

            if (binding.type === 'VARIABLE_ALIAS') {
              const variableBinding = binding as VariableAlias;
              const variable = await figma.variables.getVariableByIdAsync(variableBinding.id);
              if (!variable) continue;

              const collection = collections.find(c => c.id === variable.variableCollectionId);
              if (!collection) continue;

              // Check if variable is from a published library
              const isPublished = variable.remote && variable.key.includes(':');
              const [libraryKey] = variable.key.split(':');

              // Check if library is active
              let isActive = false;
              try {
                await figma.variables.importVariableByKeyAsync(variable.key);
                isActive = true;
              } catch {
                isActive = false;
              }

              // Get current mode value
              const modeId = Object.keys(variable.valuesByMode)[0];
              const currentValue = variable.valuesByMode[modeId];

              const token: LibraryToken = {
                id: variable.id,
                name: variable.name,
                key: variable.key,
                type: variable.resolvedType,
                libraryName: collection.name,
                isActive,
                value: currentValue,
                collection: {
                  name: collection.name,
                  id: collection.id
                },
                sourceType: 'REMOTE',
                subscribedID: libraryKey,
                usages: [{
                  nodeId: node.id,
                  nodeName: node.name,
                  property,
                  mode: modeId
                }]
              };

              if (isActive) {
                result.activeLibraryTokens.push(token);
              } else {
                result.inactiveLibraryTokens.push(token);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Error processing node:', err);
      }

      // Update progress
      figma.ui.postMessage({
        type: 'library-scan-progress',
        progress: Math.round((nodesWithVariables.indexOf(node) + 1) / nodesWithVariables.length * 100),
        currentNode: {
          name: node.name,
          type: node.type,
          processedCount: nodesWithVariables.indexOf(node) + 1,
          totalCount: nodesWithVariables.length
        }
      });
    }

    console.log('Scan Results:', {
      processedVariables: processedVariables.size,
      publishedVariables: Array.from(processedVariables.values()).filter(v => v.isPublished).length,
      activeTokens: result.activeLibraryTokens.length,
      inactiveTokens: result.inactiveLibraryTokens.length,
      activeLibraries: new Set(result.activeLibraryTokens.map(t => t.subscribedID)).size,
      inactiveLibraries: new Set(result.inactiveLibraryTokens.map(t => t.subscribedID)).size
    });

    // Only send completion if not stopped
    if (!isScanStopped) {
      figma.ui.postMessage({
        type: 'library-scan-complete',
        summary: {
          totalNodes: nodesWithVariables.length,
          totalTokens: result.activeLibraryTokens.length + result.inactiveLibraryTokens.length
        }
      });
    }

  } catch (err) {
    console.error('Error scanning library tokens:', err);
    figma.ui.postMessage({
      type: 'error',
      message: 'Failed to scan library tokens'
    });
  }

  return result;
}

// Update progress handling
function updateProgress(progress: number) {
  figma.ui.postMessage({
    type: 'scan-progress',
    progress: Math.max(0, Math.min(100, progress)),
    isScanning: true
  });
}

// Reset progress
function resetProgress() {
  figma.ui.postMessage({
    type: 'scan-progress',
    progress: 0,
    isScanning: false
  });
}

// Complete progress
function completeProgress() {
  figma.ui.postMessage({
    type: 'scan-progress',
    progress: 100,
    isScanning: false
  });
}

