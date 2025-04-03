// Local Library Scanner Module
// Handles scanning for local library variables in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled, getFontFamilyFromNode, getFontWeightFromNode } from './index';

/**
 * Helper function to get a readable path for a node
 * @param node The node to get the path for
 * @returns A string representing the path of the node in the document
 */
function getNodePath(node: BaseNode): string {
  const parts: string[] = [];
  let current: BaseNode | null = node;
  
  while (current && current.id !== figma.currentPage.id) {
    parts.unshift(current.name || current.id);
    current = current.parent;
  }
  
  return parts.join(' > ');
}

/**
 * Scan for local library variables in the document
 * 
 * @param progressCallback - Callback function for progress updates
 * @param selectedFrameIds - Array of frame IDs to scan (if empty, scans entire page)
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<MissingReference[]> - Array of references to local library variables
 */
export async function scanForLocalLibraryVariables(
  progressCallback: (progress: number) => void = () => {},
  selectedFrameIds: string[] | undefined = undefined,
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  console.log('Starting local library variables scan:', {
    selectedFrameIds: selectedFrameIds?.length ?? 'entire page',
    ignoreHiddenLayers
  });
  
  // Cache to store previously scanned results to improve performance
  const scannedNodesCache = new Map<string, boolean>();
  
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
  
  // Results array to collect references
  const results: MissingReference[] = [];
  let nodesProcessed = 0;
  let totalNodes = 0;
  
  // Count total nodes to process for progress calculation
  const countNodes = (node: SceneNode): number => {
    let count = 1;
    if ('children' in node) {
      for (const child of node.children) {
        count += countNodes(child);
      }
    }
    return count;
  };
  
  // Calculate total nodes for progress reporting
  for (const node of nodesToScan) {
    totalNodes += countNodes(node);
  }
  
  console.log(`Found ${totalNodes} total nodes to scan for local library variables`);
  
  // Counter for typography variables found
  let typographyVarsFound = 0;
  
  // Function to process a node and check for local variables
  const processNode = async (node: SceneNode) => {
    // Check if scan was cancelled
    if (isScancelled()) {
      return;
    }
    
    // Skip if already processed
    if (scannedNodesCache.has(node.id)) {
      return;
    }
    
    // Mark as processed
    scannedNodesCache.set(node.id, true);
    
    // Skip if node or parent is hidden and we're ignoring hidden layers
    if (ignoreHiddenLayers && ('visible' in node && !node.visible)) {
      return;
    }
    
    // Check for variable bindings
    if ('boundVariables' in node && node.boundVariables) {
      // Special handling for text nodes to detect typography variables
      if (node.type === 'TEXT') {
        // Process text node properties that might be bound to typography variables
        for (const [property, binding] of Object.entries(node.boundVariables)) {
          // Check if scan was cancelled
          if (isScancelled()) {
            return;
          }
          
          // Check if this is a typography-related property
          const isTypographyProperty = property === 'fontName' || 
                                      property === 'fontSize' || 
                                      property === 'fontWeight' ||
                                      property === 'letterSpacing' ||
                                      property === 'lineHeight' ||
                                      property === 'paragraphIndent' ||
                                      property === 'paragraphSpacing';
          
          if (isTypographyProperty && binding && typeof binding === 'object' && 'id' in binding) {
            // Create a reference object for typography variable
            const variableId = binding.id as string;
            
            // Determine properties for the typography variable
            let fontFamily = 'Unknown';
            let fontWeight = 'Regular';
            let fontSize = 16;
            
            // Get typography properties
            if (node.type === 'TEXT') {
              fontFamily = getFontFamilyFromNode(node);
              fontWeight = getFontWeightFromNode(node).toString();
              fontSize = node.fontSize as number;
            }
            
            // Create a unique group key for this typography variable
            const groupKey = `typography-local-library-${fontFamily}-${fontWeight}-${fontSize}`;
            
            // Create the reference object
            const reference: MissingReference = {
              nodeId: node.id,
              nodeName: node.name,
              property,
              type: 'typography',
              location: getNodePath(node),
              currentValue: {
                variableId,
                fontFamily,
                fontWeight, 
                fontSize
              },
              isLocalLibrary: true,
              groupKey,
              isVisible: node.visible !== false
            };
            
            // Add to results
            results.push(reference);
            typographyVarsFound++;
          }
        }
      }
      
      // Process other variable bindings
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        // Check if scan was cancelled
        if (isScancelled()) {
          return;
        }
        
        if (binding && typeof binding === 'object' && 'id' in binding) {
          const variableId = binding.id as string;
          
          // Check if this is a local variable (not from a library)
          const variable = await figma.variables.getVariableByIdAsync(variableId);
          if (variable && variable.variableCollectionId) {
            const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
            
            // Only process if it's a local variable (not a team library variable)
            if (collection && !collection.remote) {
              // Determine the type of variable
              let varType = 'color';
              if (variable.resolvedType === 'COLOR') varType = 'color';
              else if (variable.resolvedType === 'FLOAT') varType = 'number';
              else if (variable.resolvedType === 'STRING') varType = 'string';
              else if (variable.resolvedType === 'BOOLEAN') varType = 'boolean';
              
              // Create a unique group key for this variable
              const groupKey = `${varType}-local-library-${variableId}`;
              
              // Create the reference object
              const reference: MissingReference = {
                nodeId: node.id,
                nodeName: node.name,
                property,
                type: varType,
                location: getNodePath(node),
                currentValue: {
                  variableId,
                  variableName: variable.name,
                  collectionName: collection.name
                },
                isLocalLibrary: true,
                groupKey,
                isVisible: node.visible !== false
              };
              
              // Add to results
              results.push(reference);
            }
          }
        }
      }
    }
    
    // Process children recursively
    if ('children' in node) {
      for (const child of node.children) {
        await processNode(child as SceneNode);
      }
    }
    
    // Update progress
    nodesProcessed++;
    const progress = totalNodes > 0 ? nodesProcessed / totalNodes : 0;
    progressCallback(progress);
  };
  
  // Process all root nodes
  for (const node of nodesToScan) {
    // Check if scan was cancelled before processing each root node
    if (isScancelled()) {
      console.log('Local library scan cancelled');
      break;
    }
    
    await processNode(node);
  }
  
  console.log(`Local library scan complete. Found ${results.length} local library variables`);
  console.log(`Found ${typographyVarsFound} typography variables in the local library`);
  
  return results;
}

/**
 * Group local library variable scan results by type and variable
 * 
 * @param results - Array of local library variable references to group
 * @returns Record<string, MissingReference[]> - Grouped references
 */
export function groupLocalLibraryResults(
  results: MissingReference[]
): Record<string, MissingReference[]> {
  const groups: Record<string, MissingReference[]> = {};
  
  // Log the types of results we have
  const types = new Set<string>();
  results.forEach(result => {
    if (result.type) types.add(result.type);
  });
  console.log(`Grouping local library results with types: ${Array.from(types).join(', ')}`);
  
  // Group by the groupKey property if available, otherwise create one
  results.forEach(result => {
    // Use existing groupKey or create one
    const groupKey = result.groupKey || (() => {
      if (result.type === 'typography') {
        const fontFamily = result.currentValue?.fontFamily || 'Unknown';
        const fontWeight = result.currentValue?.fontWeight || 'Regular';
        const fontSize = result.currentValue?.fontSize || 16;
        return `typography-local-library-${fontFamily}-${fontWeight}-${fontSize}`;
      } else {
        const variableId = result.currentValue?.variableId || 'unknown';
        return `${result.type}-local-library-${variableId}`;
      }
    })();
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  console.log(`Grouped ${results.length} results into ${Object.keys(groups).length} groups`);
  
  return groups;
} 