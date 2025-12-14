// Gap Scanner Module
// Handles scanning for vertical and horizontal gaps in the document

import { MissingReference, ScanType, isNodeFromLibraryInstance, prepareLibraryInstanceFiltering } from '../common';
import { isScancelled } from './index';

// Extend MissingReference for gap-specific properties
interface GapReference extends MissingReference {
  gapType: 'vertical' | 'horizontal';
}

/**
 * Scan for both vertical and horizontal gaps in auto-layouts
 * 
 * @param scanType - Type of scan (gap)
 * @param selectedFrameIds - Array of frame IDs to scan
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<GapReference[]> - Array of references to gap values
 */
export async function scanForGap(
  scanType: 'gap',
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false
): Promise<GapReference[]> {
  console.log(`Starting ${scanType} scan - GAP SCANNER INITIALIZED`, {
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
    // Get selected nodes from IDs - supporting ALL node types that can have auto-layout
    const selectedNodes = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => 
      node !== null && 'type' in node && 
      // Include ALL SceneNode types that can be containers
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
      // Add the selected node itself if it can have auto-layout and is not within a library instance
      if ((selectedNode.type === 'FRAME' || selectedNode.type === 'COMPONENT' || selectedNode.type === 'INSTANCE') &&
          (!skipInstances || !isNodeFromLibraryInstance(selectedNode))) {
        nodesToScan.push(selectedNode);
      }
      
      // Add all auto-layout capable descendants if the node has children
      if ('children' in selectedNode && selectedNode.children.length > 0) {
        try {
          // Use findAll to get ALL descendant nodes that can have auto-layout
          const autoLayoutDescendants = selectedNode.findAll((node: SceneNode) => {
            // Apply visibility filter if needed
            if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
              return false;
            }
            if (skipInstances && isNodeFromLibraryInstance(node)) {
              return false;
            }
            // Only include nodes that can have auto-layout (itemSpacing property)
            return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
          });
          
          const filteredDescendants = skipInstances
            ? autoLayoutDescendants.filter(descendant => !isNodeFromLibraryInstance(descendant))
            : autoLayoutDescendants;

          console.log(`Adding ${filteredDescendants.length} auto-layout descendants from ${selectedNode.name}`);
          nodesToScan.push(...filteredDescendants);
        } catch (error) {
          console.warn(`Error collecting auto-layout descendants from ${selectedNode.name}:`, error);
        }
      }
    }
    
    console.log('Total auto-layout nodes to scan (including descendants):', nodesToScan.length);
  } else {
    // Fallback to current page - use findAll to get all auto-layout capable nodes
    nodesToScan = figma.currentPage.findAll((node: SceneNode) => {
      // Apply visibility filter if needed
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      if (skipInstances && isNodeFromLibraryInstance(node)) {
        return false;
      }
      // Only include nodes that can have auto-layout
      return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
    });
    console.log('Scanning entire page:', nodesToScan.length, 'auto-layout capable nodes');
  }

  if (skipInstances) {
    nodesToScan = nodesToScan.filter(node => !isNodeFromLibraryInstance(node));
  }

  if (nodesToScan.length === 0) {
    console.log('No eligible auto-layout nodes to scan after applying skipInstances filter.');
    progressCallback(1);
    return [];
  }
  
  // Check if scan was cancelled after getting nodes
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled after getting nodes`);
    return [];
  }
  
  // Results array
  const results: GapReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Total count for progress tracking
  let totalNodesProcessed = 0;
  let totalNodesToProcess = nodesToScan.length; // Now we know the exact count upfront
  
  console.log(`Found ${totalNodesToProcess} total auto-layout nodes to scan for ${scanType}`);
  
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
  
  // Helper function to check if the node is visible, considering parent visibility
  function getNodeVisibility(node: SceneNode): boolean {
    try {
      // Check if the node itself is visible
      if ('visible' in node && node.visible === false) {
        return false;
      }
      
      // Check parent visibility recursively
      let parent = node.parent;
      while (parent) {
        if ('visible' in parent && parent.visible === false) {
          return false;
        }
        parent = parent.parent;
      }
      
      return true;
    } catch (error) {
      console.warn(`Error checking visibility for node ${node.name}:`, error);
      // Default to true in case of errors
      return true;
    }
  }
  
  // Helper function to determine if we should include this node in results
  function shouldIncludeNode(node: SceneNode): boolean {
    // Skip if we've already processed this node
    if (processedNodeIds.has(node.id)) return false;
    
    // Skip if node is hidden and we're ignoring hidden layers
    if (ignoreHiddenLayers && 'visible' in node && !node.visible) return false;
    
    // Skip library-backed instances when configured
    if (skipInstances && isNodeFromLibraryInstance(node)) return false;
    
    // Only include auto-layout capable nodes
    return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
  }
  
  /**
   * Checks if a property on a node is a raw value (not bound to a variable)
   */
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
  
  // Process a single node (no longer recursive since we have all nodes in the flat list)
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) return;
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Update progress occasionally
    totalNodesProcessed++;
    if (totalNodesProcessed % 10 === 0 || totalNodesProcessed === totalNodesToProcess) {
      const progress = Math.min(totalNodesProcessed / totalNodesToProcess, 0.99);
      progressCallback(progress);
      
      // Only log occasionally to reduce console spam
      if (totalNodesProcessed % 50 === 0 || totalNodesProcessed === totalNodesToProcess) {
        console.log(`Processing gaps: ${totalNodesProcessed}/${totalNodesToProcess} nodes (${Math.round(progress * 100)}%)`);
      }
    }
    
    // Get node visibility for logging
    const isVisible = getNodeVisibility(node);
    
    // Check for auto layout frames with gaps
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      const frameNode = node as FrameNode | ComponentNode | InstanceNode;
      
      // Only process frames with auto layout
      if ('layoutMode' in frameNode && frameNode.layoutMode !== 'NONE') {
        const spacing = frameNode.itemSpacing;
        
        // If it has a spacing value and it's a raw value (not from a variable)
        if (spacing > 0 && isRawValue(node, 'itemSpacing')) {
          console.log(`Found raw gap in ${node.name}: ${spacing}, layout: ${frameNode.layoutMode}`);
          
          // Determine if it's vertical or horizontal gap based on layout mode
          const gapType = frameNode.layoutMode === 'VERTICAL' ? 'vertical' : 'horizontal';
          
          // Add to results
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property: 'itemSpacing',
            type: 'gap',
            currentValue: spacing,
            isVisible: isVisible,
            gapType: gapType
          });
        } else if (spacing > 0) {
          console.log(`Node ${node.name} has gap ${spacing} bound to a variable, skipping`);
        }
      }
    }
  }
  
  // Process all auto-layout nodes in the flat list (no longer recursive)
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
  
  console.log(`${scanType} scan complete. Found ${results.length} gap values.`);
  return results;
}

/**
 * Group gap scan results by type and value
 * 
 * @param results - Array of gap references to group
 * @returns Record<string, GapReference[]> - Grouped references
 */
export function groupGapResults(
  results: GapReference[]
): Record<string, GapReference[]> {
  const groups: Record<string, GapReference[]> = {};
  
  // Group by gap value and type
  results.forEach(result => {
    // Create a unique key for this gap value and type
    const gapType = result.gapType;
    const groupKey = `${gapType}-gap-${result.currentValue}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
} 