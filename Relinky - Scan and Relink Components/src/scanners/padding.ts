// Padding Scanner Module
// Handles scanning for horizontal and vertical padding in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

// Extend MissingReference for padding-specific properties
interface PaddingReference extends MissingReference {
  paddingType?: 'left' | 'right' | 'top' | 'bottom';
  groupKey?: string;
}

/**
 * Scan for horizontal and vertical padding
 * 
 * @param scanType - Type of scan ('horizontal-padding' or 'vertical-padding')
 * @param selectedFrameIds - Array of frame IDs to scan
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<PaddingReference[]> - Array of references to padding values
 */
export async function scanForPadding(
  scanType: 'horizontal-padding' | 'vertical-padding',
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false
): Promise<PaddingReference[]> {
  console.log(`Starting ${scanType} scan - PADDING SCANNER INITIALIZED`, {
    selectedFrameIds: selectedFrameIds.length,
    ignoreHiddenLayers
  });
  
  // Check if scan was cancelled before starting
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled before starting`);
    return [];
  }
  
  // Get nodes to scan
  let nodesToScan: SceneNode[] = [];
  
  // Determine which nodes to scan
  if (selectedFrameIds && selectedFrameIds.length > 0) {
    // Get selected nodes from IDs - supporting ALL node types that can have padding
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
      // Add the selected node itself if it can have padding
      if (selectedNode.type === 'FRAME' || selectedNode.type === 'COMPONENT' || selectedNode.type === 'INSTANCE') {
        nodesToScan.push(selectedNode);
      }
      
      // Add all padding-capable descendants if the node has children
      if ('children' in selectedNode && selectedNode.children.length > 0) {
        try {
          // Use findAll to get ALL descendant nodes that can have padding
          const paddingDescendants = selectedNode.findAll((node: SceneNode) => {
            // Apply visibility filter if needed
            if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
              return false;
            }
            // Only include nodes that can have padding properties
            return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
          });
          
          console.log(`Adding ${paddingDescendants.length} padding-capable descendants from ${selectedNode.name}`);
          nodesToScan.push(...paddingDescendants);
        } catch (error) {
          console.warn(`Error collecting padding descendants from ${selectedNode.name}:`, error);
        }
      }
    }
    
    console.log('Total padding-capable nodes to scan (including descendants):', nodesToScan.length);
  } else {
    // Fallback to current page - use findAll to get all padding-capable nodes
    nodesToScan = figma.currentPage.findAll((node: SceneNode) => {
      // Apply visibility filter if needed
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      // Only include nodes that can have padding
      return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
    });
    console.log('Scanning entire page:', nodesToScan.length, 'padding-capable nodes');
  }
  
  // Check if scan was cancelled after getting nodes
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled after getting nodes`);
    return [];
  }
  
  // Results array
  const results: PaddingReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Total count for progress tracking
  let totalNodesProcessed = 0;
  let totalNodesToProcess = nodesToScan.length; // Now we know the exact count upfront
  
  console.log(`Found ${totalNodesToProcess} total padding-capable nodes to scan for ${scanType}`);
  
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
    
    // Skip instances if skipInstances is true
    if (skipInstances && node.type === 'INSTANCE') return false;
    
    // Include frames, components, and instances that can have padding
    return node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
  }
  
  // Helper function to check if a property is bound to a variable
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
        console.log(`Processing padding: ${totalNodesProcessed}/${totalNodesToProcess} nodes (${Math.round(progress * 100)}%)`);
      }
    }
    
    // Check if it's a frame-like node with padding
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      const frame = node as FrameNode | ComponentNode | InstanceNode;
      
      if (scanType === 'horizontal-padding') {
        // Check horizontal padding
        const leftPadding = frame.paddingLeft || 0;
        const rightPadding = frame.paddingRight || 0;
        
        // Add left padding to results if present and raw
        if (leftPadding > 0 && isRawValue(node, 'paddingLeft')) {
          console.log(`Found raw left padding in ${frame.name}: ${leftPadding}px`);
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingLeft',
            type: 'horizontalPadding',
            currentValue: leftPadding,
            paddingType: 'left',
            isVisible: frame.visible !== false
          });
        } else if (leftPadding > 0) {
          console.log(`Node ${frame.name} has left padding ${leftPadding} bound to a variable, skipping`);
        }
        
        // Add right padding to results if present and raw
        if (rightPadding > 0 && isRawValue(node, 'paddingRight')) {
          console.log(`Found raw right padding in ${frame.name}: ${rightPadding}px`);
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingRight',
            type: 'horizontalPadding',
            currentValue: rightPadding,
            paddingType: 'right',
            isVisible: frame.visible !== false
          });
        } else if (rightPadding > 0) {
          console.log(`Node ${frame.name} has right padding ${rightPadding} bound to a variable, skipping`);
        }
      } else if (scanType === 'vertical-padding') {
        // Check vertical padding
        const topPadding = frame.paddingTop || 0;
        const bottomPadding = frame.paddingBottom || 0;
        
        // Add top padding to results if present and raw
        if (topPadding > 0 && isRawValue(node, 'paddingTop')) {
          console.log(`Found raw top padding in ${frame.name}: ${topPadding}px`);
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingTop',
            type: 'verticalPadding',
            currentValue: topPadding,
            paddingType: 'top',
            isVisible: frame.visible !== false
          });
        } else if (topPadding > 0) {
          console.log(`Node ${frame.name} has top padding ${topPadding} bound to a variable, skipping`);
        }
        
        // Add bottom padding to results if present and raw
        if (bottomPadding > 0 && isRawValue(node, 'paddingBottom')) {
          console.log(`Found raw bottom padding in ${frame.name}: ${bottomPadding}px`);
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingBottom',
            type: 'verticalPadding',
            currentValue: bottomPadding,
            paddingType: 'bottom',
            isVisible: frame.visible !== false
          });
        } else if (bottomPadding > 0) {
          console.log(`Node ${frame.name} has bottom padding ${bottomPadding} bound to a variable, skipping`);
        }
      }
    }
  }
  
  // Process all padding-capable nodes in the flat list (no longer recursive)
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
  
  console.log(`${scanType} scan complete. Found ${results.length} padding values.`);
  return results;
}

/**
 * Group padding scan results by type and value
 * 
 * @param results - Array of padding references to group
 * @returns Record<string, PaddingReference[]> - Grouped references
 */
export function groupPaddingResults(
  results: PaddingReference[]
): Record<string, PaddingReference[]> {
  const groups: Record<string, PaddingReference[]> = {};
  
  // Group by padding type and value
  results.forEach(result => {
    // Use predefined groupKey if available
    const groupKey = result.groupKey || `${result.type}-${result.paddingType || 'unknown'}-${result.currentValue}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
} 