// Gap Scanner Module
// Handles scanning for vertical and horizontal gaps in the document

import { MissingReference, ScanType } from '../common';
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
  ignoreHiddenLayers: boolean = false
): Promise<GapReference[]> {
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
  const results: GapReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Recursively count nodes for accurate progress reporting
  function countNodes(nodes: readonly SceneNode[]): number {
    let count = nodes.length;
    for (const node of nodes) {
      if (isScancelled()) break;
      
      if ('children' in node) {
        count += countNodes(node.children);
      }
    }
    return count;
  }
  
  // Count total nodes to process for better progress reporting
  let totalNodesProcessed = 0;
  let totalNodesToProcess = countNodes(nodesToScan);
  console.log(`Total nodes to process: ${totalNodesToProcess}`);
  
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
    if (ignoreHiddenLayers && 'visible' in node) {
      if (node.visible === false) {
        return false;
      }
    }
    
    return true;
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
  
  // Recursively process nodes
  async function processNodes(nodes: readonly SceneNode[]) {
    // Check if scan was cancelled
    if (isScancelled()) return;
    
    for (const node of nodes) {
      // Check if scan was cancelled
      if (isScancelled()) break;
      
      // Update progress
      totalNodesProcessed++;
      if (totalNodesProcessed % 50 === 0) {
        progressCallback(Math.min(totalNodesProcessed / totalNodesToProcess, 0.99));
      }
      
      // Determine if this node should be included in the results
      const includeNode = shouldIncludeNode(node);
      
      // Get node visibility for logging
      const isVisible = getNodeVisibility(node);
      
      // Process this node if it meets our criteria
      if (includeNode) {
        // Mark this node as processed
        processedNodeIds.add(node.id);
        
        // Check for auto layout frames with gaps
        if (node.type === 'FRAME') {
          const frameNode = node as FrameNode;
          
          // Only process frames with auto layout
          if (frameNode.layoutMode !== 'NONE') {
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
            }
          }
        }
      }
      
      // Always process children regardless of whether this node matched
      // This ensures we find all gaps in nested components
      if ('children' in node) {
        await processNodes(node.children);
      }
    }
  }
  
  // Start processing nodes
  await processNodes(nodesToScan);
  
  // Check if scan was cancelled after processing
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled during processing`);
    return [];
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