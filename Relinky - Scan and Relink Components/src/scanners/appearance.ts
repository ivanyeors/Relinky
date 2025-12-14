// Appearance Scanner Module
// Handles scanning for element opacity values in the document

import { MissingReference, ScanType, isNodeFromLibraryInstance, prepareLibraryInstanceFiltering } from '../common';
import { isScancelled } from './index';

// Extend MissingReference for appearance-specific properties
interface AppearanceReference extends MissingReference {
  appearanceType: 'element-opacity';
  rawValue?: number; // Store the original decimal value
}

/**
 * Scan for element opacity values in the document
 * 
 * @param scanType - Type of scan ('opacity')
 * @param selectedFrameIds - Array of node IDs to scan (can include frames, components, groups, etc.)
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<AppearanceReference[]> - Array of references to element opacity values
 */
export async function scanForAppearance(
  scanType: 'opacity',
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false
): Promise<AppearanceReference[]> {
  console.log(`Starting ${scanType} scan - APPEARANCE SCANNER INITIALIZED`, {
    selectedFrameIds: selectedFrameIds.length,
    ignoreHiddenLayers
  });
  
  // Check if scan was cancelled before starting
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled before starting`);
    return [];
  }
  
  await prepareLibraryInstanceFiltering(skipInstances);
  
  // Get nodes to scan
  let nodesToScan: SceneNode[] = [];
  
  // Determine which nodes to scan
  if (selectedFrameIds && selectedFrameIds.length > 0) {
    // Get selected nodes from IDs - now supporting ALL node types that can have opacity
    const selectedNodes = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => 
      node !== null && 'type' in node && 
      // Include ALL SceneNode types that can have opacity
      (node.type === 'FRAME' || 
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
       node.type === 'CODE_BLOCK')
    ));
    
    console.log('Found selected nodes:', selectedNodes.length, 'nodes of types:', selectedNodes.map(n => n.type).join(', '));
    
    // Collect ALL nodes to scan (including all descendants)
    for (const selectedNode of selectedNodes) {
      // Add the selected node itself when not within a library instance
      if (!skipInstances || !isNodeFromLibraryInstance(selectedNode)) {
        nodesToScan.push(selectedNode);
      }
      
      // Add all descendants if the node has children and meets visibility criteria
      if ('children' in selectedNode && selectedNode.children.length > 0) {
        try {
          // Use findAll to get ALL descendant nodes
          const descendants = selectedNode.findAll((node: SceneNode) => {
            // Apply visibility filter if needed
            if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
              return false;
            }
            if (skipInstances && isNodeFromLibraryInstance(node)) {
              return false;
            }
            // Include all SceneNode types that can have opacity
            return 'opacity' in node;
          });
          
          const filteredDescendants = skipInstances
            ? descendants.filter(descendant => !isNodeFromLibraryInstance(descendant))
            : descendants;

          console.log(`Adding ${filteredDescendants.length} descendants from ${selectedNode.name}`);
          nodesToScan.push(...filteredDescendants);
        } catch (error) {
          console.warn(`Error collecting descendants from ${selectedNode.name}:`, error);
        }
      }
    }
    
    console.log('Total nodes to scan (including descendants):', nodesToScan.length);
  } else {
    // Fallback to current page - use findAll to get all nodes
    nodesToScan = figma.currentPage.findAll((node: SceneNode) => {
      // Apply visibility filter if needed
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      if (skipInstances && isNodeFromLibraryInstance(node)) {
        return false;
      }
      // Include all nodes that can have opacity
      return 'opacity' in node;
    });
    console.log('Scanning entire page:', nodesToScan.length, 'nodes with opacity capability');
  }

  if (skipInstances) {
    nodesToScan = nodesToScan.filter(node => !isNodeFromLibraryInstance(node));
  }

  if (nodesToScan.length === 0) {
    console.log('No eligible nodes with opacity to scan after applying skipInstances filter.');
    progressCallback(1);
    return [];
  }
  
  // Check if scan was cancelled after getting nodes
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled after getting nodes`);
    return [];
  }
  
  // Results array
  const results: AppearanceReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Total count for progress tracking
  let totalNodesProcessed = 0;
  let totalNodesToProcess = nodesToScan.length; // Now we know the exact count upfront
  
  console.log(`Found ${totalNodesToProcess} total nodes to scan for ${scanType}`);
  
  // Helper function to get a readable path for a node
  function getNodePath(node: BaseNode): string {
    const parts: string[] = [];
    let current: BaseNode | null = node;
    
    while (current && current.id !== figma.currentPage.id) {
      parts.unshift(current.name || current.id);
      current = current.parent;
    }
    
    return parts.join(' > ');
  }
  
  // Helper function to determine if we should include this node in results
  function shouldIncludeNode(node: SceneNode): boolean {
    // Skip if we've already processed this node
    if (processedNodeIds.has(node.id)) return false;
    
    // Skip if node is hidden and we're ignoring hidden layers
    if (ignoreHiddenLayers && 'visible' in node && !node.visible) return false;
    
    // Skip library-backed instances when configured
    if (skipInstances && isNodeFromLibraryInstance(node)) return false;
    
    return true;
  }
  
  // Check if a property on a node is a raw value (not bound to a variable)
  function isRawValue(node: SceneNode, propertyName: string): boolean {
    try {
      // Make sure the node has boundVariables property
      if ('boundVariables' in node) {
        // If there are no bound variables at all, it's definitely a raw value
        if (!node.boundVariables) {
          return true;
        }
        
        // Type-safe check if the property is not in boundVariables
        // @ts-ignore - Figma API doesn't provide complete typings for all possible property names
        const boundVariable = node.boundVariables[propertyName];
        if (!boundVariable) {
          return true;
        }
        
        // The property is bound to something, so it's not a raw value
        return false;
      }
      
      // If the node doesn't have boundVariables property at all, 
      // it's using raw values by definition
      return true;
    } catch (error) {
      console.warn(`Error checking if ${propertyName} is raw on node ${node.name}:`, error);
      // Default to true in case of errors - better to report potentially false positives
      return true;
    }
  }
  
  // Process a single node - FOCUS ONLY ON ELEMENT OPACITY (no longer recursive)
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) return;
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Update progress more frequently (every 10 nodes instead of every 50)
    totalNodesProcessed++;
    if (totalNodesProcessed % 10 === 0 || totalNodesProcessed === totalNodesToProcess) {
      const progress = Math.min(totalNodesProcessed / totalNodesToProcess, 0.99);
      progressCallback(progress);
      
      // Only log occasionally to reduce console spam
      if (totalNodesProcessed % 50 === 0 || totalNodesProcessed === totalNodesToProcess) {
        console.log(`Processing opacity: ${totalNodesProcessed}/${totalNodesToProcess} nodes (${Math.round(progress * 100)}%)`);
      }
    }
    
    // Check element opacity - ONLY FOCUS ON THIS
    if ('opacity' in node && typeof node.opacity === 'number') {
      // Debug log the opacity value
      console.log(`Found opacity value ${node.opacity} on node ${node.name} (${node.type})`);
      
      // Check if opacity has a variable binding
      if (isRawValue(node, 'opacity')) {
        // Convert opacity to percentage string
        const opacityPercent = Math.round(node.opacity * 100);
        const opacityDisplay = `${opacityPercent}%`;
        
        console.log(`Node ${node.name} has raw opacity value: ${node.opacity} (displayed as: ${opacityDisplay})`);
        
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          location: getNodePath(node),
          property: 'opacity',
          type: 'opacity',
          currentValue: opacityDisplay, // Store as percentage string
          rawValue: node.opacity, // Store original value for reference
          isVisible: node.visible !== false,
          appearanceType: 'element-opacity'
        });
      } else {
        console.log(`Node ${node.name} has opacity ${node.opacity} bound to a variable, skipping`);
      }
    }
  }
  
  // Process all nodes in the flat list (no longer recursive)
  for (const node of nodesToScan) {
    // Check if scan was cancelled
    if (isScancelled()) {
      console.log(`${scanType} scan cancelled during processing`);
      return [];
    }
    
    processNode(node);
  }
  
  // Set progress to 100% when done
  progressCallback(1);
  
  console.log(`${scanType} scan complete. Found ${results.length} element opacity values.`);
  return results;
}

/**
 * Group appearance scan results by type and value
 * 
 * @param results - Array of appearance references to group
 * @returns Record<string, AppearanceReference[]> - Grouped references
 */
export function groupAppearanceResults(
  results: AppearanceReference[]
): Record<string, AppearanceReference[]> {
  const groups: Record<string, AppearanceReference[]> = {};
  
  // Group by opacity value
  results.forEach(result => {
    // Get the display value (which should already be a percentage string)
    const opacityDisplay = result.currentValue as string;
    
    // Create a group key based on the appearance type and percentage value
    const groupKey = `element-opacity-${opacityDisplay}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
} 