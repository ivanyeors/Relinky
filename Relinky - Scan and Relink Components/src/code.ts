// Main entry point for the Relinky plugin
// Handles initialization, UI events, and plugin lifecycle

import * as common from './common';
import * as valuesScanner from './values';
import * as variablesScanner from './variables';

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
    type: 'selection-updated',
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

// Extend the PluginMessage type or interface to include new message properties
interface ScanVariablesMessage {
  type: 'scan-variables';
  variableTypes: string[];
  scanEntirePage: boolean;
  selectedFrameIds?: string[];
}

interface UnlinkVariableMessage {
  type: 'unlink-variable';
  variableId: string;
}

// Update the existing PluginMessage type to include our new message types
type PluginMessage = common.PluginMessage | ScanVariablesMessage | UnlinkVariableMessage;

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
      const { scanType, scanEntirePage, selectedFrameIds, ignoreHiddenLayers = false } = msg;

      console.log('Starting scan with progress tracking');
      console.log('Scan scope:', msg.scanScope);
      console.log('Selected frame IDs:', msg.selectedFrameIds);
      console.log('Scan entire page:', msg.scanEntirePage);
      console.log('Is rescan:', msg.isRescan || false);

      figma.ui.postMessage({ 
        type: 'scan-status', 
        message: `Scanning for ${scanType}...`
      });

      // If it's not scanning entire page, handle selection
      if (!scanEntirePage) {
        let frameIdsToUse: string[];
        
        if (msg.isRescan) {
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
        const refs = await valuesScanner.scanForMissingReferences(
          scanType as common.ScanType,
          frameIdsToUse,
          (progress) => {
            console.log(`Sending progress update: ${progress}%`);
            figma.ui.postMessage({ 
              type: 'scan-progress', 
              progress
            });
          },
          ignoreHiddenLayers
        );

        const groupedRefs = common.groupMissingReferences(refs);
        figma.ui.postMessage({ 
          type: 'missing-references-result', 
          scanType: scanType,
          references: groupedRefs 
        });
      } else {
        // Reset stored selections when scanning entire page
        lastSelectedFrameIds = [];
        initialScanSelection = [];
        
        // Perform scan for entire page
        const refs = await valuesScanner.scanForMissingReferences(
          scanType as common.ScanType,
          undefined,
          (progress) => {
            console.log(`Sending progress update: ${progress}%`);
            figma.ui.postMessage({ 
              type: 'scan-progress', 
              progress
            });
          },
          ignoreHiddenLayers
        );

        const groupedRefs = common.groupMissingReferences(refs);
        figma.ui.postMessage({ 
          type: 'missing-references-result', 
          scanType: scanType,
          references: groupedRefs 
        });
      }
    } catch (err) {
      console.error('Scan failed:', err);
      figma.ui.postMessage({ 
        type: 'error', 
        message: err instanceof Error ? err.message : 'Scan failed. Please try again.' 
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

  // Handle node selection
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

  // Get selected frame IDs
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
      // Type assertion to access the scan-variables message properties
      const { variableTypes, scanEntirePage, selectedFrameIds } = msg as ScanVariablesMessage;
      
      console.log('Starting variable scan:', {
        variableTypes,
        scanEntirePage,
        selectedFrameIds: selectedFrameIds?.length
      });
      
      // Start progress at 0
      figma.ui.postMessage({
        type: 'variable-scan-progress',
        progress: 0
      });
      
      // Perform the scan
      const scanVariable = async () => {
        try {
          // Get nodes to scan
          let nodesToScan: readonly SceneNode[] = [];
          
          if (scanEntirePage) {
            nodesToScan = figma.currentPage.children;
          } else if (Array.isArray(selectedFrameIds) && selectedFrameIds.length > 0) {
            // Get nodes by IDs
            const frameNodes = await Promise.all(
              selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
            );
            
            // Filter out any null values
            nodesToScan = frameNodes.filter((node): node is SceneNode => node !== null);
          } else {
            // Use current selection
            nodesToScan = figma.currentPage.selection.filter(node => 
              node.type === 'FRAME' || 
              node.type === 'COMPONENT' || 
              node.type === 'COMPONENT_SET' || 
              node.type === 'SECTION'
            );
          }
          
          // Load variables and collections
          const variables = await figma.variables.getLocalVariablesAsync();
          const collections = await figma.variables.getLocalVariableCollectionsAsync();
          
          // Create collection map for easy lookup
          const collectionMap = new Map(
            collections.map(collection => [collection.id, collection])
          );
          
          // Filter variables to match selected types
          const filteredVariables = variables.filter(variable => 
            variableTypes.includes(variable.resolvedType)
          );
          
          console.log(`Found ${filteredVariables.length} variables matching selected types`);
          
          // Set up progress tracking
          let processedNodes = 0;
          const totalNodes = nodesToScan.length;
          const linkedVariablesMap = new Map(); // Store linked variables and their usages
          
          // Process each node to find variable bindings
          for (const node of nodesToScan) {
            // Send progress updates every 10 nodes
            if (processedNodes % 10 === 0) {
              const progress = Math.min(95, Math.round((processedNodes / totalNodes) * 100));
              figma.ui.postMessage({
                type: 'variable-scan-progress',
                progress
              });
            }
            
            // Recursively process node and its children
            processNodeForVariables(node, filteredVariables, collectionMap, linkedVariablesMap);
            
            processedNodes++;
          }
          
          // Convert map to array for UI
          const linkedVariables = Array.from(linkedVariablesMap.values());
          
          // Send results to UI
          figma.ui.postMessage({
            type: 'variable-scan-results',
            data: {
              variables: linkedVariables,
              totalScanned: totalNodes,
              totalFound: linkedVariables.length
            }
          });
          
          console.log(`Variable scan complete: found ${linkedVariables.length} linked variables`);
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
      
      // Get all nodes with this variable binding
      const nodesWithVariable = figma.currentPage.findAll(node => {
        if (!('boundVariables' in node) || !node.boundVariables) return false;
        
        // Check if any binding uses this variable
        for (const binding of Object.values(node.boundVariables)) {
          // Check for variable bindings - ensure proper type checking
          if (binding && typeof binding === 'object' && 'id' in binding && binding.id === variableId) {
            return true;
          }
        }
        
        return false;
      });
      
      // Count how many nodes were actually unlinked
      let unlinkedCount = 0;
      
      // Unlink the variable from each node
      for (const node of nodesWithVariable) {
        if (!('boundVariables' in node) || !node.boundVariables) continue;
        
        // Find properties using this variable
        for (const [property, binding] of Object.entries(node.boundVariables)) {
          // Check for variable bindings with safer type checking
          if (binding && typeof binding === 'object' && 'id' in binding && binding.id === variableId) {
            // Type assertion for TypeScript to recognize property access
            const boundVars = node.boundVariables as Record<string, any>;
            // Remove this binding
            delete boundVars[property];
            unlinkedCount++;
          }
        }
      }
      
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


