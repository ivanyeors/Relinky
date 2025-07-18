// Color Scanner Module
// Handles scanning for fill and stroke colors in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

/**
 * Scan for colors (fill and stroke)
 * 
 * @param scanType - Type of scan ('fill' or 'stroke')
 * @param selectedFrameIds - Array of frame IDs to scan
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<MissingReference[]> - Array of references to color values
 */
export async function scanForColors(
  scanType: 'fill' | 'stroke',
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
    
    return true;
  }
  
  // Check if a node has variable binding for a property
  function hasVariableBinding(node: SceneNode, property: string): boolean {
    return 'boundVariables' in node && 
           node.boundVariables !== null && 
           node.boundVariables !== undefined && 
           property in node.boundVariables;
  }
  
  // Enhanced check for component instances to detect raw values in overrides
  function isComponentInstanceWithRawValues(node: SceneNode, scanType: 'fill' | 'stroke'): boolean {
    // Only check instance nodes
    if (node.type !== 'INSTANCE') return false;
    
    // Check if the property has values but no variable binding
    const property = scanType === 'fill' ? 'fills' : 'strokes';
    
    // If there's no variable binding and the property has values, it's likely a raw value
    if (!hasVariableBinding(node, property)) {
      if (scanType === 'fill' && 'fills' in node && node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
        return true;
      }
      if (scanType === 'stroke' && 'strokes' in node && node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
        return true;
      }
    }
    
    return false;
  }

  // Process a single node
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
    
    // Enhanced processing for component instances - they will still go through regular processing
    // but we'll add a note if they contain raw values
    let isComponentInstance = node.type === 'INSTANCE';
    let componentInstanceHasRawValues = isComponentInstance && isComponentInstanceWithRawValues(node, scanType);
    
    if (componentInstanceHasRawValues) {
      console.log(`Found component instance with raw ${scanType} values: ${node.name}`);
    }
    
    // Regular processing for all nodes (including component instances)
    if (scanType === 'fill') {
      // Check if node has fills
      if ('fills' in node && node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
        // Skip if this property has a variable binding
        if (hasVariableBinding(node, 'fills')) return;
        
        // Process each fill
        for (let i = 0; i < node.fills.length; i++) {
          const fill = node.fills[i];
          
          // Only include solid fills
          if (fill.type === 'SOLID') {
            // Use enhanced node name for component instances
            const displayName = componentInstanceHasRawValues ? 
              `${node.name} (Instance)` : node.name;
              
            results.push({
              nodeId: node.id,
              nodeName: displayName,
              location: getNodePath(node),
              property: 'fills',
              type: 'fill',
              currentValue: {
                r: fill.color.r,
                g: fill.color.g,
                b: fill.color.b,
                a: fill.opacity || 1
              },
              isVisible: node.visible !== false
            });
          }
        }
      }
    } else if (scanType === 'stroke') {
      // Check if node has strokes
      if ('strokes' in node && node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
        // Skip if this property has a variable binding
        if (hasVariableBinding(node, 'strokes')) return;
        
        // Process each stroke
        for (let i = 0; i < node.strokes.length; i++) {
          const stroke = node.strokes[i];
          
          // Only include solid strokes
          if (stroke.type === 'SOLID') {
            // Use enhanced node name for component instances
            const displayName = componentInstanceHasRawValues ? 
              `${node.name} (Instance)` : node.name;
              
            results.push({
              nodeId: node.id,
              nodeName: displayName,
              location: getNodePath(node),
              property: 'strokes',
              type: 'stroke',
              currentValue: {
                r: stroke.color.r,
                g: stroke.color.g,
                b: stroke.color.b,
                a: stroke.opacity || 1
              },
              isVisible: node.visible !== false
            });
          }
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
 * Group color scan results by type and value
 * 
 * @param results - Array of color references to group
 * @returns Record<string, MissingReference[]> - Grouped references
 */
export function groupColorResults(
  results: MissingReference[]
): Record<string, MissingReference[]> {
  const groups: Record<string, MissingReference[]> = {};
  
  // Group by color value and type
  results.forEach(result => {
    const color = result.currentValue;
    if (!color) return;
    
    // Create a color key - round values for better grouping
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = Math.round((color.a || 1) * 100) / 100;
    
    const groupKey = `${result.type}-rgba-${r}-${g}-${b}-${a}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
} 