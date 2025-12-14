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

// Cache for variable data to avoid repeated API calls
const variableCache: {
  variables?: Variable[],
  collections?: VariableCollection[],
  collectionMap?: Map<string, any>,
  lastUpdated?: number
} = {};

// Cache expiry time in milliseconds (5 minutes)
const CACHE_EXPIRY = 5 * 60 * 1000;

/**
 * Gets variables and collections with caching to reduce API calls
 */
export async function getVariablesAndCollections(): Promise<{
  variables: Variable[],
  collections: VariableCollection[],
  collectionMap: Map<string, any>
}> {
  const now = Date.now();
  
  // Check if cache is valid
  if (
    variableCache.variables && 
    variableCache.collections && 
    variableCache.collectionMap &&
    variableCache.lastUpdated && 
    (now - variableCache.lastUpdated < CACHE_EXPIRY)
  ) {
    return {
      variables: variableCache.variables,
      collections: variableCache.collections,
      collectionMap: variableCache.collectionMap
    };
  }
  
  // Cache needs refresh
  const variables = await figma.variables.getLocalVariablesAsync();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionMap = createCollectionMap(collections);
  
  // Update cache
  variableCache.variables = variables;
  variableCache.collections = collections;
  variableCache.collectionMap = collectionMap;
  variableCache.lastUpdated = now;
  
  return { variables, collections, collectionMap };
}

/**
 * Invalidates the variable cache to force fresh data on next load
 */
export function invalidateVariableCache(): void {
  variableCache.lastUpdated = 0;
}

/**
 * Lists all variables available in the document
 * Optimized to use utility functions and caching
 */
export async function listAllVariables() {
  try {
    const { variables, collections, collectionMap } = await getVariablesAndCollections();
    
    // Format variables with their values
    return variables.map(variable => {
      const collection = collectionMap.get(variable.variableCollectionId);
      const value = getVariableCurrentValue(variable);
      
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
 * Optimized to use the core scanning function
 */
export async function scanForLibraryTokens(
  scanType: string = 'all',
  ignoreHiddenLayers: boolean = false
): Promise<TokenScanResult> {
  console.log(`Starting library token scan for type: ${scanType}`);
  
  // Map the scanType to the types expected by scanForVariables
  const types: string[] = [];
  
  if (scanType === 'all') {
    types.push('all');
  } else if (scanType === 'colors') {
    types.push('color');
  } else if (scanType === 'typography') {
    types.push('string');
  } else if (scanType === 'spacing') {
    types.push('number');
  }
  
  // Use the core scanning function with separation of active/inactive
  const scanOptions = {
    types,
    ignoreHiddenLayers,
    includeInactive: true,
    separateActiveInactive: true,
    cacheResults: true
  };
  
  const result = await scanForVariables(scanOptions);
  
  // Ensure we have the expected return format
  if (!Array.isArray(result)) {
    return result;
  }
  
  // If we got an array, convert it to the expected format
  return {
    activeLibraryTokens: result.filter(token => token.isActive),
    inactiveLibraryTokens: result.filter(token => !token.isActive)
  };
}

/**
 * Debounce utility to limit frequent function calls
 * Especially useful for scan operations triggered by UI events
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  
  return function(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait) as unknown as number;
  };
}

/**
 * Core scanning function that provides common functionality for all variable scanning operations
 * This function consolidates overlapping code from other scanning functions
 * 
 * @param options Configuration options for the scan
 * @param options.types Variable types to include in the scan
 * @param options.nodes Specific nodes to scan (optional)
 * @param options.ignoreHiddenLayers Whether to skip hidden layers
 * @param options.includeInactive Whether to include inactive library variables
 * @param options.scope Scope of the scan ('selection', 'parent', 'page')
 * @param options.separateActiveInactive Whether to separate active from inactive in the results
 * @param options.cacheResults Whether to cache results for later use
 * @param progressCallback Optional callback for reporting scan progress (0-100%)
 * @returns Either an array of LibraryTokens or a TokenScanResult object with separate active/inactive arrays
 */
export async function scanForVariables(
  options: {
    types?: string[],
    nodes?: SceneNode[],
    ignoreHiddenLayers?: boolean,
    includeInactive?: boolean,
    scope?: 'selection' | 'parent' | 'page',
    separateActiveInactive?: boolean,
    cacheResults?: boolean
  } = {},
  progressCallback?: (progress: number) => void
): Promise<TokenScanResult | LibraryToken[]> {
  // Default options
  const {
    types = ['all'],
    nodes,
    ignoreHiddenLayers = false,
    includeInactive = true,
    scope = 'page',
    separateActiveInactive = false,
    cacheResults = false
  } = options;

  // Reset scan control flags
  isScanPaused = false;
  isScanStopped = false;
  isScanCancelled = false;

  console.log(`Starting variable scan with options:`, options);
  
  // Create cache key if caching is enabled
  let cacheKey: string | undefined;
  if (cacheResults) {
    cacheKey = `var-scan-${types.join('-')}-${ignoreHiddenLayers}-${includeInactive}-${scope}`;
    try {
      const cachedResults = await figma.clientStorage.getAsync(cacheKey);
      if (cachedResults) {
        console.log('Using cached scan results');
        return cachedResults;
      }
    } catch (err) {
      console.warn('Cache retrieval failed:', err);
    }
  }
  
  // Get variables and collections using our cached utility
  const { variables, collections, collectionMap } = await getVariablesAndCollections();
  
  // Filter variables by type using our utility
  const filteredVariables = filterVariablesByType(variables, types);
  
  // Determine nodes to scan
  let nodesToScan: SceneNode[] = [];
  
  if (nodes && nodes.length > 0) {
    nodesToScan = nodes;
  } else if (scope === 'selection') {
    const selection = figma.currentPage.selection;
    nodesToScan = [...selection];
  } else {
    // Default to entire page
    nodesToScan = figma.currentPage.findAll(() => true) as SceneNode[];
  }
  
  // Filter nodes based on visibility
  if (ignoreHiddenLayers) {
    nodesToScan = nodesToScan.filter(node => !('visible' in node) || node.visible);
  }
  
  // Only keep nodes with variable bindings for efficiency
  nodesToScan = nodesToScan.filter(node => hasVariableBindings(node));
  
  // Track variable usage with our utility
  const nodeVariableMap = processVariableBindings(nodesToScan, (current, total) => {
    if (progressCallback) {
      progressCallback(Math.floor((current / total) * 50));
    }
  });
  
  // Process variables to create tokens
  const activeLibraryTokens: LibraryToken[] = [];
  const inactiveLibraryTokens: LibraryToken[] = [];
  
  let processedVars = 0;
  const totalVars = filteredVariables.length;
  
  for (const variable of filteredVariables) {
    if (isScanStopped || isScanCancelled) break;
    
    const collection = collectionMap.get(variable.variableCollectionId);
    const isRemote = variable.remote;
    const libraryName = collection?.name || 'Unknown Library';
    const isActive = isRemote ? !!collection?.remote : true;
    
    // Skip inactive libraries if not requested
    if (!includeInactive && !isActive) {
      continue;
    }
    
    // Get the current value using our utility
    const value = getVariableCurrentValue(variable);
    
    // Get usages for this variable
    const usages = nodeVariableMap.has(variable.id)
      ? Array.from(nodeVariableMap.get(variable.id) || []).map(usage => {
          const [nodeId, property] = usage.split(':');
          const node = figma.getNodeById(nodeId);
          return {
            nodeId,
            nodeName: node?.name || 'Unknown Node',
            property,
            mode: variable.valuesByMode && Object.keys(variable.valuesByMode)[0] || ''
          };
        })
      : [];
    
    // Only include variables with usages (unless we want all variables)
    if (usages.length > 0 || options.nodes === undefined) {
      const token: LibraryToken = {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        type: variable.resolvedType,
        libraryName,
        isActive,
        value,
        collection: collection ? {
          name: collection.name,
          id: collection.id
        } : undefined,
        sourceType: isRemote ? 'REMOTE' : 'LOCAL',
        subscribedID: variable.remote ? variable.key.split(':')[1] || '' : '',
        usages
      };
      
      if (isActive) {
        activeLibraryTokens.push(token);
      } else {
        inactiveLibraryTokens.push(token);
      }
    }
    
    processedVars++;
    if (progressCallback && (processedVars % 5 === 0 || processedVars === totalVars)) {
      progressCallback(50 + Math.floor((processedVars / totalVars) * 50));
    }
  }
  
  // Prepare result based on whether we need to separate active and inactive
  const result = separateActiveInactive 
    ? { activeLibraryTokens, inactiveLibraryTokens } 
    : [...activeLibraryTokens, ...inactiveLibraryTokens];
  
  // Cache results if enabled
  if (cacheResults && cacheKey) {
    try {
      await figma.clientStorage.setAsync(cacheKey, result);
    } catch (err) {
      console.warn('Could not cache scan results:', err);
    }
  }
  
  return result;
}

/**
 * Scans for inactive design tokens/variables
 * Finds all node with variables from inactive libraries
 * Optimized version using core scanning function
 */
export async function scanForInactiveTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];

  try {
    console.log('Starting scan for inactive tokens...');
    
    // Use scanForVariables with inactive libraries focus
    const scanOptions = {
      types: ['all'],
      nodes: nodesToScan,
      ignoreHiddenLayers,
      includeInactive: true,
      separateActiveInactive: true,
      cacheResults: false
    };
    
    const result = await scanForVariables(scanOptions, progressCallback);
    
    // Ensure we have the expected format
    if (Array.isArray(result)) {
      return missingRefs; // Empty result if array format
    }
    
    // Get inactive tokens only
    const { inactiveLibraryTokens } = result;
    
    // Group tokens by library for more efficient processing
    const tokensByLibrary = groupTokens(inactiveLibraryTokens, 'library');
    
    // Process each library group
    for (const [libraryName, tokens] of Object.entries(tokensByLibrary)) {
      // Group variables by token group for the UI
      const groupsByName: Record<string, TokenGroup> = {};
      
      // Create a token group for this library
      const groupKey = libraryName;
      groupsByName[groupKey] = {
        name: groupKey,
        variables: [],
        isEnabled: false
      };
      
      // Add variables to the group
      for (const token of tokens) {
        groupsByName[groupKey].variables.push({
          variableId: token.id,
          variableName: token.name,
          variableKey: token.key,
          variableType: token.type,
          isRemote: token.sourceType === 'REMOTE',
          libraryName: token.libraryName,
          libraryKey: token.key.split(':')[0],
          isEnabled: false
        });
        
        // Process all usages of this token
        for (const usage of token.usages) {
          const node = figma.getNodeById(usage.nodeId);
          if (!node) continue;
          
          missingRefs.push({
            nodeId: usage.nodeId,
            nodeName: usage.nodeName,
            type: 'inactive-tokens',
            property: usage.property,
            currentValue: {
              variableName: token.name,
              libraryName: token.libraryName,
              libraryKey: token.key.split(':')[0],
              groupName: groupKey,
              totalGroupVariables: groupsByName[groupKey].variables.length
            },
            location: 'Inactive Library Token',
            variableName: token.name,
            preview: `${groupKey} (${groupsByName[groupKey].variables.length} tokens)`,
            isInactiveLibrary: true,
            isVisible: 'visible' in node ? node.visible : true
          });
        }
      }
    }
    
    console.log(`Scan complete. Found ${missingRefs.length} inactive token references.`);
  } catch (err) {
    console.error('Error scanning for inactive tokens:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for all variables (linked and unlinked)
 * This is the main scanning function for the Variables Unlinker feature
 * Optimized version using core scanning function
 */
export async function scanForAllVariables(
  selectedTypes: string[] = ['all'],
  progressCallback: (progress: number) => void,
  ignoreHiddenLayers: boolean = false
): Promise<LibraryToken[]> {
  console.log(`Starting variables scan for types: ${selectedTypes.join(', ')}`);
  
  // Use scanForVariables with proper options
  const scanOptions = {
    types: selectedTypes,
    ignoreHiddenLayers,
    includeInactive: true,
    separateActiveInactive: false,
    cacheResults: true
  };
  
  const result = await scanForVariables(scanOptions, progressCallback);
  
  // Convert to expected return format
  return Array.isArray(result) ? result : [...result.activeLibraryTokens, ...result.inactiveLibraryTokens];
}

/**
 * Utility function to apply a raw value to a specific property on a node
 * Consolidates the property-specific code from unlinkVariable
 */
export function applyRawValueToProperty(
  node: SceneNode, 
  property: string, 
  rawValue: any, 
  variableType: VariableResolvedDataType
): boolean {
  try {
    if (property.startsWith('fills') && variableType === 'COLOR') {
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
          return true;
        }
      }
    } else if (property.startsWith('strokes') && variableType === 'COLOR') {
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
          return true;
        }
      }
    } else if (property === 'cornerRadius' && variableType === 'FLOAT') {
      // Handle corner radius
      if ('cornerRadius' in node) {
        (node as any).cornerRadius = Number(rawValue);
        return true;
      }
    } else if (['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'].includes(property) && variableType === 'FLOAT') {
      // Handle padding properties
      if (property in node) {
        (node as any)[property] = Number(rawValue);
        return true;
      }
    } else if (property === 'itemSpacing' && variableType === 'FLOAT') {
      // Handle spacing
      if ('itemSpacing' in node) {
        (node as any).itemSpacing = Number(rawValue);
        return true;
      }
    } else if (property === 'opacity' && variableType === 'FLOAT') {
      // Handle opacity
      if ('opacity' in node) {
        (node as any).opacity = Number(rawValue);
        return true;
      }
    } else {
      console.log(`Unsupported property for unlinking: ${property} with type ${variableType}`);
      return false;
    }
  } catch (err) {
    console.error(`Error applying raw value to property ${property}:`, err);
    return false;
  }
  
  return false;
}

/**
 * Unlink a variable from all its usages
 * Converts variable references to their raw values
 * Optimized version using utility functions
 */
export async function unlinkVariableUsages(variableId: string): Promise<number> {
  let unlinkedCount = 0;
  
  try {
    // Get the variable to access its current value
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) {
      throw new Error(`Variable with ID ${variableId} not found`);
    }
    
    // Get the raw value using our utility function
    const rawValue = getVariableCurrentValue(variable);
    if (rawValue === undefined) {
      throw new Error(`Could not retrieve value for variable ${variable.name}`);
    }
    
    // Find all nodes using this variable
    const nodesWithVariable = figma.currentPage.findAll(node => {
      if (!hasVariableBindings(node)) return false;
      
      // Check if any binding uses this variable
      const boundVars = (node as any).boundVariables as Record<string, any>;
      return Object.values(boundVars).some(binding => 
        binding && typeof binding === 'object' && 'id' in binding && binding.id === variableId
      );
    });
    
    console.log(`Found ${nodesWithVariable.length} nodes using variable ${variable.name}`);
    
    // Process each node to unlink the variable
    for (const node of nodesWithVariable) {
      if (!hasVariableBindings(node)) continue;
      
      const boundVars = (node as any).boundVariables as Record<string, any>;
      
      // Find properties using this variable
      for (const [property, binding] of Object.entries(boundVars)) {
        if (binding && typeof binding === 'object' && 'id' in binding && binding.id === variableId) {
          // Apply the raw value using our utility function
          const success = applyRawValueToProperty(node, property, rawValue, variable.resolvedType);
          
          if (success) {
            // Remove the variable binding
            delete boundVars[property];
            unlinkedCount++;
          }
        }
      }
    }
    
    console.log(`Successfully unlinked variable ${variable.name} from ${unlinkedCount} usages`);
    
  } catch (err) {
    console.error('Error unlinking variable:', err);
    throw err; // Re-throw to allow proper error handling in batch operations
  }
  
  return unlinkedCount;
}

/**
 * @deprecated Use `unlinkVariableUsages` instead.
 */
export async function unlinkVariable(variableId: string): Promise<number> {
  return unlinkVariableUsages(variableId);
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

// --- Enhanced Unlink Feature Development: Task 1 Implementation ---

// Helper interfaces for enhanced token grouping
export interface ValueGroup {
  id: string;
  name: string;
  type: VariableResolvedDataType;
  values: TokenValue[];
  usageCount: number;
  source?: 'REMOTE' | 'LOCAL';
  libraryName?: string;
  collectionName?: string;
}

export interface TokenValue {
  id: string;
  name: string;
  value: any;
  variableId?: string;
  nodeIds: string[];
  usageCount: number;
  properties: string[];
}

/**
 * Gets all document variables with enhanced metadata
 * Implementation for Subtask 3.2
 */
export async function getDocumentVariables(): Promise<Record<string, any>[]> {
  try {
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    const collectionMap = new Map(
      collections.map(collection => [collection.id, {
        id: collection.id,
        name: collection.name,
        remote: collection.remote,
        key: collection.key,
        modes: collection.modes
      }])
    );
    
    return variables.map(variable => {
      const collection = collectionMap.get(variable.variableCollectionId);
      const currentMode = collection?.modes[0]?.modeId || Object.keys(variable.valuesByMode)[0];
      const value = variable.valuesByMode[currentMode];
      
      // Parse library information from key if remote
      let libraryInfo = null;
      if (variable.remote && variable.key) {
        const keyParts = variable.key.split(':');
        libraryInfo = {
          key: keyParts[0] || '',
          id: keyParts[1] || ''
        };
      }
      
      return {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        resolvedType: variable.resolvedType,
        value,
        collection: collection ? {
          id: collection.id,
          name: collection.name,
          remote: collection.remote,
          key: collection.key
        } : null,
        remote: variable.remote,
        libraryInfo,
        modes: Object.keys(variable.valuesByMode)
      };
    });
  } catch (err) {
    console.error('Error getting document variables:', err);
    return [];
  }
}

/**
 * Categorizes variables by type
 * Implementation for Subtask 3.3
 */
export function categorizeVariablesByType(variables: Record<string, any>[]): Record<string, Record<string, any>[]> {
  const categories: Record<string, Record<string, any>[]> = {
    COLOR: [],
    FLOAT: [],
    BOOLEAN: [],
    STRING: []
  };
  
  for (const variable of variables) {
    const type = variable.resolvedType;
    if (type in categories) {
      categories[type].push(variable);
    }
  }
  
  return categories;
}

/**
 * Analyzes variable usage in the document
 * Implementation for Subtask 3.5
 */
export async function analyzeVariableUsage(progressCallback?: (progress: number) => void): Promise<Record<string, {nodeIds: string[], properties: string[]}>> {
  const usageMap: Record<string, {nodeIds: string[], properties: string[]}> = {};
  
  try {
    // Find all nodes with variable bindings
    const nodesWithBindings = figma.currentPage.findAll(node => hasVariableBindings(node));
    const totalNodes = nodesWithBindings.length;
    
    console.log(`Found ${totalNodes} nodes with variable bindings`);
    
    for (let i = 0; i < totalNodes; i++) {
      const node = nodesWithBindings[i];
      
      // Double-check that node has variable bindings
      if (!hasVariableBindings(node)) continue;
      
      // Use type assertion since we've verified hasVariableBindings is true
      const boundVars = (node as any).boundVariables as Record<string, any>;
      
      for (const [property, binding] of Object.entries(boundVars)) {
        if (binding && typeof binding === 'object' && 'id' in binding) {
          const variableId = binding.id as string;
          
          if (!usageMap[variableId]) {
            usageMap[variableId] = {
              nodeIds: [],
              properties: []
            };
          }
          
          usageMap[variableId].nodeIds.push(node.id);
          
          if (!usageMap[variableId].properties.includes(property)) {
            usageMap[variableId].properties.push(property);
          }
        }
      }
      
      if (progressCallback && i % 10 === 0) {
        progressCallback(Math.floor((i / totalNodes) * 100));
      }
    }
    
    if (progressCallback) {
      progressCallback(100);
    }
    
    console.log(`Variable usage analysis complete. Found ${Object.keys(usageMap).length} variables in use.`);
  } catch (err) {
    console.error('Error analyzing variable usage:', err);
  }
  
  return usageMap;
}

/**
 * Utility function to create a collection map from variable collections
 * This consolidates duplicate code across various functions
 */
export function createCollectionMap(collections: VariableCollection[]): Map<string, any> {
  return new Map(
    collections.map(collection => [collection.id, {
      id: collection.id,
      name: collection.name,
      remote: collection.remote,
      key: collection.key,
      modes: collection.modes
    }])
  );
}

/**
 * Utility function to get the current mode value of a variable
 * This consolidates duplicate code across various functions
 */
export function getVariableCurrentValue(variable: Variable): any {
  const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
  const modes = Object.keys(variable.valuesByMode);
  const currentMode = collection?.modes[0]?.modeId || modes[0];
  return variable.valuesByMode[currentMode];
}

/**
 * Utility function to process variable bindings from nodes
 * This consolidates duplicate code across various functions
 */
export function processVariableBindings(
  nodes: SceneNode[],
  progressCallback?: (progress: number, total: number) => void
): Map<string, Set<string>> {
  const nodeVariableMap = new Map<string, Set<string>>();
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    
    if (!('boundVariables' in node) || !node.boundVariables) continue;
    
    for (const [property, binding] of Object.entries(node.boundVariables)) {
      if (binding && typeof binding === 'object' && 'id' in binding) {
        const variableId = binding.id as string;
        if (!nodeVariableMap.has(variableId)) {
          nodeVariableMap.set(variableId, new Set());
        }
        nodeVariableMap.get(variableId)?.add(`${node.id}:${property}`);
      }
    }
    
    if (progressCallback) {
      progressCallback(i, nodes.length);
    }
  }
  
  return nodeVariableMap;
}

/**
 * Groups tokens by various criteria
 * Implementation for Task 6
 */
export function groupTokens(
  tokens: LibraryToken[],
  groupBy: 'type' | 'collection' | 'library' = 'type'
): Record<string, LibraryToken[]> {
  const groups: Record<string, LibraryToken[]> = {};
  
  for (const token of tokens) {
    let key: string;
    
    switch (groupBy) {
      case 'type':
        key = token.type;
        break;
      case 'collection':
        key = token.collection?.name || 'Unknown Collection';
        break;
      case 'library':
        key = token.libraryName || 'Local Variables';
        break;
      default:
        key = token.type;
    }
    
    if (!groups[key]) {
      groups[key] = [];
    }
    
    groups[key].push(token);
  }
  
  return groups;
}

/**
 * Utility function to filter variables by type
 */
export function filterVariablesByType(variables: Variable[], types: string[]): Variable[] {
  return variables.filter(variable => {
    if (types.includes('all')) return true;
    
    if (types.includes('color') && variable.resolvedType === 'COLOR') return true;
    if (types.includes('boolean') && variable.resolvedType === 'BOOLEAN') return true;
    if (types.includes('number') && variable.resolvedType === 'FLOAT') return true;
    if (types.includes('string') && variable.resolvedType === 'STRING') return true;
    
    return false;
  });
}

/**
 * Scans the entire document for variables
 * Implementation updated to use the core scanForVariables function
 */
export async function scanEntireDocument(
  options: {
    types?: string[],
    ignoreHiddenLayers?: boolean,
    includeComponents?: boolean
  } = {},
  progressCallback?: (progress: number) => void
): Promise<LibraryToken[]> {
  // Default options
  const {
    types = ['all'],
    ignoreHiddenLayers = false,
    includeComponents = true
  } = options;
  
  const scanOptions = {
    types,
    ignoreHiddenLayers,
    includeInactive: true,
    scope: 'page' as const,
    separateActiveInactive: false,
    cacheResults: true
  };
  
  const result = await scanForVariables(scanOptions, progressCallback);
  return Array.isArray(result) ? result : [...result.activeLibraryTokens, ...result.inactiveLibraryTokens];
}

/**
 * Scans a selection for variables
 * Implementation updated to use the core scanForVariables function
 */
export async function scanSelection(
  selection: readonly SceneNode[],
  options: {
    types?: string[],
    scope?: 'selection' | 'parent' | 'page',
    ignoreHiddenLayers?: boolean
  } = {},
  progressCallback?: (progress: number) => void
): Promise<LibraryToken[]> {
  if (!selection || selection.length === 0) {
    console.log('No selection to scan');
    return [];
  }
  
  // Default options
  const {
    types = ['all'],
    scope = 'selection',
    ignoreHiddenLayers = false
  } = options;
  
  // If page scope, use the document scanning function
  if (scope === 'page') {
    return scanEntireDocument({ types, ignoreHiddenLayers }, progressCallback);
  }
  
  // Determine nodes to scan based on scope
  let nodesToScan: SceneNode[] = [];
  
  if (scope === 'selection') {
    nodesToScan = [...selection];
  } else if (scope === 'parent') {
    // Get parent of first selection
    const parent = selection[0].parent;
    if (parent && 'findAll' in parent) {
      nodesToScan = parent.findAll(() => true) as SceneNode[];
    } else {
      nodesToScan = [...selection];
    }
  }
  
  const scanOptions = {
    types,
    nodes: nodesToScan,
    ignoreHiddenLayers,
    includeInactive: true,
    scope: 'selection' as const,
    separateActiveInactive: false,
    cacheResults: false
  };
  
  const result = await scanForVariables(scanOptions, progressCallback);
  return Array.isArray(result) ? result : [...result.activeLibraryTokens, ...result.inactiveLibraryTokens];
}

/**
 * Batch unlinks multiple variables
 * Implementation for Task 7.1
 */
export async function batchUnlinkVariables(
  variableIds: string[],
  options: {
    preserveValues?: boolean,
    progressCallback?: (progress: number) => void
  } = {}
): Promise<{ 
  success: number, 
  failed: number, 
  errors: Array<{ variableId: string, error: string }>
}> {
  const { 
    preserveValues = true,
    progressCallback
  } = options;
  
  const result = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ variableId: string, error: string }>
  };
  
  // Start a single transaction for all changes
  figma.skipInvisibleInstanceChildren = true;
  
  try {
    for (let i = 0; i < variableIds.length; i++) {
      const variableId = variableIds[i];
      
      try {
        const unlinkedCount = await unlinkVariableUsages(variableId);
        if (unlinkedCount > 0) {
          result.success++;
        } else {
          result.failed++;
          result.errors.push({
            variableId,
            error: 'No instances were unlinked'
          });
        }
      } catch (err) {
        result.failed++;
        result.errors.push({
          variableId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      
      if (progressCallback) {
        progressCallback(Math.round(((i + 1) / variableIds.length) * 100));
      }
    }
  } catch (err) {
    console.error('Error in batch unlinking:', err);
  }
  
  return result;
}

/**
 * Helper function to clear all variable caches
 * Should be called when variables are modified or when refreshing data
 */
export function clearAllCaches(): void {
  // Clear in-memory cache
  invalidateVariableCache();
  
  // Clear figma.clientStorage caches
  [
    'document-scan-all-false-true',
    'var-scan-all-false-true-page',
    'var-scan-color-false-true-page',
    'var-scan-string-false-true-page',
    'var-scan-number-false-true-page',
    'var-scan-boolean-false-true-page'
  ].forEach(key => {
    figma.clientStorage.deleteAsync(key).catch(() => {});
  });
}