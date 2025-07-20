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
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false
): Promise<MissingReference[]> {
  console.log(`Starting ${scanType} scan - TYPOGRAPHY SCANNER INITIALIZED`, {
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
    // Get selected nodes from IDs - supporting ALL node types that can contain text
    const selectedNodes = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => 
      node !== null && 'type' in node && 
      // Include ALL SceneNode types that can contain text or be containers
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
      // Add the selected node itself if it's a text node
      if (selectedNode.type === 'TEXT') {
        nodesToScan.push(selectedNode);
      }
      
      // Add all text descendants if the node has children
      if ('children' in selectedNode && selectedNode.children.length > 0) {
        try {
          // Use findAll to get ALL descendant text nodes
          const textDescendants = selectedNode.findAll((node: SceneNode) => {
            // Apply visibility filter if needed
            if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
              return false;
            }
            // Only include TEXT nodes
            return node.type === 'TEXT';
          });
          
          console.log(`Adding ${textDescendants.length} text descendants from ${selectedNode.name}`);
          nodesToScan.push(...textDescendants);
        } catch (error) {
          console.warn(`Error collecting text descendants from ${selectedNode.name}:`, error);
        }
      }
    }
    
    console.log('Total text nodes to scan (including descendants):', nodesToScan.length);
  } else {
    // Fallback to current page - use findAll to get all text nodes
    nodesToScan = figma.currentPage.findAll((node: SceneNode) => {
      // Apply visibility filter if needed
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      // Only include TEXT nodes
      return node.type === 'TEXT';
    });
    console.log('Scanning entire page:', nodesToScan.length, 'text nodes');
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
  let totalNodesToProcess = nodesToScan.length; // Now we know the exact count upfront
  
  console.log(`Found ${totalNodesToProcess} total text nodes to scan for ${scanType}`);
  
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
        console.log(`Processing typography: ${totalNodesProcessed}/${totalNodesToProcess} nodes (${Math.round(progress * 100)}%)`);
      }
    }
    
    // Process text node typography
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      
      // Skip if the node has font-related variable bindings
      if (hasVariableBinding(textNode, 'fontName') || 
          hasVariableBinding(textNode, 'fontSize') || 
          hasVariableBinding(textNode, 'fontWeight')) {
        console.log(`Node ${textNode.name} has typography bound to variables, skipping`);
        return;
      }
      
      // Get typography properties
      const fontFamily = getFontFamilyFromNode(textNode);
      const fontWeight = getFontWeightFromNode(textNode);
      const fontSize = textNode.fontSize as number;
      
      console.log(`Found raw typography in ${textNode.name}: ${fontFamily} ${fontWeight} ${fontSize}px`);
      
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
          fontSize,
          // Add labels for UI display
          labels: {
            fontFamily: { 
              text: fontFamily, 
              type: 'font-family' 
            },
            fontWeight: { 
              text: fontWeight, 
              type: 'font-weight' 
            },
            fontSize: { 
              text: `${fontSize}px`, 
              type: 'font-size' 
            }
          }
        },
        groupKey
      });
    }
  }
  
  // Process all text nodes in the flat list (no longer recursive)
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