// Main entry point for the Relinky plugin
// Handles initialization, UI events, and plugin lifecycle

import * as scanners from './scanners';
import { ScanType, MissingReference, updateProgress, resetProgress, completeProgress, createThrottledProgress } from './common';
import { unlinkVariable, unlinkGroupVariables } from './actions/unbind-node-variables';
import { scanForDeletedVariables } from './scanners/broken-variable-references';

// Clear previous logs
console.clear();
console.log('Plugin code started');

// State variables
let lastSelectedFrameIds: string[] = [];
let initialScanSelection: string[] = []; // Store initial selection when first scan is clicked
let currentWindowSize = {
  width: 400,
  height: 600
};

// Document state type definition
interface DocumentState {
  isWatching: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
  lastScanType?: ScanType;
  scanEntirePage?: boolean;
  selectedFrameIds?: string[];
  ignoreHiddenLayers?: boolean;
  changeHandler?: () => void;
}

// Document state for watching changes
const documentState: DocumentState = {
  isWatching: false
};

// Show UI with default settings
figma.showUI(__html__, { 
  width: 400, 
  height: 600,
  themeColors: true,
  position: { x: 100, y: 100 },
  title: "Relinky"
});

// Initialize selection state
(() => {
  const selection = figma.currentPage.selection;
  const hasInstances = selection.some(node => node.type === 'INSTANCE');
  const validSelection = selection.filter(node => 
    // Support ALL SceneNode types that can be meaningfully scanned
    node.type === 'FRAME' || 
    node.type === 'COMPONENT' || 
    node.type === 'COMPONENT_SET' || 
    node.type === 'INSTANCE' ||
    node.type === 'GROUP' ||
    node.type === 'SECTION' ||
    node.type === 'RECTANGLE' ||
    node.type === 'ELLIPSE' ||
    node.type === 'POLYGON' ||
    node.type === 'STAR' ||
    node.type === 'VECTOR' ||
    node.type === 'LINE' ||
    node.type === 'TEXT' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'SLICE' ||
    node.type === 'CONNECTOR' ||
    node.type === 'WIDGET' ||
    node.type === 'EMBED' ||
    node.type === 'LINK_UNFURL' ||
    node.type === 'MEDIA' ||
    node.type === 'STICKY' ||
    node.type === 'SHAPE_WITH_TEXT' ||
    node.type === 'CODE_BLOCK'
  );
  
  // Update lastSelectedFrameIds
  if (validSelection.length > 0) {
    lastSelectedFrameIds = validSelection.map(node => node.id);
  }
  
  // Send initial selection info to UI
  figma.ui.postMessage({ 
    type: 'selection-update',
    hasSelection: validSelection.length > 0,
    count: validSelection.length,
    selectedFrameIds: validSelection.map(node => node.id),
    hasInstances
  });
})();

// Initialize window size from saved preferences
(async function initializeWindowSize() {
  try {
    const savedSize = await figma.clientStorage.getAsync('windowSize');
    if (savedSize) {
      figma.ui.resize(savedSize.width, savedSize.height);
    }
  } catch (err) {
    console.error('Failed to restore window size:', err);
  }
})();

// Update the selection change handler
figma.on('selectionchange', async () => {
  const selection = figma.currentPage.selection;
  
  // Check for instances in selection
  const hasInstances = selection.some(node => node.type === 'INSTANCE');
  
  const validSelection = selection.filter(node => 
    // Support ALL SceneNode types that can be meaningfully scanned
    node.type === 'FRAME' || 
    node.type === 'COMPONENT' || 
    node.type === 'COMPONENT_SET' || 
    node.type === 'INSTANCE' ||
    node.type === 'GROUP' ||
    node.type === 'SECTION' ||
    node.type === 'RECTANGLE' ||
    node.type === 'ELLIPSE' ||
    node.type === 'POLYGON' ||
    node.type === 'STAR' ||
    node.type === 'VECTOR' ||
    node.type === 'LINE' ||
    node.type === 'TEXT' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'SLICE' ||
    node.type === 'CONNECTOR' ||
    node.type === 'WIDGET' ||
    node.type === 'EMBED' ||
    node.type === 'LINK_UNFURL' ||
    node.type === 'MEDIA' ||
    node.type === 'STICKY' ||
    node.type === 'SHAPE_WITH_TEXT' ||
    node.type === 'CODE_BLOCK'
  );
  
  // Only update lastSelectedFrameIds if we have a valid selection
  if (validSelection.length > 0) {
    lastSelectedFrameIds = validSelection.map(node => node.id);
  }
  
  // Send more detailed selection info to UI
  figma.ui.postMessage({ 
    type: 'selection-update',
    hasSelection: validSelection.length > 0,
    count: validSelection.length,
    selectedFrameIds: validSelection.map(node => node.id),
    hasInstances // Add this flag
  });
});

/**
 * Start watching document for changes
 * Sets up a listener that performs automatic re-scanning when changes are detected
 */
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
          // Support ALL SceneNode types that can be meaningfully scanned
          node.type === 'FRAME' || 
          node.type === 'COMPONENT' || 
          node.type === 'COMPONENT_SET' || 
          node.type === 'INSTANCE' ||
          node.type === 'GROUP' ||
          node.type === 'SECTION' ||
          node.type === 'RECTANGLE' ||
          node.type === 'ELLIPSE' ||
          node.type === 'POLYGON' ||
          node.type === 'STAR' ||
          node.type === 'VECTOR' ||
          node.type === 'LINE' ||
          node.type === 'TEXT' ||
          node.type === 'BOOLEAN_OPERATION' ||
          node.type === 'SLICE' ||
          node.type === 'CONNECTOR' ||
          node.type === 'WIDGET' ||
          node.type === 'EMBED' ||
          node.type === 'LINK_UNFURL' ||
          node.type === 'MEDIA' ||
          node.type === 'STICKY' ||
          node.type === 'SHAPE_WITH_TEXT' ||
          node.type === 'CODE_BLOCK'
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
          
          // Use the new scanners module instead of valuesScanner
          const scanResults = await scanForDeletedVariables(
            (progress) => {
              figma.ui.postMessage({ type: 'scan-progress', progress });
            },
            documentState.selectedFrameIds,
            documentState.ignoreHiddenLayers || false,
            []
          );

          // Check if there are any missing references
          if (scanResults.results.length === 0) {
            figma.ui.postMessage({ 
              type: 'scan-complete',
              status: 'success',
              message: 'No unlinked parameters found!'
            });
          } else {
            // Use the grouping function from scanners module with the results array
            figma.ui.postMessage({
              type: 'missing-references-result',
              references: scanners.groupScanResults('missing-library', scanResults.results)
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

/**
 * Stop watching document for changes
 */
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

// Store last scan parameters for rescanning
let lastScanParams: ScanForTokensMessage | null = null;

// Message type definitions
interface ScanForTokensMessage {
  type: 'scan-for-tokens';
  scanType: string;
  scanEntirePage: boolean;
  selectedFrameIds: string[];
  ignoreHiddenLayers: boolean;
  skipInstances: boolean;
  isLibraryVariableScan: boolean;
  isRescan?: boolean;
  sourceType?: 'raw-values' | 'missing-library' | 'deleted-variables' | 'linked-library';
  variableTypes?: string[];
}

interface UnlinkVariableMessage {
  type: 'unlink-variable';
  nodeId: string;
  property: string;
  currentValue: any;
}

interface UnlinkGroupVariablesMessage {
  type: 'unlink-group-variables';
  refs: MissingReference[];
}

interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

interface StopScanMessage {
  type: 'stop-scan';
}

interface StartWatchingMessage {
  type: 'start-watching';
  scanType: string;
  scanEntirePage: boolean;
}

interface StopWatchingMessage {
  type: 'stop-watching';
}

interface ApplyTokenMessage {
  type: 'apply-token';
  nodeId: string;
  tokenType: string;
  tokenValue: any;
}

interface ApplyStyleMessage {
  type: 'apply-style';
  nodeId: string;
  styleType: string;
  styleId: string;
}

interface SwapComponentMessage {
  type: 'swap-component';
  nodeId: string;
  componentId: string;
}

interface CancelScanMessage {
  type: 'cancel-scan';
}

interface ClosePluginMessage {
  type: 'close-plugin';
}

interface DebugDocumentVariablesMessage {
  type: 'debug-document-variables';
  variableTypes: string[];
}

interface SelectGroupMessage {
  type: 'select-group';
  nodeIds: string[];
}

interface GetSelectedFrameIdsMessage {
  type: 'get-selected-frame-ids';
}

interface ListVariablesMessage {
  type: 'list-variables';
}

interface ScanLibraryTokensMessage {
  type: 'scan-library-tokens';
  scanType: string;
  ignoreHiddenLayers: boolean;
}

interface PauseLibraryScanMessage {
  type: 'pause-library-scan';
}

interface ResumeLibraryScanMessage {
  type: 'resume-library-scan';
}

interface StopLibraryScanMessage {
  type: 'stop-library-scan';
}

interface SelectNodeMessage {
  type: 'select-node';
  nodeId: string;
}

interface SelectNodesMessage {
  type: 'select-nodes';
  nodeIds: string[];
}

interface ScanVariablesMessage {
  type: 'scan-variables';
  scanTypes: string[];
  ignoreHiddenLayers: boolean;
  variableTypes?: string[];
}

interface LoadVariablesMessage {
  type: 'load-variables';
}

interface GroupResultsMessage {
  type: 'group-results';
  results: any[];
  sourceType?: string;
  scanType?: string;
}

interface SelectVariableNodesMessage {
  type: 'select-variable-nodes';
  variableId: string;
}

interface SelectVariableGroupNodesMessage {
  type: 'select-variable-group-nodes';
  variableIds: string[];
}

interface StopVariableScanMessage {
  type: 'stop-variable-scan';
}

type PluginMessage = 
  | ScanForTokensMessage
  | UnlinkVariableMessage
  | UnlinkGroupVariablesMessage
  | ResizeMessage
  | StopScanMessage
  | StartWatchingMessage
  | StopWatchingMessage
  | ApplyTokenMessage
  | ApplyStyleMessage
  | SwapComponentMessage
  | CancelScanMessage
  | ClosePluginMessage
  | DebugDocumentVariablesMessage
  | SelectGroupMessage
  | GetSelectedFrameIdsMessage
  | ListVariablesMessage
  | ScanLibraryTokensMessage
  | PauseLibraryScanMessage
  | ResumeLibraryScanMessage
  | StopLibraryScanMessage
  | SelectNodeMessage
  | SelectNodesMessage
  | ScanVariablesMessage
  | LoadVariablesMessage
  | GroupResultsMessage
  | SelectVariableNodesMessage
  | SelectVariableGroupNodesMessage
  | StopVariableScanMessage;

// Function to handle scanning
async function handleScan(params: ScanForTokensMessage): Promise<void> {
  const scanType = params.scanType as ScanType;
  try {
    const scanResults = await scanForDeletedVariables(
      (progress) => {
        figma.ui.postMessage({ type: 'scan-progress', progress });
      },
      params.selectedFrameIds,
      params.ignoreHiddenLayers,
      params.variableTypes
    );
    
    // Handle scan results
    if (scanResults.results.length === 0) {
      figma.ui.postMessage({ 
        type: 'scan-complete',
        status: 'success',
        message: 'No missing references found'
      });
    } else {
      // Group the results before sending
      const groupedResults = scanners.groupScanResults('missing-library', scanResults.results);
      figma.ui.postMessage({
        type: 'missing-references-result',
        references: groupedResults
      });
    }
  } catch (err) {
    console.error('Scan error:', err);
    figma.ui.postMessage({
      type: 'scan-error',
      message: 'Failed to complete scan'
    });
  }
}

// Handle messages from the UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  console.log('Plugin received message:', msg);

  // Store scan parameters for potential rescan
  if (msg.type === 'scan-for-tokens') {
    lastScanParams = msg;
  }

  // Window resize
  if (msg.type === 'resize') {
    // Validate dimensions
    const width = Math.min(Math.max(msg.width || 300, 300), 800);
    const height = Math.min(Math.max(msg.height || 400, 400), 900);
    
    // Use figma.ui.resize
    figma.ui.resize(width, height);

    // Save the size preference
    try {
      await figma.clientStorage.setAsync('windowSize', { width, height });
    } catch (err) {
      console.error('Failed to save window size:', err);
    }
  }
  
  // Handle stop scan
  if (msg.type === 'stop-scan') {
    console.log('Received stop scan request');
    scanners.cancelScan(); // Use cancelScan from scanners instead of valuesScanner
    
    // Notify UI that scan was cancelled
    figma.ui.postMessage({ 
      type: 'scan-cancelled'
    });
    return;
  }

  // Handle scan request for values
  if (msg.type === 'scan-for-tokens') {
    // First, clear any existing watch
    stopWatchingDocument();
    
    // Extract scan parameters with fallbacks for backward compatibility
    const scanType = msg.scanType || '';
    const selectedFrameIds = msg.selectedFrameIds || [];
    const ignoreHiddenLayers = msg.ignoreHiddenLayers || false;
    const isRescan = msg.isRescan || false;
    const sourceType = msg.sourceType || 'raw-values'; // Default to raw-values
    
    // Reset cancellation flag at the start of a new scan
    scanners.resetCancellation();
    
    try {
      // Instruct UI to clear previous results to prevent stale state
      figma.ui.postMessage({ type: 'clear-results' });
      // Notify UI that scan has started
      figma.ui.postMessage({ type: 'scan-started' });
      
      console.log(`Starting scan: ${sourceType} - ${scanType}`, {
        sourceType,
        scanType, 
        selectedFrameIds: selectedFrameIds.length, 
        ignoreHiddenLayers,
        variableTypes: msg.variableTypes || [] // Log variable types
      });
      
      // Create throttled progress updater with smaller threshold for more frequent updates
      // Use 0.2% threshold instead of 0.5% for more granular updates
      const progressCallback = createThrottledProgress(0.2);
      
      // Optimize deleted/missing library scans by calling the specific scanner once
      if (sourceType === 'missing-library' || sourceType === 'deleted-variables') {
        const deletedVariablesResult = await scanners.scanForDeletedVariables(
          progressCallback,
          selectedFrameIds,
          ignoreHiddenLayers,
          msg.variableTypes || [],
          msg.skipInstances || false
        );

        const grouped = scanners.groupScanResults(sourceType, deletedVariablesResult.results);

        figma.ui.postMessage({
          type: 'missing-library-result',
          references: grouped,
          availableTypes: Array.from(deletedVariablesResult.availableTypes),
          count: deletedVariablesResult.results.length
        });
      } else {
        // Use the scanner runner for all other source types
        const scanResults = await scanners.runScanner(
          sourceType,
          scanType as ScanType,
          selectedFrameIds,
          progressCallback,
          ignoreHiddenLayers,
          msg.variableTypes || [],
          msg.skipInstances || false
        );

        const grouped = scanners.groupScanResults(sourceType, scanResults);

        figma.ui.postMessage({
          type: 'scan-complete',
          references: grouped,
          count: scanResults.length,
          sourceType,
          scanType,
          isLibraryVariableScan: sourceType !== 'raw-values'
        });
      }
    } catch (error: any) {
      console.error('Error during scan:', error);
      
      figma.ui.postMessage({
        type: 'scan-error',
        message: `Scan failed: ${error.message || 'Unknown error'}`
      });
    }
    
    // Start watching if not a rescan
    // REMOVED: Automatic document watching - let users manually enable watch mode via UI controls
    // if (!isRescan && !scanners.isScancelled()) {
    //   startWatchingDocument(msg.scanType as common.ScanType, msg.scanEntirePage);
    // }
  }

  // Handle watch document requests
  if (msg.type === 'start-watching') {
    await startWatchingDocument(msg.scanType as ScanType, msg.scanEntirePage ?? false);
  } else if (msg.type === 'stop-watching') {
    stopWatchingDocument();
  }
  
  // Handle token application
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

  // Handle style application
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

  // Handle component swap
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
            
            // Add safety check for node width and height to avoid "Node::setSize() cannot set size of node" error
            const safeWidth = typeof node.width === 'number' && isFinite(node.width) && node.width > 0 ? 
                             node.width : 100; // Default to 100 if invalid
            const safeHeight = typeof node.height === 'number' && isFinite(node.height) && node.height > 0 ? 
                              node.height : 100; // Default to 100 if invalid
            
            try {
              // Attempt to resize with safe values
              newInstance.resize(safeWidth, safeHeight);
            } catch (resizeErr) {
              console.error('Error resizing node:', resizeErr);
              // If resize fails, don't throw - continue with insertion
            }
            
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

  // Handle cancel scan
  if (msg.type === 'cancel-scan') {
    scanners.cancelScan();
    figma.ui.postMessage({ 
      type: 'scan-cancelled', 
      message: 'Scan cancelled by user' 
    });
  }

  // Close plugin
  if (msg.type === 'close-plugin') {
    figma.closePlugin();
  }
  
  // Handle debug document variables request
  if (msg.type === 'debug-document-variables') {
    try {
      // First run the general debug to log information to console
      await scanners.debugDocumentVariables((progress: number) => {
        // Send progress updates to UI
        figma.ui.postMessage({
          type: 'debug-progress',
          progress
        });
      });
      
      // Use runScanner instead of direct function calls
      
      // Scan for missing library variables
      const missingLibraryVariables = await scanners.runScanner(
        'missing-library',
        'fill', // default scan type
        [], // scan the whole page
        () => {}, // Skip progress updates for this scan
        false, // don't ignore hidden layers
        msg.variableTypes || [], // Pass variable types filter
        false // default skipInstances to false for debug scans
      );
      
      // Scan for deleted variables
      const deletedVariables = await scanners.runScanner(
        'deleted-variables',
        'fill', // default scan type
        [], // scan the whole page
        () => {}, // Skip progress updates for this scan
        false, // don't ignore hidden layers
        msg.variableTypes || [], // Pass variable types filter
        false // default skipInstances to false for debug scans
      );
      
      // Collect variables from all library types to show in UI
      let allVariables = [];
      
      // Combine all results
      allVariables = [
        ...missingLibraryVariables,
        ...deletedVariables
      ];
      
      // Send results to UI for display
      figma.ui.postMessage({
        type: 'debug-complete',
        message: 'Variable scan debug complete. Check console for detailed results.',
        variables: allVariables // Include all variables in the message
      });
    } catch (error: any) {
      console.error('Error during variable debug:', error);
      figma.ui.postMessage({
        type: 'error',
        message: `Debug failed: ${error.message}`
      });
    }
  }

  // Handle node selection
  if (msg.type === 'select-group') {
    try {
      // Check if nodeIds exists and is an array
      if (!msg.nodeIds || !Array.isArray(msg.nodeIds)) {
        throw new Error('Invalid node IDs provided');
      }

      // Fetch nodes asynchronously
      const nodes = await Promise.all(
        msg.nodeIds.map((id: string) => figma.getNodeByIdAsync(id))
      );
      
      // Filter out null values and ensure nodes are SceneNodes
      const validNodes = nodes.filter((node: BaseNode | null): node is SceneNode => 
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

  // Get selected frame IDs
  if (msg.type === 'get-selected-frame-ids') {
    const selection = figma.currentPage.selection;
    const hasInstances = selection.some(node => node.type === 'INSTANCE');
    const validSelection = selection.filter(node => 
      // Support ALL SceneNode types that can be meaningfully scanned
      node.type === 'FRAME' || 
      node.type === 'COMPONENT' || 
      node.type === 'COMPONENT_SET' || 
      node.type === 'INSTANCE' ||
      node.type === 'GROUP' ||
      node.type === 'SECTION' ||
      node.type === 'RECTANGLE' ||
      node.type === 'ELLIPSE' ||
      node.type === 'POLYGON' ||
      node.type === 'STAR' ||
      node.type === 'VECTOR' ||
      node.type === 'LINE' ||
      node.type === 'TEXT' ||
      node.type === 'BOOLEAN_OPERATION' ||
      node.type === 'SLICE' ||
      node.type === 'CONNECTOR' ||
      node.type === 'WIDGET' ||
      node.type === 'EMBED' ||
      node.type === 'LINK_UNFURL' ||
      node.type === 'MEDIA' ||
      node.type === 'STICKY' ||
      node.type === 'SHAPE_WITH_TEXT' ||
      node.type === 'CODE_BLOCK'
    );
    
    // Send both the IDs and the count
    figma.ui.postMessage({
      type: 'selected-frame-ids',
      ids: validSelection.map(node => node.id),
      count: validSelection.length,
      hasSelection: validSelection.length > 0,
      hasInstances,
      selectedFrameIds: validSelection.map(node => node.id)
    });
  }

  // Variables features
  if (msg.type === 'list-variables') {
    figma.ui.postMessage({
      type: 'variables-list',
      variables: []
    });
  }

  // Scan library tokens
  if (msg.type === 'scan-library-tokens') {
    try {
      // Since scanForTokens doesn't exist, use scanForDeletedVariables instead
      const scanResults = await scanForDeletedVariables(
        (progress) => {
          figma.ui.postMessage({ type: 'scan-progress', progress });
        },
        [],  // No specific frame IDs
        msg.ignoreHiddenLayers || false,
        []  // No specific variable types
      );

      figma.ui.postMessage({
        type: 'library-tokens-result',
        results: scanResults.results
      });
    } catch (error) {
      console.error('Error scanning library tokens:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to scan library tokens'
      });
    }
  }

  // Handle library scan control
  if (msg.type === 'pause-library-scan') {
    console.log('Library scan pause requested - feature not available');
    figma.ui.postMessage({
      type: 'scan-paused'
    });
  }

  if (msg.type === 'resume-library-scan') {
    console.log('Library scan resume requested - feature not available');
    figma.ui.postMessage({
      type: 'scan-resumed'
    });
  }

  if (msg.type === 'stop-library-scan') {
    console.log('Library scan stop requested - feature not available');
    figma.ui.postMessage({
      type: 'scan-stopped'
    });
  }

  // Node selection
  if (msg.type === 'select-node') {
    try {
      if (!msg.nodeId) {
        throw new Error('No node ID provided');
      }
      await selectNode(msg.nodeId);
    } catch (err) {
      console.error('Error in node selection:', err);
      figma.ui.postMessage({
        type: 'selection-error',
        message: err instanceof Error ? err.message : 'Failed to select node'
      });
    }
  } else if (msg.type === 'select-nodes') {
    if (Array.isArray(msg.nodeIds) && msg.nodeIds.length > 0) {
      await selectNodes(msg.nodeIds);
    } else {
      figma.ui.postMessage({
        type: 'selection-error',
        message: 'Invalid node IDs provided'
      });
    }
  }

  // Scan for variables
  if (msg.type === 'scan-variables') {
    try {
      const scanResults = await scanForDeletedVariables(
        (progress: number) => {
          figma.ui.postMessage({
            type: 'variable-scan-progress',
            progress
          });
        },
        [],
        msg.ignoreHiddenLayers,
        msg.variableTypes
      );

      figma.ui.postMessage({
        type: 'variables-scan-complete',
        results: scanResults.results
      });
    } catch (error) {
      console.error('Error scanning variables:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to scan variables'
      });
    }
  }

  // Handle unlink variable message
  if (msg.type === 'unlink-variable') {
    try {
      const { nodeId, property, currentValue } = msg;
      await unlinkVariable(nodeId, property, currentValue);
      figma.notify('Variable unlinked successfully');
      
      // Trigger a rescan to update the UI
      if (lastScanParams) {
        await handleScan(lastScanParams);
      }
    } catch (error) {
      console.error('Error unlinking variable:', error);
      figma.notify('Failed to unlink variable', { error: true });
    }
  }

  // Add handler for 'load-variables' message
  if (msg.type === 'load-variables') {
    try {
      console.log('Loading variables...');
      
      // Use local listAllVariables function
      const variables = await listAllVariables();
      
      figma.ui.postMessage({
        type: 'variables-loaded',
        variables
      });
      
      console.log(`Loaded ${variables.length} variables`);
    } catch (err) {
      console.error('Error loading variables:', err);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to load variables'
      });
    }
  }

  // Add handler for 'select-variable-nodes' message
  if (msg.type === 'select-variable-nodes') {
    try {
      // Type assertion to access the message properties
      const { variableId } = msg as SelectVariableNodesMessage;
      
      if (!variableId) {
        throw new Error('No variable ID provided');
      }
      
      // Find all nodes using this variable
      const nodesWithVariable = figma.currentPage.findAll(node => {
        if (!('boundVariables' in node) || !node.boundVariables) return false;
        
        // Check if any binding uses this variable
        for (const binding of Object.values(node.boundVariables)) {
          if (binding && typeof binding === 'object' && 'id' in binding && binding.id === variableId) {
            return true;
          }
        }
        
        return false;
      });
      
      // Select the nodes
      figma.currentPage.selection = nodesWithVariable;
      
      console.log(`Selected ${nodesWithVariable.length} nodes using variable ${variableId}`);
      
      // Show message if no nodes found
      if (nodesWithVariable.length === 0) {
        figma.ui.postMessage({
          type: 'info',
          message: 'No nodes found with this variable'
        });
      }
    } catch (err) {
      console.error('Error selecting variable nodes:', err);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to select nodes'
      });
    }
  }

  // Add handler for 'select-variable-group-nodes' message
  if (msg.type === 'select-variable-group-nodes') {
    try {
      // Type assertion to access the message properties
      const { variableIds } = msg as SelectVariableGroupNodesMessage;
      
      if (!variableIds || variableIds.length === 0) {
        throw new Error('No variable IDs provided');
      }
      
      // Find all nodes using any of these variables
      const nodesWithVariables = figma.currentPage.findAll(node => {
        if (!('boundVariables' in node) || !node.boundVariables) return false;
        
        // Check if any binding uses any of the variables
        for (const binding of Object.values(node.boundVariables)) {
          if (binding && typeof binding === 'object' && 'id' in binding && variableIds.includes(binding.id as string)) {
            return true;
          }
        }
        
        return false;
      });
      
      // Select the nodes
      figma.currentPage.selection = nodesWithVariables;
      
      console.log(`Selected ${nodesWithVariables.length} nodes using ${variableIds.length} variables`);
      
      // Show message if no nodes found
      if (nodesWithVariables.length === 0) {
        figma.ui.postMessage({
          type: 'info',
          message: 'No nodes found with these variables'
        });
      }
    } catch (err) {
      console.error('Error selecting variable group nodes:', err);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to select nodes'
      });
    }
  }

  // Add handler for 'stop-variable-scan' message
  if (msg.type === 'stop-variable-scan') {
    try {
      console.log('Stopping variable scan...');
      
      // Just notify UI since we don't have a direct stopLibraryScan implementation
      figma.ui.postMessage({
        type: 'variable-scan-stopped'
      });
    } catch (err) {
      console.error('Error stopping variable scan:', err);
    }
  }

  // Handle the select-nodes message to select a group of nodes
  if (msg.type === 'select-nodes' && Array.isArray(msg.nodeIds)) {
    const nodeIds = msg.nodeIds;
    console.log(`Selecting ${nodeIds.length} nodes`);
    
    try {
      // Clear current selection
      figma.currentPage.selection = [];
      
      // Get all nodes asynchronously and add them to selection
      Promise.all(nodeIds.map(id => figma.getNodeByIdAsync(id)))
        .then(nodes => {
          // Filter out null values and ensure they are SceneNode types
          const validNodes = nodes
            .filter((node): node is SceneNode => 
              node !== null && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT'
            );
          
          console.log(`Found ${validNodes.length} valid nodes out of ${nodeIds.length} requested`);
          
          if (validNodes.length > 0) {
            // Set the selection to the found nodes
            figma.currentPage.selection = validNodes;
            
            // Scroll to the first node
            if (validNodes[0]) {
              figma.viewport.scrollAndZoomIntoView(validNodes);
            }
            
            // Send success message back to UI
            figma.ui.postMessage({
              type: 'nodes-selected',
              success: true,
              count: validNodes.length
            });
          } else {
            // Send error message if no valid nodes found
            figma.ui.postMessage({
              type: 'nodes-selected',
              success: false,
              error: 'No valid nodes found with the provided IDs'
            });
          }
        })
        .catch(error => {
          console.error('Error selecting nodes:', error);
          figma.ui.postMessage({
            type: 'nodes-selected',
            success: false,
            error: 'Error selecting nodes: ' + (error instanceof Error ? error.message : String(error))
          });
        });
    } catch (error) {
      console.error('Error handling select-nodes message:', error);
      figma.ui.postMessage({
        type: 'nodes-selected',
        success: false,
        error: 'Error handling select-nodes message: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  }

  // Maintain compatibility with old select-group message type
  if (msg.type === 'select-group' && Array.isArray(msg.nodeIds)) {
    // Redirect to the new handler, but directly handle it instead of a recursive call
    const nodeIds = msg.nodeIds;
    console.log(`Legacy select-group handling for ${nodeIds.length} nodes`);
    
    try {
      // Clear current selection
      figma.currentPage.selection = [];
      
      // Get all nodes asynchronously and add them to selection
      Promise.all(nodeIds.map(id => figma.getNodeByIdAsync(id)))
        .then(nodes => {
          // Filter out null values and ensure they are SceneNode types
          const validNodes = nodes
            .filter((node): node is SceneNode => 
              node !== null && 'type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT'
            );
          
          if (validNodes.length > 0) {
            figma.currentPage.selection = validNodes;
            figma.viewport.scrollAndZoomIntoView(validNodes);
            
            figma.ui.postMessage({
              type: 'nodes-selected',
              success: true,
              count: validNodes.length
            });
          } else {
            figma.ui.postMessage({
              type: 'nodes-selected',
              success: false,
              error: 'No valid nodes found'
            });
          }
        })
        .catch(error => {
          console.error('Error in legacy select-group:', error);
          figma.ui.postMessage({
            type: 'nodes-selected',
            success: false,
            error: 'Error selecting nodes: ' + (error instanceof Error ? error.message : String(error))
          });
        });
    } catch (error) {
      console.error('Error handling legacy select-group:', error);
    }
  }

  // Add a simplified handler for the group-results message type
  if (msg.type === 'group-results') {
    console.log('Received request to group scan results');
    
    if (msg.results && Array.isArray(msg.results)) {
      try {
        console.log(`Grouping ${msg.results.length} scan results`);
        
        // Default to 'raw-values' if sourceType is undefined
        const sourceType = msg.sourceType || 'raw-values';
        
        // Group using the appropriate grouping function
        const groupedReferences = scanners.groupScanResults(
          sourceType as 'raw-values' | 'missing-library' | 'deleted-variables' | 'linked-library',
          msg.results
        );
        
        console.log(`Grouped ${msg.results.length} results into ${Object.keys(groupedReferences).length} groups`);
        
        // Send the grouped references back to the UI with proper formatting
        figma.ui.postMessage({
          type: 'missing-references-result',
          references: groupedReferences,
          scanType: msg.scanType,
          sourceType: sourceType,
          isGrouped: true
        });
      } catch (err) {
        console.error('Error grouping scan results:', err);
        figma.ui.postMessage({
          type: 'error',
          message: 'Failed to group scan results'
        });
      }
    } else {
      console.warn('Invalid or empty results array for grouping');
      figma.ui.postMessage({
        type: 'error',
        message: 'Invalid results for grouping'
      });
    }
  }

  // Handle unlink group variables message
  if (msg.type === 'unlink-group-variables') {
    try {
      const { refs } = msg;
      await unlinkGroupVariables(refs);
      figma.notify(`Unlinked ${refs.length} variables successfully`);
      
      // Trigger a rescan to update the UI
      if (lastScanParams) {
        await handleScan(lastScanParams);
      }
    } catch (error) {
      console.error('Error unlinking group variables:', error);
      figma.notify('Failed to unlink variables', { error: true });
    }
  }
};

/**
 * Process a node and its children to find variable bindings
 */
function processNodeForVariables(
  node: SceneNode,
  variables: Variable[],
  collectionMap: Map<string, VariableCollection>,
  linkedVariablesMap: Map<string, any>
) {
  try {
    // Check if node has variable bindings
    if ('boundVariables' in node && node.boundVariables) {
      // Process each binding
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        // Check for variable bindings - ensure proper type checking
        if (binding && typeof binding === 'object' && 'id' in binding) {
          try {
            const variableId = binding.id as string;
            const variable = variables.find(v => v.id === variableId);
            
            // Only include variables that match our filtered types
            if (variable) {
              const collection = collectionMap.get(variable.variableCollectionId);
              
              // Add or update variable in map
              if (!linkedVariablesMap.has(variableId)) {
                linkedVariablesMap.set(variableId, {
                  id: variable.id,
                  name: variable.name,
                  type: variable.resolvedType,
                  value: variable.valuesByMode ? Object.values(variable.valuesByMode)[0] : null,
                  collectionId: variable.variableCollectionId,
                  collectionName: collection ? collection.name : 'Unknown Collection',
                  usages: []
                });
              }
              
              // Add this usage
              const variableData = linkedVariablesMap.get(variableId);
              variableData.usages.push({
                nodeId: node.id,
                nodeName: node.name,
                property,
                location: getNodeLocation(node)
              });
            }
          } catch (err) {
            console.warn('Error processing variable binding:', err);
          }
        }
      }
    }
    
    // Process children recursively
    if ('children' in node) {
      for (const child of node.children) {
        processNodeForVariables(child, variables, collectionMap, linkedVariablesMap);
      }
    }
  } catch (err) {
    console.warn(`Error processing node ${node.name}:`, err);
  }
}

/**
 * Get a readable location string for a node
 */
function getNodeLocation(node: BaseNode): string {
  const parts: string[] = [];
  let current: BaseNode | null = node.parent;
  
  // Get up to 2 parent names
  let depth = 0;
  while (current && depth < 2) {
    if (current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
      parts.unshift(current.name);
      depth++;
    }
    current = current.parent;
  }
  
  if (parts.length > 0) {
    return parts.join(' > ');
  }
  
  return 'Root';
}

// Helper functions for node selection
async function selectNode(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (node && 'type' in node && node.type !== 'DOCUMENT') {
    figma.currentPage.selection = [node as SceneNode];
    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  }
}

async function selectNodes(nodeIds: string[]): Promise<void> {
  const nodes = await Promise.all(nodeIds.map(id => figma.getNodeByIdAsync(id)));
  const validNodes = nodes.filter((node): node is SceneNode => 
    node !== null && 'type' in node && node.type !== 'DOCUMENT'
  );
  if (validNodes.length > 0) {
    figma.currentPage.selection = validNodes;
    figma.viewport.scrollAndZoomIntoView(validNodes);
  }
}

// Update scan result handling
function handleScanResults(scanResults: { results: MissingReference[]; availableTypes: Set<string> }) {
  if (scanResults.results.length === 0) {
    figma.ui.postMessage({ 
      type: 'scan-complete',
      status: 'success',
      message: 'No missing references found'
    });
  } else {
    figma.ui.postMessage({
      type: 'missing-references-result',
      references: scanners.groupScanResults('missing-library', scanResults.results)
    });
  }
}

// Replace listAllVariables and stopLibraryScan with direct implementations
async function listAllVariables() {
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables: any[] = [];
    
    for (const collection of collections) {
      if (collection.variableIds) {
        const collectionVariables = await Promise.all(
          collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
        );
        variables.push(...collectionVariables.filter(v => v !== null));
      }
    }
    
    return variables;
  } catch (err) {
    console.error('Error listing variables:', err);
    return [];
  }
}


