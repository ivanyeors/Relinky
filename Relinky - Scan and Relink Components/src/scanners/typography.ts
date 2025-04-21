// Typography Scanner Module
// Handles scanning for typography styles in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled, getFontFamilyFromNode, getFontWeightFromNode } from './index';

/**
 * Scan for typography styles
 * 
 * @param scanType - Type of scan ('typography')
 * @param selectedFrameIds - Array of frame IDs to scan
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<MissingReference[]> - Array of references to typography values
 */
export async function scanForTypography(
  scanType: 'typography',
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
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
  const results: MissingReference[] = [];
  
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
    
    // Only include text nodes
    return node.type === 'TEXT';
  }
  
  // Check if a node has variable binding for a property
  function hasVariableBinding(node: SceneNode, property: string): boolean {
    return 'boundVariables' in node && 
           node.boundVariables !== null && 
           node.boundVariables !== undefined && 
           property in node.boundVariables;
  }
  
  // Process a single node
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) {
      // Process children recursively even if we skip this node
      if ('children' in node) {
        for (const child of node.children) {
          processNode(child as SceneNode);
        }
      }
      return;
    }
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Update progress occasionally
    totalNodesProcessed++;
    if (totalNodesProcessed % 100 === 0) {
      const progress = Math.min(totalNodesProcessed / totalNodesToProcess, 0.99);
      progressCallback(progress);
    }
    
    // Process text node typography
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      
      // Skip if the node has font-related variable bindings
      if (hasVariableBinding(textNode, 'fontName') || 
          hasVariableBinding(textNode, 'fontSize') || 
          hasVariableBinding(textNode, 'fontWeight')) {
        return;
      }
      
      // Get typography properties
      const fontFamily = getFontFamilyFromNode(textNode);
      const fontWeight = getFontWeightFromNode(textNode);
      const fontSize = textNode.fontSize as number;
      
      // Create a unique key for this typography style
      const groupKey = `typography-${fontFamily}-${fontWeight}-${fontSize}`;
      
      // Add to results
      results.push({
        nodeId: textNode.id,
        nodeName: textNode.name,
        location: getNodePath(textNode),
        property: 'fontName',
        type: 'typography',
        isVisible: textNode.visible !== false,
        currentValue: {
          fontFamily,
          fontWeight,
          fontSize
        },
        groupKey
      });
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
  
  console.log(`${scanType} scan complete. Found ${results.length} ${scanType} values.`);
  return results;
}

/**
 * Group typography scan results by type and value
 * 
 * @param results - Array of typography references to group
 * @returns Record<string, MissingReference[]> - Grouped references
 */
export function groupTypographyResults(
  results: MissingReference[]
): Record<string, MissingReference[]> {
  const groups: Record<string, MissingReference[]> = {};
  
  // Group by typography values
  results.forEach(result => {
    // Use the predefined groupKey if available
    const groupKey = result.groupKey || (() => {
      const value = result.currentValue;
      if (!value) return `typography-unknown`;
      
      const fontFamily = value.fontFamily || 'Unknown';
      const fontWeight = value.fontWeight || 'Regular';
      const fontSize = value.fontSize || 16;
      
      return `typography-${fontFamily}-${fontWeight}-${fontSize}`;
    })();
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
} 