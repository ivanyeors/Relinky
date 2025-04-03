// Main entry point for the Relinky plugin
// Handles initialization, UI events, and plugin lifecycle

import * as common from './common';
import * as valuesScanner from '@relink';
import * as variablesScanner from '@unlink';

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

// Document state for watching changes
const documentState: common.DocumentChangeHandler = {
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
    node.type === 'FRAME' || 
    node.type === 'COMPONENT' || 
    node.type === 'COMPONENT_SET' || 
    node.type === 'SECTION'
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
async function startWatchingDocument(scanType: common.ScanType, scanEntirePage: boolean = false) {
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
          const missingRefs = await valuesScanner.scanForMissingReferences(
            documentState.lastScanType,
            documentState.scanEntirePage ? undefined : documentState.selectedFrameIds,
            (progress) => {
              figma.ui.postMessage({ 
                type: 'scan-progress', 
                progress 
              });
            },
            documentState.ignoreHiddenLayers || false
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
              references: common.groupMissingReferences(missingRefs)
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

// Add interface for scan-for-tokens message
interface ScanForTokensMessage {
  type: 'scan-for-tokens';
  scanType: string;
  scanEntirePage: boolean;
  selectedFrameIds: string[];
  ignoreHiddenLayers?: boolean;
  isRescan?: boolean;
  isLibraryVariableScan?: boolean;
  // New properties for the two-level scan approach
  sourceType: 'raw-values' | 'team-library' | 'local-library' | 'missing-library';
  tokenType?: string | null;
}

interface ScanVariablesMessage {
  type: 'scan-variables';
  scanTypes: string[];
  ignoreHiddenLayers: boolean;
}

interface UnlinkVariableMessage {
  type: 'unlink-variable';
  variableId: string;
}

// Add interface for select-variable-nodes message
interface SelectVariableNodesMessage {
  type: 'select-variable-nodes';
  variableId: string;
}

// Add interface for select-variable-group-nodes message
interface SelectVariableGroupNodesMessage {
  type: 'select-variable-group-nodes';
  variableIds: string[];
}

// Add interface for load-variables message
interface LoadVariablesMessage {
  type: 'load-variables';
}

// Add interface for stop-variable-scan message
interface StopVariableScanMessage {
  type: 'stop-variable-scan';
}

// Update the existing PluginMessage type to include our new message types
type PluginMessage = common.PluginMessage | 
  ScanForTokensMessage |
  ScanVariablesMessage | 
  UnlinkVariableMessage | 
  SelectVariableNodesMessage | 
  SelectVariableGroupNodesMessage | 
  LoadVariablesMessage | 
  StopVariableScanMessage;

// Handle messages from the UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  console.log('Plugin received message:', msg);

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
  
  // Stop scan
  if (msg.type === 'stop-scan') {
    console.log('Received stop scan request');
    valuesScanner.cancelScan();
    
    // Notify UI that scan was cancelled
    figma.ui.postMessage({ 
      type: 'scan-cancelled'
    });
    return;
  }

  // Handle scan request for values
  if (msg.type === 'scan-for-tokens') {
    try {
      // Type guard to ensure we have a ScanForTokensMessage
      const scanMsg = msg as ScanForTokensMessage;
      
      const { 
        scanType, 
        scanEntirePage, 
        selectedFrameIds, 
        ignoreHiddenLayers = false, 
        isLibraryVariableScan = false,
        sourceType = 'raw-values', // Default to raw-values if sourceType is not provided
        tokenType
      } = scanMsg;

      console.log('Starting scan with progress tracking');
      console.log('Scan type:', scanType);
      console.log('Source type:', sourceType);
      console.log('Token type:', tokenType);
      console.log('Selected frame IDs:', selectedFrameIds);
      console.log('Scan entire page:', scanEntirePage);
      console.log('Is rescan:', scanMsg.isRescan || false);
      console.log('Is library variable scan:', isLibraryVariableScan);

      // Determine what scan method to use based on the source type
      let missingRefs: common.MissingReference[] = [];

      // Show scanning status in UI
      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: `Scanning for ${scanType}...`
      });

      // If it's not scanning entire page, handle selection
      const selectedFrameIdArray = selectedFrameIds && selectedFrameIds.length > 0 ? selectedFrameIds : undefined;
      let selectedNodes: SceneNode[] | undefined = undefined;
      
      // Only prepare the nodes if needed for functions that expect SceneNode[]
      if (!scanEntirePage && selectedFrameIds.length > 0 && sourceType !== 'missing-library' && scanType !== 'missing-library') {
        // For functions that expect SceneNode[], we need to convert the IDs to nodes
        try {
          // Get the actual nodes from the IDs
          const nodes = await Promise.all(
            selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
          );
          
          // Filter out nulls and convert to SceneNodes
          selectedNodes = nodes.filter((node): node is SceneNode => 
            node !== null && 'type' in node
          );
          
          if (selectedNodes.length === 0) {
            figma.ui.postMessage({
              type: 'error',
              message: 'No valid nodes found for scanning'
            });
            return;
          }
        } catch (error) {
          console.error('Error converting IDs to nodes:', error);
          figma.ui.postMessage({
            type: 'error',
            message: 'Error preparing nodes for scanning'
          });
          return;
        }
      }

      // Handle different source types and optional token types
      if (sourceType === 'raw-values') {
        // For raw values, use the scanType directly (it's the token type)
        missingRefs = await valuesScanner.scanForMissingReferences(
          scanType as common.ScanType,
          selectedFrameIdArray, // Pass IDs because scanForMissingReferences expects string[]
          (progress) => {
            figma.ui.postMessage({ 
              type: 'scan-progress', 
              progress,
              isScanning: true
            });
          },
          ignoreHiddenLayers
        );
      } else if (sourceType && !tokenType) {
        // If only source type is selected, scan for all variable types of that source
        switch (sourceType) {
          case 'team-library':
            missingRefs = await valuesScanner.scanForTeamLibraryVariables(
              (progress) => {
                figma.ui.postMessage({
                  type: 'scan-progress',
                  progress,
                  isScanning: true
                });
              },
              selectedNodes, // Pass nodes because this function expects SceneNode[]
              ignoreHiddenLayers
            );
            break;
          case 'local-library':
            missingRefs = await valuesScanner.scanForLocalLibraryVariables(
              (progress) => {
                figma.ui.postMessage({
                  type: 'scan-progress',
                  progress,
                  isScanning: true
                });
              },
              selectedNodes, // Pass nodes because this function expects SceneNode[]
              ignoreHiddenLayers
            );
            break;
          case 'missing-library':
            missingRefs = await valuesScanner.scanForMissingLibraryVariables(
              (progress) => {
                figma.ui.postMessage({
                  type: 'scan-progress',
                  progress,
                  isScanning: true
                });
              },
              selectedNodes, // Pass nodes because this function expects SceneNode[]
              ignoreHiddenLayers
            );
            break;
        }
      } else if (sourceType && tokenType) {
        // If both source and token type are selected, use scanForMissingReferences
        missingRefs = await valuesScanner.scanForMissingReferences(
          scanType as common.ScanType,
          selectedFrameIdArray, // Pass IDs because scanForMissingReferences expects string[]
          (progress) => {
            figma.ui.postMessage({ 
              type: 'scan-progress', 
              progress,
              isScanning: true
            });
          },
          ignoreHiddenLayers
        );
      }
      
      // Process and send scan results back to the UI
      if (missingRefs.length === 0) {
        figma.ui.postMessage({
          type: 'scan-complete',
          status: 'success',
          message: 'No matching variables found.'
        });
      } else {
        console.log(`Scan complete. Found ${missingRefs.length} variables.`);
        
        // For debug variables scan, include the isDebugScan flag
        if (scanType === 'missing-library' || sourceType === 'missing-library') {
          figma.ui.postMessage({
            type: 'debug-results',
            variables: missingRefs,
            isDebugScan: true
          });
        } else {
          // For normal scan, we send the grouped references
          figma.ui.postMessage({
            type: 'missing-references-result',
            references: common.groupMissingReferences(missingRefs)
          });
        }
        
        figma.ui.postMessage({
          type: 'scan-complete',
          status: 'success',
          message: `Found ${missingRefs.length} variables.`
        });
      }
      
      // Start watching document for changes if requested
      if (msg.isRescan) {
        startWatchingDocument(scanType as common.ScanType, scanEntirePage);
      }
    } catch (err) {
      console.error('Error during scan:', err);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to complete scan: ' + (err instanceof Error ? err.message : String(err))
      });
    }
  }

  // Handle watch document requests
  if (msg.type === 'start-watching') {
    await startWatchingDocument(msg.scanType as common.ScanType, msg.scanEntirePage ?? false);
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

  // Handle cancel scan
  if (msg.type === 'cancel-scan') {
    valuesScanner.cancelScan();
    figma.ui.postMessage({ 
      type: 'scan-cancelled', 
      message: 'Scan cancelled by user' 
    });
  }

  // Close plugin
  if (msg.type === 'close-plugin') {
    figma.closePlugin();
  }
  
  // Debug document variables - new handler
  if (msg.type === 'debug-document-variables') {
    console.log('Starting comprehensive variable scan debug...');
    
    try {
      // First run the general debug to log information to console
      await valuesScanner.debugDocumentVariables((progress) => {
        // Send progress updates to UI
        figma.ui.postMessage({
          type: 'debug-progress',
          progress
        });
      });
      
      // Collect variables from all library types to show in UI
      let allVariables = [];
      
      // Scan for team library variables
      const teamLibraryVariables = await valuesScanner.scanForTeamLibraryVariables(
        () => {}, // Skip progress updates for this scan
        undefined, // scan the whole page
        false     // include all layers
      );
      
      // Scan for local library variables
      const localLibraryVariables = await valuesScanner.scanForLocalLibraryVariables(
        () => {}, // Skip progress updates for this scan
        undefined, // scan the whole page
        false     // include all layers
      );
      
      // Scan for missing library variables
      const missingLibraryVariables = await valuesScanner.scanForMissingLibraryVariables(
        () => {}, // Skip progress updates for this scan
        undefined, // scan the whole page
        false     // include all layers
      );
      
      // Combine all results
      allVariables = [
        ...teamLibraryVariables,
        ...localLibraryVariables,
        ...missingLibraryVariables
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
      node.type === 'FRAME' || 
      node.type === 'COMPONENT' || 
      node.type === 'COMPONENT_SET' || 
      node.type === 'SECTION'
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
    await variablesScanner.listAllVariables();
  }

  // Scan library tokens
  if (msg.type === 'scan-library-tokens') {
    try {
      const results = await variablesScanner.scanForLibraryTokens(msg.scanType, msg.ignoreHiddenLayers || false);
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

  // Handle library scan control
  if (msg.type === 'pause-library-scan') {
    console.log('Pausing scan...');
    variablesScanner.pauseLibraryScan();
  }

  if (msg.type === 'resume-library-scan') {
    console.log('Resuming scan...');
    variablesScanner.resumeLibraryScan();
  }

  if (msg.type === 'stop-library-scan') {
    console.log('Stopping scan...');
    variablesScanner.stopLibraryScan();
  }

  // Node selection
  if (msg.type === 'select-node') {
    try {
      // Check if nodeId exists before calling selectNode
      if (!msg.nodeId) {
        throw new Error('No node ID provided');
      }
      await common.selectNode(msg.nodeId);
    } catch (err) {
      console.error('Error in node selection:', err);
      figma.ui.postMessage({
        type: 'selection-error',
        message: err instanceof Error ? err.message : 'Failed to select node'
      });
    }
  } else if (msg.type === 'select-nodes') {
    if (Array.isArray(msg.nodeIds) && msg.nodeIds.length > 0) {
      await common.selectNodes(msg.nodeIds);
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
      // Extract scan variables message properties
      const { scanTypes, ignoreHiddenLayers } = msg as ScanVariablesMessage;
      
      console.log('Starting variable scan with types:', scanTypes);
      
      // Update UI with scanning status
      figma.ui.postMessage({
        type: 'variable-scan-started'
      });
      
      const scanVariable = async () => {
        try {
          // Use the new scanForAllVariables function from the unlink module
          const variables = await variablesScanner.scanForAllVariables(
            scanTypes, 
            (progress) => {
              // Send progress updates to the UI
              figma.ui.postMessage({
                type: 'variable-scan-progress',
                progress
              });
            },
            ignoreHiddenLayers
          );
          
          // Send results to the UI
          figma.ui.postMessage({
            type: 'variable-scan-complete',
            variables
          });
          
          console.log(`Variable scan complete. Found ${variables.length} variables.`);
        } catch (err) {
          console.error('Error scanning for variables:', err);
          figma.ui.postMessage({
            type: 'variable-scan-error',
            message: 'Failed to scan for variables'
          });
        }
      };
      
      // Start the scan
      scanVariable();
    } catch (err) {
      console.error('Error handling scan-variables message:', err);
      figma.ui.postMessage({
        type: 'variable-scan-error',
        message: 'Failed to start variable scan'
      });
    }
  }

  // Unlink a variable from all usages
  if (msg.type === 'unlink-variable') {
    try {
      // Type assertion to access the unlink-variable message properties
      const { variableId } = msg as UnlinkVariableMessage;
      
      if (!variableId) {
        throw new Error('No variable ID provided');
      }
      
      // Use the new unlinkVariable function from the unlink module
      const unlinkedCount = await variablesScanner.unlinkVariable(variableId);
      
      // Notify the UI
      figma.ui.postMessage({
        type: 'variable-unlinked',
        data: {
          variableId,
          unlinkedCount
        }
      });
      
      console.log(`Unlinked variable ${variableId} from ${unlinkedCount} nodes`);
    } catch (err) {
      console.error('Error unlinking variable:', err);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to unlink variable'
      });
    }
  }

  // Add handler for 'load-variables' message
  if (msg.type === 'load-variables') {
    try {
      console.log('Loading variables...');
      
      // Get variables using the unlink module
      const variables = await variablesScanner.listAllVariables();
      
      // Send variables to the UI
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
      
      // Stop the scan
      variablesScanner.stopLibraryScan();
      
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


