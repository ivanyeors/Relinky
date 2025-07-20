// Corner Radius Scanner Module
// Handles scanning for corner radius in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

// Extend MissingReference for corner-radius-specific properties
interface RadiusReference extends MissingReference {
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomLeftRadius?: number;
  bottomRightRadius?: number;
}

/**
 * Scan for corner radius
 * 
 * @param scanType - Type of scan ('corner-radius')
 * @param selectedFrameIds - Array of frame IDs to scan
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<RadiusReference[]> - Array of references to corner radius values
 */
export async function scanForCornerRadius(
  scanType: 'corner-radius',
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false
): Promise<RadiusReference[]> {
  console.log(`Starting ${scanType} scan - RADIUS SCANNER INITIALIZED`, {
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
    // Get selected nodes from IDs - supporting ALL node types that can have corner radius
    const selectedNodes = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => 
      node !== null && 'type' in node && 
      // Include ALL SceneNode types that can be containers or shapes
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
      // Add the selected node itself if it can have corner radius
      if (selectedNode.type === 'RECTANGLE' || 
          selectedNode.type === 'FRAME' || 
          selectedNode.type === 'COMPONENT' || 
          selectedNode.type === 'INSTANCE' ||
          selectedNode.type === 'ELLIPSE' ||
          selectedNode.type === 'POLYGON' ||
          selectedNode.type === 'STAR' ||
          selectedNode.type === 'VECTOR') {
        nodesToScan.push(selectedNode);
      }
      
      // Add all radius-capable descendants if the node has children
      if ('children' in selectedNode && selectedNode.children.length > 0) {
        try {
          // Use findAll to get ALL descendant nodes that can have corner radius
          const radiusDescendants = selectedNode.findAll((node: SceneNode) => {
            // Apply visibility filter if needed
            if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
              return false;
            }
            // Include all nodes that can have corner radius properties
            return node.type === 'RECTANGLE' || 
                   node.type === 'FRAME' || 
                   node.type === 'COMPONENT' || 
                   node.type === 'INSTANCE' ||
                   node.type === 'ELLIPSE' ||
                   node.type === 'POLYGON' ||
                   node.type === 'STAR' ||
                   node.type === 'VECTOR';
          });
          
          console.log(`Adding ${radiusDescendants.length} radius-capable descendants from ${selectedNode.name}`);
          nodesToScan.push(...radiusDescendants);
        } catch (error) {
          console.warn(`Error collecting radius descendants from ${selectedNode.name}:`, error);
        }
      }
    }
    
    console.log('Total radius-capable nodes to scan (including descendants):', nodesToScan.length);
  } else {
    // Fallback to current page - use findAll to get all radius-capable nodes
    nodesToScan = figma.currentPage.findAll((node: SceneNode) => {
      // Apply visibility filter if needed
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      // Include all nodes that can have corner radius
      return node.type === 'RECTANGLE' || 
             node.type === 'FRAME' || 
             node.type === 'COMPONENT' || 
             node.type === 'INSTANCE' ||
             node.type === 'ELLIPSE' ||
             node.type === 'POLYGON' ||
             node.type === 'STAR' ||
             node.type === 'VECTOR';
    });
    console.log('Scanning entire page:', nodesToScan.length, 'radius-capable nodes');
  }
  
  // Check if scan was cancelled after getting nodes
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled after getting nodes`);
    return [];
  }
  
  // Results array
  const results: RadiusReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Total count for progress tracking
  let totalNodesProcessed = 0;
  let totalNodesToProcess = nodesToScan.length; // Now we know the exact count upfront
  
  console.log(`Found ${totalNodesToProcess} total radius-capable nodes to scan for ${scanType}`);
  
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
    
    // Include nodes with cornerRadius property
    return node.type === 'RECTANGLE' || 
           node.type === 'FRAME' || 
           node.type === 'COMPONENT' || 
           node.type === 'INSTANCE' ||
           node.type === 'ELLIPSE' ||
           node.type === 'POLYGON' ||
           node.type === 'STAR' ||
           node.type === 'VECTOR';
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
        console.log(`Processing radius: ${totalNodesProcessed}/${totalNodesToProcess} nodes (${Math.round(progress * 100)}%)`);
      }
    }
    
    // Check if node supports corner radius
    if (node.type === 'RECTANGLE' || 
        node.type === 'FRAME' || 
        node.type === 'COMPONENT' || 
        node.type === 'INSTANCE' ||
        node.type === 'ELLIPSE' ||
        node.type === 'POLYGON' ||
        node.type === 'STAR' ||
        node.type === 'VECTOR') {
      
      // Handle uniform cornerRadius (supported by most shape types)
      if ('cornerRadius' in node && 
          node.cornerRadius !== undefined && 
          node.cornerRadius !== null && 
          typeof node.cornerRadius === 'number' && 
          node.cornerRadius > 0 &&
          isRawValue(node, 'cornerRadius')) {
        
        console.log(`Found raw uniform corner radius in ${node.name}: ${node.cornerRadius}px`);
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          location: getNodePath(node),
          property: 'cornerRadius',
          type: 'cornerRadius',
          currentValue: node.cornerRadius,
          isVisible: node.visible !== false,
          // Safely access individual radius properties if they exist
          topLeftRadius: ('topLeftRadius' in node ? node.topLeftRadius : undefined) || 0,
          topRightRadius: ('topRightRadius' in node ? node.topRightRadius : undefined) || 0,
          bottomLeftRadius: ('bottomLeftRadius' in node ? node.bottomLeftRadius : undefined) || 0,
          bottomRightRadius: ('bottomRightRadius' in node ? node.bottomRightRadius : undefined) || 0
        });
      } 
      // Handle individual corner radii (mainly for rectangles and frames)
      else if (node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        const shapeNode = node as RectangleNode | FrameNode | ComponentNode | InstanceNode;
        
        // Check top-left radius
        if (shapeNode.topLeftRadius !== undefined && 
            shapeNode.topLeftRadius !== null && 
            typeof shapeNode.topLeftRadius === 'number' && 
            shapeNode.topLeftRadius > 0 &&
            isRawValue(node, 'topLeftRadius')) {
          
          console.log(`Found raw top-left radius in ${shapeNode.name}: ${shapeNode.topLeftRadius}px`);
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'topLeftRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.topLeftRadius,
            isVisible: shapeNode.visible !== false,
            topLeftRadius: shapeNode.topLeftRadius,
            topRightRadius: shapeNode.topRightRadius || 0,
            bottomLeftRadius: shapeNode.bottomLeftRadius || 0,
            bottomRightRadius: shapeNode.bottomRightRadius || 0
          });
        }
        
        // Check top-right radius
        if (shapeNode.topRightRadius !== undefined && 
            shapeNode.topRightRadius !== null && 
            typeof shapeNode.topRightRadius === 'number' && 
            shapeNode.topRightRadius > 0 &&
            isRawValue(node, 'topRightRadius')) {
          
          console.log(`Found raw top-right radius in ${shapeNode.name}: ${shapeNode.topRightRadius}px`);
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'topRightRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.topRightRadius,
            isVisible: shapeNode.visible !== false,
            topLeftRadius: shapeNode.topLeftRadius || 0,
            topRightRadius: shapeNode.topRightRadius,
            bottomLeftRadius: shapeNode.bottomLeftRadius || 0,
            bottomRightRadius: shapeNode.bottomRightRadius || 0
          });
        }
        
        // Check bottom-left radius
        if (shapeNode.bottomLeftRadius !== undefined && 
            shapeNode.bottomLeftRadius !== null && 
            typeof shapeNode.bottomLeftRadius === 'number' && 
            shapeNode.bottomLeftRadius > 0 &&
            isRawValue(node, 'bottomLeftRadius')) {
          
          console.log(`Found raw bottom-left radius in ${shapeNode.name}: ${shapeNode.bottomLeftRadius}px`);
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'bottomLeftRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.bottomLeftRadius,
            isVisible: shapeNode.visible !== false,
            topLeftRadius: shapeNode.topLeftRadius || 0,
            topRightRadius: shapeNode.topRightRadius || 0,
            bottomLeftRadius: shapeNode.bottomLeftRadius,
            bottomRightRadius: shapeNode.bottomRightRadius || 0
          });
        }
        
        // Check bottom-right radius
        if (shapeNode.bottomRightRadius !== undefined && 
            shapeNode.bottomRightRadius !== null && 
            typeof shapeNode.bottomRightRadius === 'number' && 
            shapeNode.bottomRightRadius > 0 &&
            isRawValue(node, 'bottomRightRadius')) {
          
          console.log(`Found raw bottom-right radius in ${shapeNode.name}: ${shapeNode.bottomRightRadius}px`);
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'bottomRightRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.bottomRightRadius,
            isVisible: shapeNode.visible !== false,
            topLeftRadius: shapeNode.topLeftRadius || 0,
            topRightRadius: shapeNode.topRightRadius || 0,
            bottomLeftRadius: shapeNode.bottomLeftRadius || 0,
            bottomRightRadius: shapeNode.bottomRightRadius
          });
        }
      }
    }
  }
  
  // Process all radius-capable nodes in the flat list (no longer recursive)
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
  
  console.log(`${scanType} scan complete. Found ${results.length} corner radius values.`);
  return results;
}

/**
 * Group corner radius scan results by type and value
 * 
 * @param results - Array of corner radius references to group
 * @returns Record<string, RadiusReference[]> - Grouped references
 */
export function groupCornerRadiusResults(
  results: RadiusReference[]
): Record<string, RadiusReference[]> {
  const groups: Record<string, RadiusReference[]> = {};
  
  // Group by radius type and value
  results.forEach(result => {
    // Determine which type of corner radius this is
    const radiusType = result.property.includes('top') 
      ? result.property.includes('Right') ? 'top-right' 
      : 'top-left'
      : result.property.includes('Right') ? 'bottom-right'
      : 'bottom-left';
    
    // Create a group key based on the radius value
    const groupKey = `cornerRadius-${radiusType}-${result.currentValue}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
}

// Check if a property value is greater than 0
function hasPositiveValue(value: number | VariableAlias | undefined): boolean {
  if (typeof value === 'number') {
    return value > 0;
  }
  // If it's a variable alias or undefined, we can't determine the value
  return false;
} 