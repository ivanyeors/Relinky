// Variables scanning feature
// This module contains functions for scanning variables and inactive libraries

import { 
  MissingReference, 
  ScanType,
  shouldIncludeNode,
  hasVariableBindings,
} from '../common';

// Global flags for scan control
let isScanPaused = false;
let isScanStopped = false;
let isScanCancelled = false;

// Library interfaces
export interface Library {
  key: string;
  name: string;
  enabled: boolean;
  type: 'REMOTE' | 'LOCAL';
}

// Token interfaces
export interface TokenVariable {
  variableId: string;
  variableName: string;
  variableKey: string;
  variableType: VariableResolvedDataType;  // Use Figma's built-in type
  isRemote: boolean;
  libraryName?: string;
  libraryKey?: string;
  isEnabled?: boolean;
}

export interface TokenGroup {
  name: string;
  variables: TokenVariable[];
  isEnabled: boolean | undefined;
  libraryName?: string;
}

export interface LibraryToken {
  id: string;
  name: string;
  key: string;
  type: VariableResolvedDataType;
  libraryName: string;
  isActive: boolean;
  value?: any;
  collection?: {
    name: string;
    id: string;
  };
  sourceType: 'REMOTE' | 'LOCAL';
  subscribedID: string;
  usages: Array<{
    nodeId: string;
    nodeName: string;
    property: string;
    mode: string;
  }>;
}

export interface TokenScanResult {
  activeLibraryTokens: LibraryToken[];
  inactiveLibraryTokens: LibraryToken[];
}

export interface LibraryTokenScanOption {
  value: string;
  label: string;
  description: string;
  icon: string;
}

export interface PublishedVariable {
  id: string;
  subscribedId: string;
  name: string;
  key: string;
  resolvedType: VariableResolvedDataType;
  description?: string;
  remote: boolean;
  libraryName: string;
  isPublished: boolean;
}

// Library token scan options (for "Unlinked Tokens" page)
export const LIBRARY_TOKEN_SCAN_OPTIONS: LibraryTokenScanOption[] = [
  {
    value: 'all',
    label: 'All Library Tokens',
    description: 'Find all tokens from inactive libraries',
    icon: 'tokens'
  },
  {
    value: 'colors',
    label: 'Color Tokens',
    description: 'Find color tokens from inactive libraries',
    icon: 'fill'
  },
  {
    value: 'typography',
    label: 'Typography Tokens',
    description: 'Find typography tokens from inactive libraries',
    icon: 'typography'
  },
  {
    value: 'spacing',
    label: 'Spacing Tokens',
    description: 'Find spacing tokens from inactive libraries',
    icon: 'spacing'
  }
];

// Variable scan options for the Variables Unlinker feature
export const VARIABLE_SCAN_OPTIONS: LibraryTokenScanOption[] = [
  {
    value: 'all',
    label: 'All Variables',
    description: 'Scan for all variable types',
    icon: 'variable'
  },
  {
    value: 'color',
    label: 'Color Variables',
    description: 'Scan for color variables',
    icon: 'fill'
  },
  {
    value: 'boolean',
    label: 'Boolean Variables',
    description: 'Scan for boolean variables',
    icon: 'toggle'
  },
  {
    value: 'number',
    label: 'Number Variables',
    description: 'Scan for number variables',
    icon: 'spacing'
  },
  {
    value: 'string',
    label: 'String Variables',
    description: 'Scan for string variables',
    icon: 'typography'
  }
];

/**
 * Scans for inactive design tokens/variables
 * Finds all node with variables from inactive libraries
 */
export async function scanForInactiveTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  const tokenGroups: Record<string, TokenGroup> = {};
  
  try {
    const allVariables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    // Map collections with proper Library type
    const libraryMap = new Map(
      collections.map(collection => [collection.key, {
        key: collection.key,
        name: collection.name,
        enabled: collection.remote,
        type: collection.remote ? 'REMOTE' : 'LOCAL'
      } as Library])
    );

    // Process variables
    for (const variable of allVariables) {
      if (variable.remote) {
        const libraryKey = variable.key.split(':')[0];
        const library = libraryMap.get(libraryKey);
        
        const groupKey = library ? library.name : 'Unknown Library';
        if (!tokenGroups[groupKey]) {
          tokenGroups[groupKey] = {
            name: groupKey,
            variables: [],
            isEnabled: library?.enabled ?? false,
            libraryName: library?.name
          };
        }

        tokenGroups[groupKey].variables.push({
          variableId: variable.id,
          variableName: variable.name,
          variableKey: variable.key,
          variableType: variable.resolvedType,
          isRemote: variable.remote,
          libraryName: library?.name,
          libraryKey,
          isEnabled: library?.enabled
        });
      }
    }

    // Now scan nodes for variables
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => hasVariableBindings(node));
    
    console.log('Found nodes with variables:', nodes.length);

    for (const node of nodes) {
      if (isScanCancelled) break;

      try {
        if (!node.boundVariables) continue;

        for (const [key, binding] of Object.entries(node.boundVariables)) {
          if (binding && typeof binding === 'object' && 'id' in binding) {
            try {
              const variableId = typeof binding.id === 'string' ? binding.id : '';
              const variable = await figma.variables.getVariableByIdAsync(variableId);
              
              if (variable?.remote) {
                const libraryKey = variable.key.split(':')[0];
                const library = libraryMap.get(libraryKey);
                const groupKey = library?.name || 'Unknown Library';
                const group = tokenGroups[groupKey];

                if (!library?.enabled) {
                  missingRefs.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    type: 'inactive-tokens',
                    property: key,
                    currentValue: {
                      variableName: variable.name,
                      libraryName: library?.name || 'Unknown Library',
                      libraryKey,
                      groupName: groupKey,
                      totalGroupVariables: group?.variables.length || 0
                    },
                    location: 'Inactive Library Token',
                    variableName: variable.name,
                    preview: `${groupKey} (${group?.variables.length || 0} tokens)`,
                    isInactiveLibrary: true,
                    isVisible: 'visible' in node ? node.visible : true
                  });
                }
              }
            } catch (err) {
              // Handle inaccessible variables
              const groupKey = 'Inaccessible Libraries';
              if (!tokenGroups[groupKey]) {
                tokenGroups[groupKey] = {
                  name: groupKey,
                  variables: [],
                  isEnabled: false
                };
              }

              missingRefs.push({
                nodeId: node.id,
                nodeName: node.name,
                type: 'inactive-tokens',
                property: key,
                currentValue: {
                  bindingId: binding.id,
                  groupName: groupKey
                },
                location: 'Inaccessible Library Token',
                variableName: 'Unknown Variable',
                preview: `${groupKey}`,
                isInactiveLibrary: true,
                isVisible: 'visible' in node ? node.visible : true
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Error processing node ${node.name}:`, err);
      }

      progressCallback(Math.round((nodes.indexOf(node) + 1) / nodes.length * 100));
    }

    console.log('Scan complete. Groups:', tokenGroups);
    console.log('Found missing refs:', missingRefs.length);
  } catch (err) {
    console.error('Error scanning for inactive tokens:', err);
  }
  
  return missingRefs;
}

/**
 * Lists all variables available in the document
 * This is used for the UI to show all available variables
 */
export async function listAllVariables() {
  try {
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    // Map collections to their names
    const collectionMap = new Map(
      collections.map(collection => [collection.id, {
        id: collection.id,
        name: collection.name,
        remote: collection.remote,
        key: collection.key
      }])
    );
    
    // Get the first mode from the first collection to use as default
    const getDefaultMode = (variableCollectionId: string) => {
      const collection = collections.find(c => c.id === variableCollectionId);
      return collection && collection.modes.length > 0 ? collection.modes[0].modeId : '';
    };
    
    // Format variables with their values
    return variables.map(variable => {
      const collection = collectionMap.get(variable.variableCollectionId);
      const modes = Object.keys(variable.valuesByMode);
      const currentMode = getDefaultMode(variable.variableCollectionId) || modes[0];
      const value = variable.valuesByMode[currentMode];
      
      return {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        resolvedType: variable.resolvedType,
        collection: collection ? {
          id: collection.id,
          name: collection.name,
          remote: collection.remote
        } : null,
        value: value,
        remote: variable.remote
      };
    });
  } catch (err) {
    console.error('Error listing variables:', err);
    return [];
  }
}

/**
 * Scans for library tokens of a specific type
 * Used for the "Unlinked Tokens" page
 */
export async function scanForLibraryTokens(
  scanType: string = 'all',
  ignoreHiddenLayers: boolean = false
): Promise<TokenScanResult> {
  // Reset scan control flags
  isScanPaused = false;
  isScanStopped = false;
  isScanCancelled = false;

  console.log(`Starting library token scan for type: ${scanType}`);
  
  const activeLibraryTokens: LibraryToken[] = [];
  const inactiveLibraryTokens: LibraryToken[] = [];
  
  try {
    // Get all variables and collections
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    console.log(`Found ${variables.length} variables and ${collections.length} collections`);
    
    // Filter variables by type if needed
    const filteredVariables = variables.filter(variable => {
      if (scanType === 'all') return true;
      if (scanType === 'colors' && variable.resolvedType === 'COLOR') return true;
      if (scanType === 'typography' && variable.resolvedType === 'STRING') return true;
      if (scanType === 'spacing' && variable.resolvedType === 'FLOAT') return true;
      return false;
    });
    
    // Get collection map
    const collectionMap = new Map(
      collections.map(collection => [collection.id, {
        id: collection.id,
        name: collection.name,
        remote: collection.remote,
        key: collection.key
      }])
    );
    
    // Track all nodes that use variables
    const nodeVariableMap = new Map<string, Set<string>>();
    
    // Scan all nodes for variable usages
    const allNodes = figma.currentPage.findAll(node => {
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      
      return hasVariableBindings(node);
    });
    
    for (const node of allNodes) {
      if (isScanStopped || isScanCancelled) break;
      
      try {
        if (!('boundVariables' in node) || !node.boundVariables) continue;
        
        for (const [property, binding] of Object.entries(node.boundVariables)) {
          // Ensure binding is a variable binding
          if (binding && typeof binding === 'object' && 'id' in binding) {
            const variableId = binding.id as string;
            if (!nodeVariableMap.has(variableId)) {
              nodeVariableMap.set(variableId, new Set());
            }
            nodeVariableMap.get(variableId)?.add(`${node.id}:${property}`);
          }
        }
      } catch (err) {
        console.warn(`Error processing node ${node.name}:`, err);
      }
    }
    
    // Process variables
    for (const variable of filteredVariables) {
      if (isScanStopped || isScanCancelled) break;
      
      const collection = collectionMap.get(variable.variableCollectionId);
      const isRemote = variable.remote;
      const libraryName = collection?.name || 'Unknown Library';
      
      // Get the current mode value
      const modes = Object.keys(variable.valuesByMode);
      const currentMode = figma.variables.getVariableCollectionById(variable.variableCollectionId)?.modes[0]?.modeId || modes[0];
      const value = variable.valuesByMode[currentMode];
      
      // Get usages for this variable
      const usages = nodeVariableMap.has(variable.id)
        ? Array.from(nodeVariableMap.get(variable.id) || []).map(usage => {
            const [nodeId, property] = usage.split(':');
            const node = figma.getNodeById(nodeId);
            return {
              nodeId,
              nodeName: node?.name || 'Unknown Node',
              property,
              mode: currentMode
            };
          })
        : [];
      
      const token: LibraryToken = {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        type: variable.resolvedType,
        libraryName,
        isActive: isRemote ? !!collection?.remote : true,
        value,
        collection: collection ? {
          name: collection.name,
          id: collection.id
        } : undefined,
        sourceType: isRemote ? 'REMOTE' : 'LOCAL',
        subscribedID: variable.remote ? variable.key.split(':')[1] || '' : '',
        usages
      };
      
      if (token.isActive) {
        activeLibraryTokens.push(token);
      } else {
        inactiveLibraryTokens.push(token);
      }
    }
    
    console.log(`Scan complete. Found ${activeLibraryTokens.length} active tokens and ${inactiveLibraryTokens.length} inactive tokens`);
    
  } catch (err) {
    console.error('Error scanning for library tokens:', err);
  }
  
  return { activeLibraryTokens, inactiveLibraryTokens };
}

/**
 * NEW FUNCTION: Scan for all variables (linked and unlinked)
 * This is the main scanning function for the Variables Unlinker feature
 */
export async function scanForAllVariables(
  selectedTypes: string[] = ['all'],
  progressCallback: (progress: number) => void,
  ignoreHiddenLayers: boolean = false
): Promise<LibraryToken[]> {
  // Reset scan control flags
  isScanPaused = false;
  isScanStopped = false;
  isScanCancelled = false;

  console.log(`Starting variables scan for types: ${selectedTypes.join(', ')}`);
  
  const allVariables: LibraryToken[] = [];
  
  try {
    // Get all variables and collections
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    console.log(`Found ${variables.length} variables and ${collections.length} collections`);
    
    // Filter variables by type if needed
    const filteredVariables = variables.filter(variable => {
      // If 'all' is selected, include all variables
      if (selectedTypes.includes('all')) return true;
      
      // Otherwise, check if the variable type is in the selected types
      if (selectedTypes.includes('color') && variable.resolvedType === 'COLOR') return true;
      if (selectedTypes.includes('boolean') && variable.resolvedType === 'BOOLEAN') return true;
      if (selectedTypes.includes('number') && variable.resolvedType === 'FLOAT') return true;
      if (selectedTypes.includes('string') && variable.resolvedType === 'STRING') return true;
      
      return false;
    });
    
    // Get collection map
    const collectionMap = new Map(
      collections.map(collection => [collection.id, {
        id: collection.id,
        name: collection.name,
        remote: collection.remote,
        key: collection.key
      }])
    );
    
    // Track all nodes that use variables
    const nodeVariableMap = new Map<string, Set<string>>();
    
    // Scan all nodes for variable usages
    const allNodes = figma.currentPage.findAll(node => {
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      
      return hasVariableBindings(node);
    });
    
    let processedNodes = 0;
    const totalNodes = allNodes.length;
    
    for (const node of allNodes) {
      if (isScanStopped || isScanCancelled) break;
      
      try {
        if (!('boundVariables' in node) || !node.boundVariables) continue;
        
        for (const [property, binding] of Object.entries(node.boundVariables)) {
          // Ensure binding is a variable binding
          if (binding && typeof binding === 'object' && 'id' in binding) {
            const variableId = binding.id as string;
            if (!nodeVariableMap.has(variableId)) {
              nodeVariableMap.set(variableId, new Set());
            }
            nodeVariableMap.get(variableId)?.add(`${node.id}:${property}`);
          }
        }
      } catch (err) {
        console.warn(`Error processing node ${node.name}:`, err);
      }
      
      processedNodes++;
      // Report progress to the UI
      if (processedNodes % 10 === 0 || processedNodes === totalNodes) {
        progressCallback(Math.floor((processedNodes / totalNodes) * 50)); // First 50% of progress is scanning nodes
      }
    }
    
    // Process variables
    let processedVars = 0;
    const totalVars = filteredVariables.length;
    
    for (const variable of filteredVariables) {
      if (isScanStopped || isScanCancelled) break;
      
      const collection = collectionMap.get(variable.variableCollectionId);
      const isRemote = variable.remote;
      const libraryName = collection?.name || 'Unknown Library';
      
      // Get the current mode value
      const modes = Object.keys(variable.valuesByMode);
      const currentMode = figma.variables.getVariableCollectionById(variable.variableCollectionId)?.modes[0]?.modeId || modes[0];
      const value = variable.valuesByMode[currentMode];
      
      // Get usages for this variable
      const usages = nodeVariableMap.has(variable.id)
        ? Array.from(nodeVariableMap.get(variable.id) || []).map(usage => {
            const [nodeId, property] = usage.split(':');
            const node = figma.getNodeById(nodeId);
            return {
              nodeId,
              nodeName: node?.name || 'Unknown Node',
              property,
              mode: currentMode
            };
          })
        : [];
      
      const token: LibraryToken = {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        type: variable.resolvedType,
        libraryName,
        isActive: true, // All variables are active in this context
        value,
        collection: collection ? {
          name: collection.name,
          id: collection.id
        } : undefined,
        sourceType: isRemote ? 'REMOTE' : 'LOCAL',
        subscribedID: variable.remote ? variable.key.split(':')[1] || '' : '',
        usages
      };
      
      // Only add variables that are actually used in the document
      if (usages.length > 0) {
        allVariables.push(token);
      }
      
      processedVars++;
      // Report progress to the UI (second 50% of the progress)
      if (processedVars % 5 === 0 || processedVars === totalVars) {
        progressCallback(50 + Math.floor((processedVars / totalVars) * 50));
      }
    }
    
    console.log(`Scan complete. Found ${allVariables.length} variables in use`);
    
  } catch (err) {
    console.error('Error scanning for variables:', err);
  }
  
  return allVariables;
}

/**
 * NEW FUNCTION: Unlink a variable from all its usages
 * Converts variable references to their raw values
 */
export async function unlinkVariable(variableId: string): Promise<number> {
  let unlinkedCount = 0;
  
  try {
    // Get the variable to access its current value
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) {
      throw new Error(`Variable with ID ${variableId} not found`);
    }
    
    // Get the current mode for this variable
    const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
    const currentMode = collection?.modes[0]?.modeId || Object.keys(variable.valuesByMode)[0];
    
    // Get the current value of the variable
    const rawValue = variable.valuesByMode[currentMode];
    
    // Find all nodes using this variable
    const nodesWithVariable = figma.currentPage.findAll(node => {
      if (!('boundVariables' in node) || !node.boundVariables) return false;
      
      // Check if any binding uses this variable
      for (const binding of Object.values(node.boundVariables)) {
        if (binding && typeof binding === 'object' && 'id' in binding && binding.id === variableId) {
          return true;
        }
      }
      
      return false;
    });
    
    console.log(`Found ${nodesWithVariable.length} nodes using variable ${variable.name}`);
    
    // Process each node to unlink the variable
    for (const node of nodesWithVariable) {
      if (!('boundVariables' in node) || !node.boundVariables) continue;
      
      // Find properties using this variable
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        if (binding && typeof binding === 'object' && 'id' in binding && binding.id === variableId) {
          try {
            // For different properties, we need different approaches to apply the raw value
            if (property.startsWith('fills') && variable.resolvedType === 'COLOR') {
              // Handle fill colors
              if ('fills' in node && Array.isArray(node.fills)) {
                const fillIndex = parseInt(property.split('.')[1]);
                if (!isNaN(fillIndex) && node.fills[fillIndex]) {
                  const fills = [...node.fills];
                  fills[fillIndex] = {
                    ...fills[fillIndex],
                    color: rawValue as RGBA
                  };
                  node.fills = fills;
                  unlinkedCount++;
                }
              }
            } else if (property.startsWith('strokes') && variable.resolvedType === 'COLOR') {
              // Handle stroke colors
              if ('strokes' in node && Array.isArray(node.strokes)) {
                const strokeIndex = parseInt(property.split('.')[1]);
                if (!isNaN(strokeIndex) && node.strokes[strokeIndex]) {
                  const strokes = [...node.strokes];
                  strokes[strokeIndex] = {
                    ...strokes[strokeIndex],
                    color: rawValue as RGBA
                  };
                  node.strokes = strokes;
                  unlinkedCount++;
                }
              }
            } else if (property === 'cornerRadius' && variable.resolvedType === 'FLOAT') {
              // Handle corner radius
              if ('cornerRadius' in node) {
                (node as any).cornerRadius = Number(rawValue);
                unlinkedCount++;
              }
            } else if (property === 'paddingLeft' && variable.resolvedType === 'FLOAT') {
              // Handle padding
              if ('paddingLeft' in node) {
                (node as any).paddingLeft = Number(rawValue);
                unlinkedCount++;
              }
            } else if (property === 'paddingRight' && variable.resolvedType === 'FLOAT') {
              if ('paddingRight' in node) {
                (node as any).paddingRight = Number(rawValue);
                unlinkedCount++;
              }
            } else if (property === 'paddingTop' && variable.resolvedType === 'FLOAT') {
              if ('paddingTop' in node) {
                (node as any).paddingTop = Number(rawValue);
                unlinkedCount++;
              }
            } else if (property === 'paddingBottom' && variable.resolvedType === 'FLOAT') {
              if ('paddingBottom' in node) {
                (node as any).paddingBottom = Number(rawValue);
                unlinkedCount++;
              }
            } else if (property === 'itemSpacing' && variable.resolvedType === 'FLOAT') {
              // Handle spacing
              if ('itemSpacing' in node) {
                (node as any).itemSpacing = Number(rawValue);
                unlinkedCount++;
              }
            } else if (property === 'opacity' && variable.resolvedType === 'FLOAT') {
              // Handle opacity
              if ('opacity' in node) {
                (node as any).opacity = Number(rawValue);
                unlinkedCount++;
              }
            } else {
              console.log(`Unsupported property for unlinking: ${property} with type ${variable.resolvedType}`);
            }
            
            // Remove the variable binding
            const boundVars = node.boundVariables as Record<string, any>;
            delete boundVars[property];
            
          } catch (err) {
            console.error(`Error unlinking variable from node ${node.name}, property ${property}:`, err);
          }
        }
      }
    }
    
    console.log(`Successfully unlinked variable ${variable.name} from ${unlinkedCount} instances`);
    
  } catch (err) {
    console.error('Error unlinking variable:', err);
  }
  
  return unlinkedCount;
}

// Control functions for scan operations
export function pauseLibraryScan(): void {
  console.log('Pausing library scan...');
  isScanPaused = true;
}

export function resumeLibraryScan(): void {
  console.log('Resuming library scan...');
  isScanPaused = false;
}

export function stopLibraryScan(): void {
  console.log('Stopping library scan...');
  isScanStopped = true;
  isScanCancelled = true;
} 