// Missing Library Scanner Module
// Handles scanning for missing library variables in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

/**
 * Checks if a variable is from a missing library
 */
async function isMissingLibraryVariable(variableId: string): Promise<{isMissing: boolean, error?: string}> {
  try {
    // Try to access the variable - if it exists but can't be found in team or local,
    // it's likely from a missing library
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) return { isMissing: false };
    
    // Check if it's in missingVariables collection
    // This is a simplified check and may need more complex logic
    const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
    return { isMissing: !!collection && !collection.remote && collection.name.includes('Missing') };
  } catch (err) {
    // If we get an error trying to access the variable, it is a missing library variable
    const errorMessage = String(err);
    console.log(`Error accessing variable ${variableId}, may be missing:`, errorMessage);
    return { isMissing: true, error: errorMessage };
  }
}

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
 * Helper function to determine if a node should be included in scan results
 */
function shouldIncludeNode(node: SceneNode, ignoreHiddenLayers: boolean): boolean {
  if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
    return false;
  }
  return true;
}

/**
 * Scan for missing library variables in the document
 * 
 * @param progressCallback - Callback function for progress updates
 * @param selectedFrameIds - Array of frame IDs to scan (if empty, scans entire page)
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<MissingReference[]> - Array of references to missing library variables
 */
export async function scanForMissingLibraryVariables(
  progressCallback: (progress: number) => void = () => {},
  selectedFrameIds: string[] | undefined = undefined,
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  console.log('Starting missing library variables scan:', {
    selectedFrameIds: selectedFrameIds?.length ?? 'entire page',
    ignoreHiddenLayers
  });
  
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
  
  // Results array
  const results: MissingReference[] = [];
  
  // Cache for already checked variable IDs
  const checkedVariableIds = new Map<string, {isMissing: boolean, error?: string}>();
  
  // Nodes with boundVariables and/or missingVariables
  const nodes = nodesToScan.flatMap(node => {
    const result: SceneNode[] = [];
    
    // Recursive function to collect nodes
    const collectNodes = (n: SceneNode) => {
      // Check if scan was cancelled
      if (isScancelled()) {
        return;
      }
      
      if (shouldIncludeNode(n, ignoreHiddenLayers) && 
          (('boundVariables' in n && n.boundVariables) || 
           ('missingVariables' in n && n.missingVariables))) {
        result.push(n);
      }
      
      if ('children' in n) {
        n.children.forEach(child => {
          collectNodes(child as SceneNode);
        });
      }
    };
    
    collectNodes(node);
    return result;
  });
  
  console.log(`Found ${nodes.length} nodes to scan for missing library variables`);
  
  // Process each node
  for (let i = 0; i < nodes.length; i++) {
    // Check if scan was cancelled
    if (isScancelled()) {
      console.log('Missing library scan cancelled');
      break;
    }
    
    const node = nodes[i];
    
    // First check missingVariables property if available
    if ('missingVariables' in node && node.missingVariables) {
      for (const [property, missingInfo] of Object.entries(node.missingVariables)) {
        // Check if scan was cancelled
        if (isScancelled()) {
          break;
        }
        
        // Create a reference for each missing variable
        if (missingInfo) {
          // Extract library info if available
          const libraryName = missingInfo.libraryName || 'Unknown Library';
          const variableName = missingInfo.variableName || 'Unknown Variable';
          
          // Create a group key based on the library and variable name
          const groupKey = `missing-library-${libraryName}-${variableName}`;
          
          // Create the reference object
          const reference: MissingReference = {
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property,
            type: 'missing',
            currentValue: {
              libraryName,
              variableName
            },
            isMissingLibrary: true,
            groupKey,
            isVisible: node.visible !== false,
            libraryName
          };
          
          // Add to results
          results.push(reference);
        }
      }
    }
    
    // Also check boundVariables for potentially missing references
    if ('boundVariables' in node && node.boundVariables) {
      // Process each property binding
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        // Check if scan was cancelled
        if (isScancelled()) {
          break;
        }
        
        // Handle direct variable binding
        if (binding && typeof binding === 'object' && 'id' in binding) {
          const variableId = binding.id as string;
          
          // Check cache first to avoid duplicate lookups
          let checkResult = checkedVariableIds.get(variableId);
          
          // If not in cache, check and cache the result
          if (checkResult === undefined) {
            checkResult = await isMissingLibraryVariable(variableId);
            checkedVariableIds.set(variableId, checkResult);
          }
          
          // Only include if it's a missing library variable
          if (checkResult.isMissing) {
            // Try to get variable info, might fail for missing variables
            let variableName = 'Unknown Variable';
            let libraryName = 'Missing Library';
            
            try {
              const variable = await figma.variables.getVariableByIdAsync(variableId);
              if (variable) {
                variableName = variable.name;
                
                // Try to infer library name from variable key or ID
                if (variable.key) {
                  const libraryId = variable.key.split(':')[0];
                  libraryName = `Library ${libraryId}`;
                }
              }
            } catch (err) {
              console.log(`Unable to get variable info for ${variableId}`);
              // Extract library ID from the variable ID if possible
              const idParts = variableId.split(':');
              if (idParts.length > 1) {
                libraryName = `Library ${idParts[0]}`;
                variableName = `Variable ${idParts[1]}`;
              }
            }
            
            // Create group key for consistent grouping
            const groupKey = `missing-library-${libraryName}-${variableName}`;
            
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property,
              type: 'missing',
              currentValue: {
                variableId,
                libraryName,
                variableName,
                errorDetails: checkResult.error
              },
              isMissingLibrary: true,
              groupKey,
              isVisible: node.visible !== false,
              libraryName
            });
          }
        }
        
        // Handle array of bindings (e.g., fills)
        else if (binding && typeof binding === 'object' && Array.isArray(binding)) {
          // Process each item in the array
          for (let j = 0; j < binding.length; j++) {
            const item = binding[j];
            
            if (item && typeof item === 'object' && 'id' in item) {
              const variableId = item.id as string;
              
              // Check cache first to avoid duplicate lookups
              let checkResult = checkedVariableIds.get(variableId);
              
              // If not in cache, check and cache the result
              if (checkResult === undefined) {
                checkResult = await isMissingLibraryVariable(variableId);
                checkedVariableIds.set(variableId, checkResult);
              }
              
              // Only include if it's a missing library variable
              if (checkResult.isMissing) {
                // Try to get variable info, might fail for missing variables
                let variableName = 'Unknown Variable';
                let libraryName = 'Missing Library';
                
                try {
                  const variable = await figma.variables.getVariableByIdAsync(variableId);
                  if (variable) {
                    variableName = variable.name;
                    
                    // Try to infer library name from variable key or ID
                    if (variable.key) {
                      const libraryId = variable.key.split(':')[0];
                      libraryName = `Library ${libraryId}`;
                    }
                  }
                } catch (err) {
                  console.log(`Unable to get variable info for ${variableId}`);
                  // Extract library ID from the variable ID if possible
                  const idParts = variableId.split(':');
                  if (idParts.length > 1) {
                    libraryName = `Library ${idParts[0]}`;
                    variableName = `Variable ${idParts[1]}`;
                  }
                }
                
                // Create group key for consistent grouping
                const groupKey = `missing-library-${libraryName}-${variableName}-array-${j}`;
                
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: `${property}[${j}]`,
                  type: 'missing',
                  currentValue: {
                    variableId,
                    libraryName,
                    variableName,
                    errorDetails: checkResult.error
                  },
                  isMissingLibrary: true,
                  groupKey,
                  isVisible: node.visible !== false,
                  libraryName
                });
              }
            }
          }
        }
      }
    }
    
    // Update progress
    progressCallback(Math.round((i + 1) / nodes.length * 100));
  }
  
  console.log(`Missing library scan complete. Found ${results.length} missing library variables`);
  
  return results;
}

/**
 * Group missing library variable scan results by library and variable
 * 
 * @param results - Array of missing library variable references to group
 * @returns Record<string, MissingReference[]> - Grouped references
 */
export function groupMissingLibraryResults(
  results: MissingReference[]
): Record<string, MissingReference[]> {
  const groups: Record<string, MissingReference[]> = {};
  
  // Group by the groupKey property if available, otherwise create one
  results.forEach(result => {
    // Use existing groupKey or create one
    const groupKey = result.groupKey || (() => {
      const libraryName = result.currentValue?.libraryName || 'Unknown Library';
      const variableName = result.currentValue?.variableName || 'Unknown Variable';
      return `missing-library-${libraryName}-${variableName}`;
    })();
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  console.log(`Grouped ${results.length} missing library results into ${Object.keys(groups).length} groups`);
  
  return groups;
} 