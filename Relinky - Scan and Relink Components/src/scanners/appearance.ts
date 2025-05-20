// Appearance Scanner Module
// Handles scanning for element opacity values in the document

import { MissingReference, ScanType } from '../common';
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
  ignoreHiddenLayers: boolean = false
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
  
  // Get nodes to scan
  let nodesToScan: SceneNode[] = [];
  
  // Determine which nodes to scan
  if (selectedFrameIds && selectedFrameIds.length > 0) {
    // Get selected nodes from IDs - now supporting all node types
    nodesToScan = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => 
      node !== null && 'type' in node && 
      (node.type === 'FRAME' || 
       node.type === 'COMPONENT' || 
       node.type === 'COMPONENT_SET' ||
       node.type === 'INSTANCE' ||
       node.type === 'GROUP' ||
       node.type === 'SECTION')
    ));
    
    console.log('Scanning selected nodes:', nodesToScan.length, 'nodes of types:', nodesToScan.map(n => n.type).join(', '));
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
  const results: AppearanceReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Total count for progress tracking
  let totalNodesProcessed = 0;
  let totalNodesToProcess = 0;
  
  // Count total nodes to process for progress calculation
  const countNodes = (node: SceneNode): number => {
    let count = 1;
    if ('children' in node) {
      for (const child of node.children) {
        count += countNodes(child as SceneNode);
      }
    }
    return count;
  };
  
  // Calculate total nodes for progress reporting
  for (const node of nodesToScan) {
    totalNodesToProcess += countNodes(node);
  }
  
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
  
  // Process a single node - FOCUS ONLY ON ELEMENT OPACITY
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) return;
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Update progress occasionally
    totalNodesProcessed++;
    if (totalNodesProcessed % 100 === 0) {
      const progress = Math.min(totalNodesProcessed / totalNodesToProcess, 0.99);
      progressCallback(progress);
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
    
    // Process children recursively
    if ('children' in node) {
      for (const child of node.children) {
        processNode(child as SceneNode);
      }
    }
  }
  
  // Process all root nodes
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