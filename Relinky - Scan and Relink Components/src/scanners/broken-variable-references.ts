// Deleted Variables Scanner Module
// Handles scanning for deleted variables in the document and selected nodes

import { MissingReference, ScanType, isNodeFromLibraryInstance, prepareLibraryInstanceFiltering, ProgressCallback, ProgressMetadata } from '../common';
import { isScancelled } from './index';

// Define variable type categories for better filtering
export interface VariableTypeMetadata {
  type: string;
  displayName: string;
  properties: string[];
}

export const VARIABLE_TYPE_CATEGORIES: VariableTypeMetadata[] = [
  {
    type: 'typography',
    displayName: 'Typography',
    properties: ['fontName', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textCase', 'textDecoration']
  },
  {
    type: 'color',
    displayName: 'Colors',
    properties: ['fill', 'fills', 'stroke', 'strokes', 'backgroundColor']
  },
  {
    type: 'spacing',
    displayName: 'Spacing',
    properties: ['padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'itemSpacing', 'gap']
  },
  {
    type: 'radius',
    displayName: 'Corner Radius',
    properties: ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']
  },
  {
    type: 'effect',
    displayName: 'Effects',
    properties: ['effects', 'blur', 'shadow']
  },
  {
    type: 'layout',
    displayName: 'Layout',
    properties: ['width', 'height', 'layoutMode', 'layoutAlign', 'layoutGrow']
  },
  {
    type: 'opacity',
    displayName: 'Opacity',
    properties: ['opacity', 'fillOpacity', 'strokeOpacity', 'effectOpacity']
  }
];

// Helper function to determine variable category from property
function getVariableCategory(property: string): string {
  for (const category of VARIABLE_TYPE_CATEGORIES) {
    if (category.properties.some(prop => property.toLowerCase().includes(prop.toLowerCase()))) {
      return category.type;
    }
  }
  return 'other';
}

/**
 * Creates a timeout promise that rejects after specified milliseconds
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
}

/**
 * Checks if a variable is deleted or from a missing library with timeout protection
 */
async function isDeletedOrMissingLibraryVariable(variableId: string): Promise<{
  isDeleted: boolean, 
  isMissingLibrary?: boolean,
  error?: string, 
  resolvedType?: string,
  variableName?: string,
  libraryName?: string
}> {
  try {
    console.log(`Checking variable: ${variableId}`);
    
    // Add timeout protection to prevent hanging
    const timeoutMs = 5000; // 5 second timeout
    const variablePromise = figma.variables.getVariableByIdAsync(variableId);
    
    const variable = await Promise.race([
      variablePromise,
      createTimeout(timeoutMs)
    ]);
    
    if (!variable) {
      console.log(`Variable ${variableId} not found - marked as deleted`);
      return { isDeleted: true };
    }
    
    // Check if variable has deletedButReferenced property (Figma API feature)
    // This indicates the variable was deleted but still has references
    if ('deletedButReferenced' in variable && variable.deletedButReferenced === true) {
      console.log(`Variable ${variableId} is marked as deletedButReferenced`);
      return {
        isDeleted: true,
        variableName: variable.name,
        libraryName: 'Deleted Variable',
        resolvedType: variable.resolvedType
      };
    }
    
    // Check if it's a remote variable (from external library)
    const isRemoteVariable = variable.remote === true;
    
    // Additional check for variables that might be in a bad state
    // Sometimes variables exist but have no valid collection reference
    if (!variable.variableCollectionId) {
      console.log(`Variable ${variableId} has no collection ID - treating as orphaned`);
      return {
        isDeleted: true,
        variableName: variable.name,
        libraryName: 'Orphaned Variable',
        resolvedType: variable.resolvedType
      };
    }
    
    if (isRemoteVariable) {
      try {
        // For remote variables, check if we can access the collection
        const variableCollectionId = variable.variableCollectionId;
        
        // Try to get all collections to see if this one is accessible
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const collectionFound = collections.some(col => col.id === variableCollectionId);
        
        if (!collectionFound) {
          // Collection not found locally, it's from a missing library
          console.log(`Variable ${variableId} is from a missing library - collection not found`);
          return {
            isDeleted: false,
            isMissingLibrary: true,
            variableName: variable.name,
            libraryName: 'Missing Library',
            resolvedType: variable.resolvedType
          };
        }
        
        // Even if collection exists, check if we can access values
        try {
          const valuesByMode = variable.valuesByMode;
          const modes = Object.keys(valuesByMode || {});
          
          // No modes means we can't access the values
          if (!valuesByMode || modes.length === 0) {
            console.log(`Variable ${variableId} has no accessible values - library is missing`);
            return {
              isDeleted: false,
              isMissingLibrary: true,
              variableName: variable.name,
              libraryName: 'Missing Library',
              resolvedType: variable.resolvedType
            };
          }
          
          // Try to read at least one value
          let canReadValue = false;
          for (const modeId of modes) {
            try {
              const value = valuesByMode[modeId];
              if (value !== undefined && value !== null) {
                canReadValue = true;
                break;
              }
            } catch (valueErr) {
              console.log(`Cannot read value for mode ${modeId}:`, valueErr);
            }
          }
          
          if (!canReadValue) {
            console.log(`Variable ${variableId} values are not accessible - library is missing`);
            return {
              isDeleted: false,
              isMissingLibrary: true,
              variableName: variable.name,
              libraryName: 'Missing Library',
              resolvedType: variable.resolvedType
            };
          }
        } catch (accessErr) {
          console.log(`Error accessing variable ${variableId} values - library is missing:`, accessErr);
          return {
            isDeleted: false,
            isMissingLibrary: true,
            variableName: variable.name,
            libraryName: 'Missing Library',
            resolvedType: variable.resolvedType
          };
        }
      } catch (collectionErr) {
        console.log(`Error checking variable collection - treating as missing:`, collectionErr);
        return {
          isDeleted: false,
          isMissingLibrary: true,
          variableName: variable.name,
          libraryName: 'Missing Library',
          resolvedType: variable.resolvedType
        };
      }
    }
    
    // Additional check: Try to resolve the variable to ensure it's truly accessible
    // This catches edge cases where the variable exists but can't be used
    try {
      // For local variables, verify they're in a valid collection
      if (!isRemoteVariable) {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const variableInCollection = collections.some(col => 
          col.variableIds && col.variableIds.includes(variableId)
        );
        
        if (!variableInCollection) {
          console.log(`Variable ${variableId} not found in any collection - treating as deleted`);
          return {
            isDeleted: true,
            variableName: variable.name,
            libraryName: 'Orphaned Variable',
            resolvedType: variable.resolvedType
          };
        }
      }
      
      // Final check: ensure we can read the variable's current value
      const valuesByMode = variable.valuesByMode;
      if (!valuesByMode || Object.keys(valuesByMode).length === 0) {
        console.log(`Variable ${variableId} has no values - treating as deleted`);
        return {
          isDeleted: true,
          variableName: variable.name,
          libraryName: 'Invalid Variable',
          resolvedType: variable.resolvedType
        };
      }
    } catch (validationErr) {
      console.log(`Variable ${variableId} validation failed:`, validationErr);
      return {
        isDeleted: true,
        variableName: variable.name,
        libraryName: 'Invalid Variable',
        resolvedType: variable.resolvedType,
        error: String(validationErr)
      };
    }
    
    // One more check: For variables that appear accessible but might have issues
    // Check if we can actually use this variable in practice
    try {
      // Get the collection this variable belongs to
      const variableCollectionId = variable.variableCollectionId;
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collection = collections.find(col => col.id === variableCollectionId);
      
      // If collection is remote but variable is not marked as remote, it's in a bad state
      if (collection && collection.remote && !isRemoteVariable) {
        console.log(`Variable ${variableId} is in remote collection but not marked as remote - treating as missing`);
        return {
          isDeleted: false,
          isMissingLibrary: true,
          variableName: variable.name,
          libraryName: collection.name || 'Remote Library',
          resolvedType: variable.resolvedType
        };
      }
      
      // Check if the variable has any alias references that might be broken
      const valuesByMode = variable.valuesByMode;
      for (const modeId in valuesByMode) {
        const value = valuesByMode[modeId];
        if (value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
          // This is a variable alias, check if the referenced variable exists
          try {
            const aliasedVar = await figma.variables.getVariableByIdAsync(value.id);
            if (!aliasedVar) {
              console.log(`Variable ${variableId} references non-existent variable ${value.id} - treating as broken`);
              return {
                isDeleted: false,
                isMissingLibrary: true,
                variableName: variable.name,
                libraryName: 'Broken Reference',
                resolvedType: variable.resolvedType
              };
            }
          } catch (aliasErr) {
            console.log(`Variable ${variableId} has broken alias reference:`, aliasErr);
            return {
              isDeleted: false,
              isMissingLibrary: true,
              variableName: variable.name,
              libraryName: 'Broken Reference',
              resolvedType: variable.resolvedType
            };
          }
        }
      }
    } catch (finalCheckErr) {
      console.log(`Final validation check failed for ${variableId}:`, finalCheckErr);
    }
    
    // Variable exists and is truly accessible
    console.log(`Variable ${variableId} exists and is active - not deleted or missing`);
    return { 
      isDeleted: false,
      isMissingLibrary: false,
      resolvedType: variable.resolvedType
    };
  } catch (err) {
    // If we get an error trying to access the variable, it is likely deleted
    const errorMessage = String(err);
    console.log(`Error accessing variable ${variableId}, likely deleted:`, errorMessage);
    return { isDeleted: true, error: errorMessage };
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
function shouldIncludeNode(node: SceneNode, ignoreHiddenLayers: boolean, skipInstances: boolean = false): boolean {
  if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
    return false;
  }
  // Skip library-backed instances when configured
  if (skipInstances && isNodeFromLibraryInstance(node)) return false;
  
  return true;
}

/**
 * Scan for broken variable references (deleted variables and missing/inaccessible libraries)
 * Returns variables that are:
 * 1. Actually deleted (no longer exist)
 * 2. From external libraries that are no longer accessible
 * Excludes active/working variables from results
 * Returns both the results and available variable types for filtering
 */
export async function scanForBrokenVariableReferences(
  progressCallback: ProgressCallback = () => {},
  selectedFrameIds: string[] | undefined = undefined,
  ignoreHiddenLayers: boolean = false,
  variableTypes: string[] = [],
  skipInstances: boolean = false
): Promise<{
  results: MissingReference[],
  availableTypes: Set<string>
}> {
  console.log('Starting broken variable references scan');

  await prepareLibraryInstanceFiltering(skipInstances);
  
  // Overall timeout to prevent infinite scans
  const overallTimeout = 120000; // 2 minutes max
  const scanStartTime = Date.now();
  
  const checkOverallTimeout = () => {
    if (Date.now() - scanStartTime > overallTimeout) {
      console.log('Overall scan timeout reached - ending scan with partial results');
      return true;
    }
    return false;
  };
  
  const results: MissingReference[] = [];
  const availableTypes = new Set<string>();
  const filterByTypes = variableTypes.length > 0;
  
  if (filterByTypes) {
    console.log(`Filtering deleted variables by types:`, variableTypes);
  }
  
  // Initialize progress tracking
  let lastReportedPercent = 0;
  
  // Update progress with smoother reporting and logging
  const reportProgress = (percent: number, metadata: ProgressMetadata = {}) => {
    const normalizedPercent = Math.min(99.5, Math.max(0, percent));
    
    if (normalizedPercent - lastReportedPercent >= 0.5 || normalizedPercent >= 99.5) {
      lastReportedPercent = normalizedPercent;
      progressCallback(normalizedPercent / 100, metadata);
      console.log(`Broken variable references scan progress: ${normalizedPercent.toFixed(1)}%`);
    }
  };
  
  // Debounced version to avoid too many updates
  let reportProgressTimeout: number | null = null;
  const reportProgressWithDebounce = (percent: number, metadata: ProgressMetadata = {}) => {
    if (reportProgressTimeout) {
      clearTimeout(reportProgressTimeout);
    }
    reportProgressTimeout = setTimeout(() => {
      reportProgress(percent, metadata);
    }, 100) as unknown as number;
  };
  
  // Update to show scan has started
  reportProgress(1, { phase: 'start' });
  
  // Get nodes to scan
  let nodesToScan: SceneNode[] = [];
  
  // Determine which nodes to scan - prioritize selection
  if (selectedFrameIds && selectedFrameIds.length > 0) {
    // Get selected nodes from IDs
    nodesToScan = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => node !== null && 'type' in node));
    
    console.log('Scanning selected objects/groups:', nodesToScan.length, 'nodes');
  } else if (figma.currentPage.selection.length > 0) {
    // Use current selection if no specific IDs provided
    nodesToScan = figma.currentPage.selection.filter((node): node is SceneNode => 'type' in node);
    console.log('Scanning current selection:', nodesToScan.length, 'nodes');
  } else {
    // Fallback to current page
    nodesToScan = Array.from(figma.currentPage.children);
    console.log('No selection found, scanning entire page:', nodesToScan.length, 'top-level nodes');
  }
  
  // Update progress after determining scan scope
  reportProgress(5, {
    phase: 'scope-prepared',
    totalCount: nodesToScan.length
  });
  
  // Nodes with boundVariables and/or missingVariables
  const nodes: SceneNode[] = [];
  let nodesExamined = 0;
  let totalNodesToExamine = 0;
  
  // First pass to estimate total nodes for better progress reporting
  for (const node of nodesToScan) {
    if (isScancelled()) break;
    
    const estimateNodeCount = (n: SceneNode) => {
      totalNodesToExamine++;
      if ('children' in n) {
        for (const child of n.children) {
          estimateNodeCount(child as SceneNode);
        }
      }
    };
    
    estimateNodeCount(node);
  }
  
  // Update progress after estimation
  reportProgress(10, {
    phase: 'scope-estimated',
    totalCount: totalNodesToExamine
  });
  console.log(`Estimated ${totalNodesToExamine} total nodes to examine`);
  
  // Now collect nodes with variables
  for (const node of nodesToScan) {
    if (isScancelled() || checkOverallTimeout()) break;
    
    // Recursive function to collect nodes
    const collectNodes = (n: SceneNode, depth: number = 0) => {
      // Check if scan was cancelled or timed out
      if (isScancelled() || checkOverallTimeout()) {
        return;
      }
      
      // Prevent infinite recursion
      if (depth > 100) {
        console.warn(`Max depth reached for node ${n.name} - stopping recursion`);
        return;
      }
      
      nodesExamined++;
      if (nodesExamined % 100 === 0 && totalNodesToExamine > 0) { 
        // Update progress during collection phase
        const collectionRatio = nodesExamined / totalNodesToExamine;
        const collectionProgress = 10 + Math.min(20, Math.round(collectionRatio * 20));
        reportProgress(collectionProgress, {
          phase: 'collecting-nodes',
          processedCount: nodesExamined,
          totalCount: totalNodesToExamine
        });
      }

      if (skipInstances && isNodeFromLibraryInstance(n)) {
        return;
      }
      
          if (shouldIncludeNode(n, ignoreHiddenLayers, skipInstances)) {
      const hasBoundVariables = 'boundVariables' in n && n.boundVariables && Object.keys(n.boundVariables).length > 0;
      const hasMissingVariables = 'missingVariables' in n && n.missingVariables && Object.keys(n.missingVariables).length > 0;
      
      if (hasBoundVariables || hasMissingVariables) {
        nodes.push(n);
      }
    }
      
      if ('children' in n && n.children) {
        n.children.forEach(child => {
          collectNodes(child as SceneNode, depth + 1);
        });
      }
    };
    
    collectNodes(node);
  }
  
  console.log(`Found ${nodes.length} nodes to scan for deleted variables`);
  // Update progress after node collection
  reportProgress(30, {
    phase: 'collecting-nodes',
    processedCount: nodes.length,
    totalCount: nodes.length
  });

  if (nodes.length === 0) {
    console.log('No nodes require scanning after applying skipInstances filter.');
    progressCallback(100);
    return {
      results,
      availableTypes
    };
  }
  
  // Process each node with better error handling and cancellation checks
  let processedNodes = 0;
  const nodeProcessingWeight = 70; // 70% of the total progress is for node processing
  const maxProcessingTime = 30000; // 30 second maximum per node
  const startTime = Date.now();
  
  console.log(`Processing ${nodes.length} nodes for deleted variables`);
  
  for (let i = 0; i < nodes.length; i++) {
    if (isScancelled()) {
      console.log('Deleted variables scan cancelled');
      break;
    }
    
    // Check overall timeout
    if (checkOverallTimeout()) {
      break;
    }
    
    // Check if we've been processing too long
    if (Date.now() - startTime > maxProcessingTime * nodes.length) {
      console.log('Deleted variables scan timed out - stopping to show partial results');
      break;
    }
    
    const node = nodes[i];
    console.log(`Processing node ${i + 1}/${nodes.length}: ${node.name} (${node.id})`);
    
    try {
      // Handle missingVariables property - these are truly deleted/missing variables
      if ('missingVariables' in node && node.missingVariables) {
        let propertiesProcessed = 0;
        const totalProperties = Object.keys(node.missingVariables).length;
        console.log(`Found ${totalProperties} missing variables in node ${node.name}`);
        
        for (const [property, missingInfo] of Object.entries(node.missingVariables)) {
          if (isScancelled()) break;
          
          if (missingInfo) {
            const libraryName = missingInfo.libraryName || 'Unknown Library';
            const variableName = missingInfo.variableName || 'Unknown Variable';
            
            // Determine variable category
            const variableCategory = getVariableCategory(property);
            availableTypes.add(variableCategory);
            
            // Filter by types if specified
            if (!filterByTypes || variableTypes.includes(variableCategory)) {
              const groupKey = `deleted-variable-${libraryName}-${variableName}`;
              
              results.push({
                nodeId: node.id,
                nodeName: node.name,
                location: getNodePath(node),
                property,
                type: 'missing',
                currentValue: {
                  libraryName,
                  variableName,
                  variableType: variableCategory
                },
                isMissingLibrary: true,
                groupKey,
                isVisible: node.visible !== false,
                libraryName,
                variableCategory, // Add category for filtering
                variableType: variableCategory
              });
            }
          }
          
          propertiesProcessed++;
          // Update progress during property processing
          if (propertiesProcessed % 5 === 0 || propertiesProcessed === totalProperties) {
            const safeTotalProperties = Math.max(totalProperties, 1);
            const nodeProgress = 30 + (nodeProcessingWeight * (i + (propertiesProcessed / safeTotalProperties)) / Math.max(nodes.length, 1));
            reportProgress(Math.round(nodeProgress), {
              phase: 'processing-nodes',
              processedCount: processedNodes,
              totalCount: nodes.length
            });
          }
        }
      }
      
      // Handle boundVariables - only include those that are actually deleted/inaccessible
      if ('boundVariables' in node && node.boundVariables) {
        let bindingsProcessed = 0;
        const totalBindings = Object.keys(node.boundVariables).length;
        console.log(`Found ${totalBindings} bound variables in node ${node.name} - checking for deleted ones`);
        
        // Collect all variable IDs to check in batches
        const variableIdsToCheck: Array<{id: string, property: string, arrayIndex?: number}> = [];
        
        for (const [property, binding] of Object.entries(node.boundVariables)) {
          // Pre-filter by variable type to avoid unnecessary variable lookups
          const variableCategory = getVariableCategory(property);
          if (filterByTypes && !variableTypes.includes(variableCategory)) {
            continue;
          }

          if (binding && typeof binding === 'object') {
            if ('id' in binding) {
              variableIdsToCheck.push({ id: binding.id as string, property });
            } else if (Array.isArray(binding)) {
              for (let j = 0; j < binding.length; j++) {
                const item = binding[j];
                if (item && typeof item === 'object' && 'id' in item) {
                  variableIdsToCheck.push({ id: item.id as string, property, arrayIndex: j });
                }
              }
            }
          }
        }
        
                  // Process variable IDs in smaller batches to prevent blocking
          const batchSize = 10;
          for (let batchStart = 0; batchStart < variableIdsToCheck.length; batchStart += batchSize) {
            if (isScancelled() || checkOverallTimeout()) break;
            
            const batch = variableIdsToCheck.slice(batchStart, batchStart + batchSize);
            console.log(`Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(variableIdsToCheck.length / batchSize)} for node ${node.name}`);
            
            // Process batch with Promise.all but with individual error handling
            const batchPromises = batch.map(async ({id: variableId, property, arrayIndex}) => {
              try {
                const checkResult = await isDeletedOrMissingLibraryVariable(variableId);
                
                // Include variables that are either deleted or from missing libraries
                if (checkResult.isDeleted || checkResult.isMissingLibrary) {
                  console.log(`Confirmed ${checkResult.isDeleted ? 'deleted' : 'missing library'} variable: ${variableId} in property: ${property}`);
                  
                  let variableName = checkResult.variableName || 'Unknown Variable';
                  let libraryName = checkResult.libraryName || 'Unknown Library';
                  
                  // For deleted variables, try to extract info from ID if not available
                  if (checkResult.isDeleted && !checkResult.variableName) {
                    if (checkResult.error) {
                      console.log(`Variable deletion error details: ${checkResult.error}`);
                    }
                    
                    const idParts = variableId.split(':');
                    if (idParts.length > 1) {
                      libraryName = `Library ${idParts[0]}`;
                      variableName = `Variable ${idParts[1]}`;
                    }
                  }
                  
                  // Determine variable category
                  const variableCategory = getVariableCategory(property);
                  availableTypes.add(variableCategory);
                  
                  // Filter by types if specified
                  if (!filterByTypes || variableTypes.includes(variableCategory)) {
                    const groupKey = arrayIndex !== undefined ? 
                      `deleted-variable-${libraryName}-${variableName}-array-${arrayIndex}` :
                      `deleted-variable-${libraryName}-${variableName}`;
                    
                    results.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      location: getNodePath(node),
                      property: arrayIndex !== undefined ? `${property}[${arrayIndex}]` : property,
                      type: 'missing',
                      currentValue: {
                        variableId,
                        libraryName,
                        variableName,
                        variableType: variableCategory,
                        errorDetails: checkResult.error,
                        resolvedType: checkResult.resolvedType
                      },
                      isMissingLibrary: true,
                      groupKey,
                      isVisible: node.visible !== false,
                      libraryName,
                      variableCategory, // Add category for filtering
                      variableType: variableCategory
                    });
                  }
                } else {
                  // Variable is active and accessible - do not include in results
                  console.log(`Skipping active and accessible variable: ${variableId} in property: ${property}`, {
                    isDeleted: checkResult.isDeleted,
                    isMissingLibrary: checkResult.isMissingLibrary,
                    resolvedType: checkResult.resolvedType
                  });
                }
              } catch (err) {
                console.error(`Error processing variable ${variableId}:`, err);
                // Continue processing other variables even if one fails
              }
            });
          
          // Wait for batch to complete
          await Promise.allSettled(batchPromises);
          
          bindingsProcessed += batch.length;
          // Update progress during binding processing
          const safeBindingCount = Math.max(variableIdsToCheck.length, 1);
          const nodeProgress = 30 + (nodeProcessingWeight * (i + (bindingsProcessed / safeBindingCount)) / Math.max(nodes.length, 1));
          reportProgress(Math.round(nodeProgress), {
            phase: 'processing-nodes',
            processedCount: processedNodes,
            totalCount: nodes.length
          });
          
          // Small delay between batches to prevent UI blocking
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } catch (err) {
      console.error(`Error processing node ${node.name}:`, err);
      // Continue with next node
    }
    
    processedNodes++;
    // Pulse progress update to show activity even when processing large nodes
    const baseProgress = 30 + (nodeProcessingWeight * processedNodes / Math.max(nodes.length, 1));
    reportProgressWithDebounce(Math.round(baseProgress), {
      phase: 'processing-nodes',
      processedCount: processedNodes,
      totalCount: nodes.length
    });
    
    console.log(`Completed node ${i + 1}/${nodes.length}: ${node.name} - Found ${results.length} deleted variables so far`);
  }
  
  const scanEndTime = Date.now();
  const scanDuration = scanEndTime - scanStartTime;
  const wasInterrupted = isScancelled() || checkOverallTimeout();
  
  console.log(`Deleted/missing library variables scan ${wasInterrupted ? 'interrupted' : 'complete'}. ` +
             `Found ${results.length} deleted or missing library variables in ${availableTypes.size} categories. ` +
             `Duration: ${scanDuration}ms`);
  
  // Ensure we show 100% at the end
  reportProgressWithDebounce(100, {
    phase: 'complete',
    processedCount: nodes.length,
    totalCount: nodes.length
  });
  
  // Log summary for debugging
  console.log(`Scan summary:
    - Total deleted/missing library variables found: ${results.length}
    - Available types: ${[...availableTypes].join(', ')}
    - Was interrupted: ${wasInterrupted}
    - Duration: ${scanDuration}ms
    - Nodes processed: ${processedNodes}/${nodes.length}
    - Active and accessible variables excluded from results`);
  
  return { results, availableTypes };
}

/**
 * Group broken variable reference scan results with type filtering support
 */
export function groupBrokenVariableReferenceResults(
  results: MissingReference[],
  selectedTypes?: string[]
): Record<string, MissingReference[]> {
  const groups: Record<string, MissingReference[]> = {};
  
  // Filter results by selected types if provided
  const filteredResults = selectedTypes && selectedTypes.length > 0 
    ? results.filter(result => selectedTypes.includes(result.variableCategory || 'other'))
    : results;
  
  filteredResults.forEach(result => {
    const groupKey = result.groupKey || (() => {
      const libraryName = result.currentValue?.libraryName || 'Unknown Library';
      const variableName = result.currentValue?.variableName || 'Unknown Variable';
      return `broken-variable-reference:${libraryName}:${variableName}`;
    })();
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  console.log(`Grouped ${filteredResults.length} broken variable reference results into ${Object.keys(groups).length} groups`);
  
  return groups;
}

/**
 * @deprecated Use `scanForBrokenVariableReferences` instead.
 * Kept temporarily for backwards compatibility.
 */
export async function scanForDeletedVariables(...args: Parameters<typeof scanForBrokenVariableReferences>) {
  return scanForBrokenVariableReferences(...args);
}

/**
 * @deprecated Use `groupBrokenVariableReferenceResults` instead.
 * Kept temporarily for backwards compatibility.
 */
export function groupDeletedVariableResults(...args: Parameters<typeof groupBrokenVariableReferenceResults>) {
  return groupBrokenVariableReferenceResults(...args);
}