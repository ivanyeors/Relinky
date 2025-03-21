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
  isEnabled: boolean;
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
            isEnabled: !!library?.enabled,
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
          if (binding && typeof binding === 'object' && 'type' in binding && binding.type === 'VARIABLE') {
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
 * Lists all variables in the document, both local and from libraries
 * Sends analysis data to the UI
 */
export async function listAllVariables() {
  try {
    const localVariables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    // Convert collections to Library type with all required properties
    const libraries: Library[] = collections.map(collection => ({
      key: collection.key,
      name: collection.name,
      enabled: collection.remote,
      type: collection.remote ? 'REMOTE' : 'LOCAL' // Add required type property
    }));

    // Prepare analysis data
    const analysisData = {
      totalVariables: localVariables.length,
      libraryVariables: localVariables.filter(v => v.remote).length,
      localVariables: localVariables.filter(v => !v.remote).length,
      libraries: libraries.map(lib => ({
        key: lib.key,
        name: lib.name,
        enabled: lib.enabled,
        type: lib.type,
        variableCount: localVariables.filter(v => v.remote && v.key.startsWith(lib.key)).length
      }))
    };

    // Find nodes with variable bindings
    const nodesWithVariables = figma.currentPage.findAll(node => {
      return 'boundVariables' in node && node.boundVariables !== null;
    });

    console.log('Nodes with variables:', nodesWithVariables.length);
    console.log('Analysis data:', analysisData);

    // Send analysis data to UI
    figma.ui.postMessage({
      type: 'variables-analysis',
      data: analysisData
    });

  } catch (err) {
    console.error('Error listing variables:', err);
    figma.ui.postMessage({
      type: 'variables-analysis-error',
      message: 'Failed to analyze variables'
    });
  }
}

/**
 * Scans for library tokens
 * This function scans for all variables from libraries, both active and inactive
 */
export async function scanForLibraryTokens(
  scanType: string = 'all',
  ignoreHiddenLayers: boolean = false
): Promise<TokenScanResult> {
  // Reset control flags at start
  isScanPaused = false;
  isScanStopped = false;

  const result: TokenScanResult = {
    activeLibraryTokens: [],
    inactiveLibraryTokens: []
  };

  try {
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Find nodes using variables
    const nodesWithVariables = figma.currentPage.findAll(node => {
      return ('boundVariables' in node && node.boundVariables !== null) ||
             ('resolvedVariableModes' in node && node.resolvedVariableModes !== null);
    });

    // Track processed variables
    const processedVariables = new Map<string, PublishedVariable>();

    console.log('Initial scan:', {
      variables: variables.length,
      collections: collections.length,
      nodesWithVariables: nodesWithVariables.length
    });

    // Process nodes
    for (const node of nodesWithVariables) {
      // Check for stop
      if (isScanStopped) {
        figma.ui.postMessage({ type: 'library-scan-stopped' });
        return result;
      }

      // Check for pause
      while (isScanPaused && !isScanStopped) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      try {
        // Check resolved modes first (includes inherited modes)
        if ('resolvedVariableModes' in node && node.resolvedVariableModes) {
          const resolvedModes = node.resolvedVariableModes;
          
          // Process each variable reference
          for (const [variableRef, modeInfo] of Object.entries(resolvedModes)) {
            // Parse the variable reference
            const matches = variableRef.match(/VariableCollectionId:([^/]+)\/(\d+):(\d+)/);
            if (matches) {
              const [_, collectionId, variableId, variableSubId] = matches;
              const [modeId, aliasId] = modeInfo.split(':');

              console.log('Variable Usage:', {
                collectionId,
                variableId: `${variableId}:${variableSubId}`,
                modeId,
                aliasId,
                nodeName: node.name,
                nodeType: node.type
              });
            }
          }
        }

        // Then check explicit bindings
        if (node.boundVariables) {
          for (const [property, binding] of Object.entries(node.boundVariables)) {
            if (!binding || typeof binding !== 'object' || !('type' in binding)) continue;

            if (binding.type === 'VARIABLE_ALIAS') {
              const variableBinding = binding;
              const variableId = typeof variableBinding.id === 'string' ? variableBinding.id : '';
              const variable = await figma.variables.getVariableByIdAsync(variableId);
              if (!variable) continue;

              const collection = collections.find(c => c.id === variable.variableCollectionId);
              if (!collection) continue;

              // Check if variable is from a published library
              const isPublished = variable.remote && variable.key.includes(':');
              const [libraryKey] = variable.key.split(':');

              // Check if library is active
              let isActive = false;
              try {
                await figma.variables.importVariableByKeyAsync(variable.key);
                isActive = true;
              } catch {
                isActive = false;
              }

              // Get current mode value
              const modeId = Object.keys(variable.valuesByMode)[0];
              const currentValue = variable.valuesByMode[modeId];

              const token: LibraryToken = {
                id: variable.id,
                name: variable.name,
                key: variable.key,
                type: variable.resolvedType,
                libraryName: collection.name,
                isActive,
                value: currentValue,
                collection: {
                  name: collection.name,
                  id: collection.id
                },
                sourceType: 'REMOTE',
                subscribedID: libraryKey,
                usages: [{
                  nodeId: node.id,
                  nodeName: node.name,
                  property,
                  mode: modeId
                }]
              };

              if (isActive) {
                result.activeLibraryTokens.push(token);
              } else {
                result.inactiveLibraryTokens.push(token);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Error processing node:', err);
      }

      // Update progress
      figma.ui.postMessage({
        type: 'library-scan-progress',
        progress: Math.round((nodesWithVariables.indexOf(node) + 1) / nodesWithVariables.length * 100),
        currentNode: {
          name: node.name,
          type: node.type,
          processedCount: nodesWithVariables.indexOf(node) + 1,
          totalCount: nodesWithVariables.length
        }
      });
    }

    console.log('Scan Results:', {
      processedVariables: processedVariables.size,
      publishedVariables: Array.from(processedVariables.values()).filter(v => v.isPublished).length,
      activeTokens: result.activeLibraryTokens.length,
      inactiveTokens: result.inactiveLibraryTokens.length,
      activeLibraries: new Set(result.activeLibraryTokens.map(t => t.subscribedID)).size,
      inactiveLibraries: new Set(result.inactiveLibraryTokens.map(t => t.subscribedID)).size
    });

    // Only send completion if not stopped
    if (!isScanStopped) {
      figma.ui.postMessage({
        type: 'library-scan-complete',
        summary: {
          totalNodes: nodesWithVariables.length,
          totalTokens: result.activeLibraryTokens.length + result.inactiveLibraryTokens.length
        }
      });
    }

  } catch (err) {
    console.error('Error scanning library tokens:', err);
    figma.ui.postMessage({
      type: 'error',
      message: 'Failed to scan library tokens'
    });
  }

  return result;
}

/**
 * Pause library scan
 */
export function pauseLibraryScan(): void {
  isScanPaused = true;
  console.log('Library scan paused');
  figma.ui.postMessage({ type: 'library-scan-paused' });
}

/**
 * Resume library scan
 */
export function resumeLibraryScan(): void {
  isScanPaused = false;
  console.log('Library scan resumed');
  figma.ui.postMessage({ type: 'library-scan-resumed' });
}

/**
 * Stop library scan completely
 */
export function stopLibraryScan(): void {
  isScanStopped = true;
  isScanPaused = false;
  console.log('Library scan stopped');
  figma.ui.postMessage({ type: 'library-scan-stopped' });
} 