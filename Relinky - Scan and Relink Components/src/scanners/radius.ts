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
  ignoreHiddenLayers: boolean = false
): Promise<RadiusReference[]> {
  console.log(`Starting ${scanType} scan`);
  
  // Check if scan was cancelled before starting
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled before starting`);
    return [];
  }
  
  // Get nodes to scan
  let nodesToScan: SceneNode[] = [];
  
  // Determine which nodes to scan
  if (selectedFrameIds && selectedFrameIds.length > 0) {
    // Get selected nodes from IDs
    nodesToScan = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => node !== null && 'type' in node));
    
    console.log('Scanning selected frames:', nodesToScan.length, 'nodes');
  } else {
    // Fallback to current page
    nodesToScan = Array.from(figma.currentPage.children);
    console.log('Scanning entire page:', nodesToScan.length, 'top-level nodes');
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
  let totalNodesToProcess = nodesToScan.length;
  
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
    
    // Include nodes with cornerRadius property
    if (node.type === 'RECTANGLE' || 
        node.type === 'FRAME' || 
        node.type === 'COMPONENT' || 
        node.type === 'INSTANCE') {
      return true;
    }
    
    return false;
  }
  
  // Helper function to check and process a node for corner radius
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) return;
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Check if node supports corner radius
    if (node.type === 'RECTANGLE' || 
        node.type === 'FRAME' || 
        node.type === 'COMPONENT' || 
        node.type === 'INSTANCE') {
      
      // Cast to the appropriate type
      const shapeNode = node as RectangleNode | FrameNode | ComponentNode | InstanceNode;
      
      // Handle uniform cornerRadius
      if (shapeNode.cornerRadius !== undefined && shapeNode.cornerRadius !== null && typeof shapeNode.cornerRadius === 'number' && shapeNode.cornerRadius > 0) {
        results.push({
          nodeId: shapeNode.id,
          nodeName: shapeNode.name,
          location: getNodePath(shapeNode),
          property: 'cornerRadius',
          type: 'cornerRadius',
          currentValue: shapeNode.cornerRadius,
          isVisible: shapeNode.visible !== false,
          // Additional metadata to help with filtering
          topLeftRadius: shapeNode.topLeftRadius || 0,
          topRightRadius: shapeNode.topRightRadius || 0,
          bottomLeftRadius: shapeNode.bottomLeftRadius || 0,
          bottomRightRadius: shapeNode.bottomRightRadius || 0
        });
      } 
      // Handle individual corner radii
      else if (shapeNode.topLeftRadius !== undefined || 
               shapeNode.topRightRadius !== undefined || 
               shapeNode.bottomLeftRadius !== undefined || 
               shapeNode.bottomRightRadius !== undefined) {
        
        // Check top-left radius
        if (shapeNode.topLeftRadius !== undefined && shapeNode.topLeftRadius !== null && typeof shapeNode.topLeftRadius === 'number' && shapeNode.topLeftRadius > 0) {
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'topLeftRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.topLeftRadius,
            isVisible: shapeNode.visible !== false,
            // Additional metadata to help with filtering
            topLeftRadius: shapeNode.topLeftRadius,
            topRightRadius: shapeNode.topRightRadius || 0,
            bottomLeftRadius: shapeNode.bottomLeftRadius || 0,
            bottomRightRadius: shapeNode.bottomRightRadius || 0
          });
        }
        
        // Check top-right radius
        if (shapeNode.topRightRadius !== undefined && shapeNode.topRightRadius !== null && typeof shapeNode.topRightRadius === 'number' && shapeNode.topRightRadius > 0) {
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'topRightRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.topRightRadius,
            isVisible: shapeNode.visible !== false,
            // Additional metadata to help with filtering
            topLeftRadius: shapeNode.topLeftRadius || 0,
            topRightRadius: shapeNode.topRightRadius,
            bottomLeftRadius: shapeNode.bottomLeftRadius || 0,
            bottomRightRadius: shapeNode.bottomRightRadius || 0
          });
        }
        
        // Check bottom-left radius
        if (shapeNode.bottomLeftRadius !== undefined && shapeNode.bottomLeftRadius !== null && typeof shapeNode.bottomLeftRadius === 'number' && shapeNode.bottomLeftRadius > 0) {
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'bottomLeftRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.bottomLeftRadius,
            isVisible: shapeNode.visible !== false,
            // Additional metadata to help with filtering
            topLeftRadius: shapeNode.topLeftRadius || 0,
            topRightRadius: shapeNode.topRightRadius || 0,
            bottomLeftRadius: shapeNode.bottomLeftRadius,
            bottomRightRadius: shapeNode.bottomRightRadius || 0
          });
        }
        
        // Check bottom-right radius
        if (shapeNode.bottomRightRadius !== undefined && shapeNode.bottomRightRadius !== null && typeof shapeNode.bottomRightRadius === 'number' && shapeNode.bottomRightRadius > 0) {
          results.push({
            nodeId: shapeNode.id,
            nodeName: shapeNode.name,
            location: getNodePath(shapeNode),
            property: 'bottomRightRadius',
            type: 'cornerRadius',
            currentValue: shapeNode.bottomRightRadius,
            isVisible: shapeNode.visible !== false,
            // Additional metadata to help with filtering
            topLeftRadius: shapeNode.topLeftRadius || 0,
            topRightRadius: shapeNode.topRightRadius || 0,
            bottomLeftRadius: shapeNode.bottomLeftRadius || 0,
            bottomRightRadius: shapeNode.bottomRightRadius
          });
        }
      }
    }
    
    // Process children recursively
    if ('children' in node) {
      for (const child of node.children) {
        processNode(child as SceneNode);
      }
    }
  }
  
  // Process all nodes
  for (const node of nodesToScan) {
    // Check if scan was cancelled
    if (isScancelled()) {
      console.log(`${scanType} scan cancelled during processing`);
      return [];
    }
    
    processNode(node);
    
    // Update progress
    totalNodesProcessed++;
    const progress = totalNodesProcessed / totalNodesToProcess;
    progressCallback(progress > 1 ? 1 : progress);
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