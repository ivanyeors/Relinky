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
  ignoreHiddenLayers: boolean = false
): Promise<PaddingReference[]> {
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
  const results: PaddingReference[] = [];
  
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
    
    // Include frames with padding
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      return true;
    }
    
    return false;
  }
  
  // Helper function to check and process a node for padding
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) return;
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Check if it's a frame-like node with padding
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      const frame = node as FrameNode | ComponentNode | InstanceNode;
      
      if (scanType === 'horizontal-padding') {
        // Check horizontal padding
        const leftPadding = frame.paddingLeft || 0;
        const rightPadding = frame.paddingRight || 0;
        
        // Add left padding to results if present
        if (leftPadding > 0) {
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingLeft',
            type: 'horizontalPadding',
            currentValue: leftPadding,
            paddingType: 'left', // Additional metadata for filtering
            isVisible: frame.visible !== false
          });
        }
        
        // Add right padding to results if present
        if (rightPadding > 0) {
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingRight',
            type: 'horizontalPadding',
            currentValue: rightPadding,
            paddingType: 'right', // Additional metadata for filtering
            isVisible: frame.visible !== false
          });
        }
      } else if (scanType === 'vertical-padding') {
        // Check vertical padding
        const topPadding = frame.paddingTop || 0;
        const bottomPadding = frame.paddingBottom || 0;
        
        // Add top padding to results if present
        if (topPadding > 0) {
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingTop',
            type: 'verticalPadding',
            currentValue: topPadding,
            paddingType: 'top', // Additional metadata for filtering
            isVisible: frame.visible !== false
          });
        }
        
        // Add bottom padding to results if present
        if (bottomPadding > 0) {
          results.push({
            nodeId: frame.id,
            nodeName: frame.name,
            location: getNodePath(frame),
            property: 'paddingBottom',
            type: 'verticalPadding',
            currentValue: bottomPadding,
            paddingType: 'bottom', // Additional metadata for filtering
            isVisible: frame.visible !== false
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