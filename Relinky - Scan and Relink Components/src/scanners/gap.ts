// Gap Scanner Module
// Handles scanning for vertical and horizontal gaps in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled, getFontFamilyFromNode, getFontWeightFromNode } from './index';

// Extend MissingReference for gap-specific properties
interface GapReference extends MissingReference {
  gapType?: 'vertical' | 'horizontal';
}

/**
 * Scan for vertical and horizontal gaps
 * 
 * @param scanType - Type of scan (vertical-gap)
 * @param selectedFrameIds - Array of frame IDs to scan
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<GapReference[]> - Array of references to gap values
 */
export async function scanForGap(
  scanType: 'vertical-gap',
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
    
    // Include auto layout frames with gap
    if (node.type === 'FRAME' && 'layoutMode' in node && node.layoutMode !== 'NONE') {
      return true;
    }
    
    return false;
  }
  
  // Helper function to check and process a node for gaps
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) return;
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Check if it's an auto layout frame
    if (node.type === 'FRAME' && 'layoutMode' in node && node.layoutMode !== 'NONE') {
      const frame = node as FrameNode;
      
      // Check if it has a meaningful gap
      if (frame.itemSpacing !== undefined && frame.itemSpacing > 0) {
        // Add to results
        results.push({
          nodeId: frame.id,
          nodeName: frame.name,
          location: getNodePath(frame),
          property: 'itemSpacing',
          type: 'vertical-gap',
          currentValue: frame.itemSpacing,
          isVisible: frame.visible !== false,
          gapType: frame.layoutMode === 'VERTICAL' ? 'vertical' : 'horizontal'
        });
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
    const gapType = result.gapType || 'vertical';
    const groupKey = `${gapType}-gap-${result.currentValue}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
} 