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
 * Checks if a variable is a local library variable (not team library)
 * @param variableId The ID of the variable to check
 * @returns Promise<boolean> True if it's a local variable, false otherwise
 */
async function isLocalLibraryVariable(variableId: string): Promise<boolean> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable || !variable.variableCollectionId) return false;
    
    // Use the async version as required by Figma API
    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    
    // Local variables have collections that are not remote
    // Exclude variables from collections with "Missing" in their name, which should be handled by missing-library scanner
    return !!collection && !collection.remote && !collection.name.includes('Missing');
  } catch (err) {
    console.error(`Error checking local library variable ${variableId}:`, err);
    return false;
  }
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
  
  // Cache for variable IDs that have been checked
  const variableCache = new Map<string, boolean>();
  
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
  
  // Get all local variables for reference
  const allVariables = await figma.variables.getLocalVariablesAsync();
  const variablesMap = new Map(allVariables.map(v => [v.id, v]));
  
  // Get all collections for reference - using async
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionsMap = new Map<string, VariableCollection>();
  
  // Store collections in the map
  for (const collection of collections) {
    collectionsMap.set(collection.id, collection);
  }

  /**
   * Helper function to determine variable type based on property and resolved type
   * @param property The property name bound to the variable
   * @param variableType The resolved type of the variable
   * @returns The appropriate ScanType for the variable
   */
  const determineVariableType = (property: string, variableType?: string): ScanType => {
    // Default to 'other' instead of 'fill' for better categorization
    let varType: ScanType = 'other';
    
    if (!variableType) return varType;
    
    if (variableType === 'COLOR') {
      if (property.includes('fill')) varType = 'fill';
      else if (property.includes('stroke')) varType = 'stroke';
      else if (property.includes('background')) varType = 'fill';
      else if (property.includes('border')) varType = 'stroke';
      else varType = 'color'; // Generic color type for other color properties
    } 
    else if (variableType === 'FLOAT') {
      if (property.includes('cornerRadius')) varType = 'corner-radius';
      else if (property.includes('itemSpacing')) varType = 'gap';
      else if (property.includes('padding')) {
        if (property.includes('horizontal')) varType = 'horizontal-padding';
        else if (property.includes('vertical')) varType = 'vertical-padding';
        else varType = 'padding';
      }
      else if (property.includes('width') || property.includes('height')) varType = 'dimension';
      else if (property.includes('opacity')) varType = 'opacity';
      else if (property.includes('spacing')) varType = 'gap';
      else varType = 'number'; // Default for numeric properties that don't match specific categories
    }
    else if (variableType === 'STRING') {
      if (property.includes('font') || 
          property.includes('text') || 
          property.includes('typography') ||
          property.includes('letterSpacing') ||
          property.includes('lineHeight')) {
        varType = 'typography';
      } else {
        varType = 'string'; // Generic string for non-typography string variables
      }
    }
    else if (variableType === 'BOOLEAN') {
      if (property.includes('visible') || property.includes('hidden')) varType = 'visibility';
      else varType = 'boolean'; // Generic boolean type
    }
    
    return varType;
  };
  
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
      // Process all variable bindings
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        // Check if scan was cancelled
        if (isScancelled()) {
          return;
        }
        
        // Process single variable binding
        if (binding && typeof binding === 'object' && 'id' in binding) {
          const variableId = binding.id as string;
          
          // Check if we've already determined if this is a local variable
          let isLocalVar = variableCache.get(variableId);
          
          // If not in cache, check and cache the result
          if (isLocalVar === undefined) {
            isLocalVar = await isLocalLibraryVariable(variableId);
            variableCache.set(variableId, isLocalVar);
          }
          
          // Only proceed if it's a local variable
          if (isLocalVar) {
            // Look up variable information
            const variable = variablesMap.get(variableId);
            let collection = null;
            
            if (variable && variable.variableCollectionId) {
              // Try to get from cache first
              collection = collectionsMap.get(variable.variableCollectionId);
              
              // If not in cache, try to fetch it
              if (!collection) {
                try {
                  collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
                } catch (e) {
                  console.log(`Could not get collection for: ${variable.variableCollectionId}`);
                }
              }
            }
            
            // Special handling for typography variables
            if (node.type === 'TEXT' && (
                property === 'fontName' || 
                property === 'fontSize' || 
                property === 'fontWeight' ||
                property === 'letterSpacing' ||
                property === 'lineHeight' ||
                property === 'paragraphIndent' ||
                property === 'paragraphSpacing')) {
              
              // Get typography properties
              let fontFamily = getFontFamilyFromNode(node);
              let fontWeight = getFontWeightFromNode(node).toString();
              let fontSize = node.fontSize as number;
              
              // Create a unique group key for this typography variable
              const groupKey = `typography-local-library-${fontFamily}-${fontWeight}-${fontSize}`;
              
              // Create the reference object for typography
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
                  fontSize,
                  variableName: variable?.name || 'Unknown',
                  collectionName: collection?.name || 'Local Variables',
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
                isLocalLibrary: true,
                groupKey,
                isVisible: node.visible !== false
              };
              
              // Add to results
              results.push(reference);
              typographyVarsFound++;
              
            } else {
              // Determine the type of variable using the helper function
              const varType = determineVariableType(property, variable?.resolvedType);
              
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
                  variableName: variable?.name || 'Unknown',
                  collectionName: collection?.name || 'Local Variables'
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
        
        // Process array of bindings (e.g., fills)
        else if (binding && Array.isArray(binding)) {
          for (let j = 0; j < binding.length; j++) {
            const item = binding[j];
            
            if (item && typeof item === 'object' && 'id' in item) {
              const variableId = item.id as string;
              
              // Check if we've already determined if this is a local variable
              let isLocalVar = variableCache.get(variableId);
              
              // If not in cache, check and cache the result
              if (isLocalVar === undefined) {
                isLocalVar = await isLocalLibraryVariable(variableId);
                variableCache.set(variableId, isLocalVar);
              }
              
              // Only proceed if it's a local variable
              if (isLocalVar) {
                // Look up variable information
                const variable = variablesMap.get(variableId);
                let collection = null;
                
                if (variable && variable.variableCollectionId) {
                  // Try to get from cache first
                  collection = collectionsMap.get(variable.variableCollectionId);
                  
                  // If not in cache, try to fetch it
                  if (!collection) {
                    try {
                      collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
                    } catch (e) {
                      console.log(`Could not get collection for: ${variable.variableCollectionId}`);
                    }
                  }
                }
                
                // Use the same helper function for consistent categorization
                const varType = determineVariableType(property, variable?.resolvedType);
                
                // Create a unique group key for this variable in an array
                const groupKey = `${varType}-local-library-${variableId}-array-${j}`;
                
                // Create the reference object
                const reference: MissingReference = {
                  nodeId: node.id,
                  nodeName: node.name,
                  property: `${property}[${j}]`,
                  type: varType,
                  location: getNodePath(node),
                  currentValue: {
                    variableId,
                    variableName: variable?.name || 'Unknown',
                    collectionName: collection?.name || 'Local Variables'
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
    }
    
    // Process children recursively
    if ('children' in node) {
      for (const child of node.children) {
        await processNode(child as SceneNode);
      }
    }
    
    // Update progress
    nodesProcessed++;
    const progress = Math.min(100, Math.round((nodesProcessed / totalNodes) * 100));
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