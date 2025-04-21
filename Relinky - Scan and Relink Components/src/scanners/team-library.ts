// Team Library Scanner Module
// Handles scanning for team library variables in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

// Extend MissingReference for library-specific properties
interface LibraryReference extends MissingReference {
  variableId?: string;
  variableName?: string;
  variableNodeId?: string;
  variableType?: string;
  libraryId?: string;
  groupKey?: string;
}

/**
 * Checks if a variable is from a team library
 */
async function isTeamLibraryVariable(variableId: string): Promise<boolean> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable || !variable.variableCollectionId) return false;
    
    // Use the async version as required by Figma API
    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    return !!collection && collection.remote;
  } catch (err) {
    console.error(`Error checking team library variable ${variableId}:`, err);
    return false;
  }
}

/**
 * Helper function to get a readable path for a node
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
 * Scan for team library variables in the document
 * 
 * @param progressCallback - Callback function for progress updates
 * @param selectedFrameIds - Array of frame IDs to scan (if empty, scans entire page)
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<LibraryReference[]> - Array of references to team library variables
 */
export async function scanForTeamLibraryVariables(
  progressCallback: (progress: number) => void = () => {},
  selectedFrameIds: string[] = [],
  ignoreHiddenLayers: boolean = false
): Promise<LibraryReference[]> {
  console.log('Starting team library variable scan');
  
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
  const results: LibraryReference[] = [];
  
  // Cache for already checked variable IDs
  const checkedVariableIds = new Map<string, boolean>();
  
  // Get all variables for reference
  const allVariables = await figma.variables.getLocalVariablesAsync();
  const variablesMap = new Map(allVariables.map(v => [v.id, v]));
  
  // Get collections for better naming - using async version
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionsMap = new Map<string, VariableCollection>();
  
  // Store collections in the map
  for (const collection of collections) {
    collectionsMap.set(collection.id, collection);
  }
  
  // Nodes with boundVariables
  const nodes = nodesToScan.flatMap(node => {
    const result: SceneNode[] = [];
    
    // Recursive function to collect nodes with boundVariables
    const collectNodes = (n: SceneNode) => {
      // Check if scan was cancelled
      if (isScancelled()) {
        return;
      }
      
      if ('boundVariables' in n && n.boundVariables && shouldIncludeNode(n, ignoreHiddenLayers)) {
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
  
  console.log(`Found ${nodes.length} nodes with boundVariables to scan for team library variables`);
  
  // Process each node
  for (let i = 0; i < nodes.length; i++) {
    // Check if scan was cancelled
    if (isScancelled()) {
      console.log('Team library scan cancelled');
      break;
    }
    
    const node = nodes[i];
    
    // Process each property binding
    for (const [property, binding] of Object.entries(node.boundVariables || {})) {
      // Check if scan was cancelled
      if (isScancelled()) {
        break;
      }
      
      // Handle direct variable binding
      if (binding && typeof binding === 'object' && 'id' in binding) {
        const variableId = binding.id as string;
        
        // Check cache first to avoid duplicate lookups
        let isTeamVar = checkedVariableIds.get(variableId);
        
        // If not in cache, check and cache the result
        if (isTeamVar === undefined) {
          isTeamVar = await isTeamLibraryVariable(variableId);
          checkedVariableIds.set(variableId, isTeamVar);
        }
        
        // Only include if it's a team library variable
        if (isTeamVar) {
          try {
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
            
            // Determine node type and create the reference
            const nodeType = node.type.toLowerCase();
            
            // Create group key for consistent grouping
            const groupKey = `${nodeType}-team-library-${variableId}`;
            
            // Create a reference object for this variable
            const reference: LibraryReference = {
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: property,
              type: nodeType as ScanType,
              currentValue: { 
                variableId: variableId,
                variableName: variable?.name || 'Unknown',
                variableType: variable?.resolvedType || 'UNKNOWN',
                collectionName: collection?.name || 'Team Library'
              },
              variableId: variableId,
              variableName: variable?.name || 'Unknown',
              variableNodeId: node.id,
              variableType: variable?.resolvedType || 'UNKNOWN',
              isTeamLibrary: true,
              isVisible: node.visible !== false,
              libraryName: collection?.name || 'Team Library',
              groupKey
            };
            
            results.push(reference);
          } catch (err) {
            console.error(`Error processing team library variable ${variableId}:`, err);
          }
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
            let isTeamVar = checkedVariableIds.get(variableId);
            
            // If not in cache, check and cache the result
            if (isTeamVar === undefined) {
              isTeamVar = await isTeamLibraryVariable(variableId);
              checkedVariableIds.set(variableId, isTeamVar);
            }
            
            // Only include if it's a team library variable
            if (isTeamVar) {
              try {
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
                
                // Determine node type and create the reference
                const nodeType = node.type.toLowerCase();
                
                // Create group key for consistent grouping
                const groupKey = `${nodeType}-team-library-${variableId}-array-${j}`;
                
                // Create a reference object for this variable
                const reference: LibraryReference = {
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: `${property}[${j}]`,
                  type: nodeType as ScanType,
                  currentValue: {
                    variableId: variableId,
                    variableName: variable?.name || 'Unknown',
                    variableType: variable?.resolvedType || 'UNKNOWN',
                    collectionName: collection?.name || 'Team Library'
                  },
                  variableId: variableId,
                  variableName: variable?.name || 'Unknown',
                  variableNodeId: node.id,
                  variableType: variable?.resolvedType || 'UNKNOWN',
                  isTeamLibrary: true,
                  isVisible: node.visible !== false,
                  libraryName: collection?.name || 'Team Library',
                  groupKey
                };
                
                results.push(reference);
              } catch (err) {
                console.error(`Error processing team library variable ${variableId} in array:`, err);
              }
            }
          }
        }
      }
    }
    
    // Report progress
    progressCallback(Math.round((i + 1) / nodes.length * 100));
  }
  
  console.log(`Team library scan complete. Found ${results.length} team library variables`);
  return results;
}

/**
 * Group team library variable scan results by type and variable
 * 
 * @param results - Array of team library variable references to group
 * @returns Record<string, LibraryReference[]> - Grouped references
 */
export function groupTeamLibraryResults(
  results: LibraryReference[]
): Record<string, LibraryReference[]> {
  const groups: Record<string, LibraryReference[]> = {};
  
  // Group by the groupKey property if available, otherwise create one
  results.forEach(result => {
    // Use existing groupKey or create one
    const groupKey = result.groupKey || (() => {
      const libraryName = result.libraryName || 'Unknown Library';
      const variableName = result.variableName || 'Unknown Variable';
      return `team-library-${libraryName}-${variableName}`;
    })();
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  console.log(`Grouped ${results.length} team library results into ${Object.keys(groups).length} groups`);
  
  return groups;
} 