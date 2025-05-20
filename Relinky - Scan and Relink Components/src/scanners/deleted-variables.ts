// Deleted Variables Scanner Module
// Handles scanning for deleted variables in the document and selected nodes

import { MissingReference, ScanType } from '../common';
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
 * Checks if a variable is deleted
 */
async function isDeletedVariable(variableId: string): Promise<{isDeleted: boolean, error?: string, resolvedType?: string}> {
  try {
    // Try to access the variable - if it exists but can't be found,
    // it's likely deleted
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) return { isDeleted: true };
    
    // Check if it's in missingVariables collection
    // This is a simplified check and may need more complex logic
    const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
    return { 
      isDeleted: !!collection && !collection.remote && collection.name.includes('Missing'),
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
function shouldIncludeNode(node: SceneNode, ignoreHiddenLayers: boolean): boolean {
  if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
    return false;
  }
  return true;
}

/**
 * Scan for deleted variables in the document
 * Returns both the results and available variable types for filtering
 */
export async function scanForDeletedVariables(
  progressCallback: (progress: number) => void = () => {},
  selectedFrameIds: string[] | undefined = undefined,
  ignoreHiddenLayers: boolean = false,
  variableTypes: string[] = []
): Promise<{
  results: MissingReference[],
  availableTypes: Set<string>
}> {
  console.log('Starting deleted variables scan');
  
  const results: MissingReference[] = [];
  const availableTypes = new Set<string>();
  const filterByTypes = variableTypes.length > 0;
  
  if (filterByTypes) {
    console.log(`Filtering deleted variables by types:`, variableTypes);
  }
  
  // Initialize progress
  let currentProgress = 0;
  const updateProgressWithDebounce = (() => {
    let lastUpdate = Date.now();
    return (progress: number) => {
      const now = Date.now();
      // Update at least every 100ms to show continuous progress
      if (now - lastUpdate >= 100 || progress - currentProgress >= 5) {
        currentProgress = progress;
        progressCallback(progress);
        lastUpdate = now;
      }
    };
  })();
  
  // Update to show scan has started
  updateProgressWithDebounce(1);
  
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
  
  // Update progress after determining scan scope
  updateProgressWithDebounce(5);
  
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
  updateProgressWithDebounce(10);
  console.log(`Estimated ${totalNodesToExamine} total nodes to examine`);
  
  // Now collect nodes with variables
  for (const node of nodesToScan) {
    if (isScancelled()) break;
    
    // Recursive function to collect nodes
    const collectNodes = (n: SceneNode) => {
      // Check if scan was cancelled
      if (isScancelled()) {
        return;
      }
      
      nodesExamined++;
      if (nodesExamined % 100 === 0) { 
        // Update progress during collection phase
        const collectionProgress = 10 + Math.min(20, Math.round((nodesExamined / totalNodesToExamine) * 20));
        updateProgressWithDebounce(collectionProgress);
      }
      
      if (shouldIncludeNode(n, ignoreHiddenLayers) && 
          (('boundVariables' in n && n.boundVariables) || 
           ('missingVariables' in n && n.missingVariables))) {
        nodes.push(n);
      }
      
      if ('children' in n) {
        n.children.forEach(child => {
          collectNodes(child as SceneNode);
        });
      }
    };
    
    collectNodes(node);
  }
  
  console.log(`Found ${nodes.length} nodes to scan for deleted variables`);
  // Update progress after node collection
  updateProgressWithDebounce(30);
  
  // Process each node
  let processedNodes = 0;
  const nodeProcessingWeight = 70; // 70% of the total progress is for node processing
  
  for (let i = 0; i < nodes.length; i++) {
    if (isScancelled()) {
      console.log('Deleted variables scan cancelled');
      break;
    }
    
    const node = nodes[i];
    
    // Handle missingVariables property
    if ('missingVariables' in node && node.missingVariables) {
      let propertiesProcessed = 0;
      const totalProperties = Object.keys(node.missingVariables).length;
      
      for (const [property, missingInfo] of Object.entries(node.missingVariables)) {
        if (isScancelled()) break;
        
        if (missingInfo) {
          const libraryName = missingInfo.libraryName || 'Unknown Library';
          const variableName = missingInfo.variableName || 'Unknown Variable';
          
          // Determine variable category
          const variableCategory = getVariableCategory(property);
          availableTypes.add(variableCategory);
          
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
        
        propertiesProcessed++;
        // Update progress during property processing
        if (propertiesProcessed % 10 === 0 || propertiesProcessed === totalProperties) {
          const nodeProgress = 30 + (nodeProcessingWeight * (i + (propertiesProcessed / totalProperties)) / nodes.length);
          updateProgressWithDebounce(Math.round(nodeProgress));
        }
      }
    }
    
    // Handle boundVariables
    if ('boundVariables' in node && node.boundVariables) {
      let bindingsProcessed = 0;
      const totalBindings = Object.keys(node.boundVariables).length;
      
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        if (isScancelled()) break;
        
        const processBinding = async (variableId: string, arrayIndex?: number) => {
          const checkResult = await isDeletedVariable(variableId);
          
          if (checkResult.isDeleted) {
            let variableName = 'Unknown Variable';
            let libraryName = 'Deleted Variable';
            
            try {
              const variable = await figma.variables.getVariableByIdAsync(variableId);
              if (variable) {
                variableName = variable.name;
                if (variable.key) {
                  const libraryId = variable.key.split(':')[0];
                  libraryName = `Library ${libraryId}`;
                }
              }
            } catch (err) {
              const idParts = variableId.split(':');
              if (idParts.length > 1) {
                libraryName = `Library ${idParts[0]}`;
                variableName = `Variable ${idParts[1]}`;
              }
            }
            
            // Determine variable category
            const variableCategory = getVariableCategory(property);
            availableTypes.add(variableCategory);
            
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
                errorDetails: checkResult.error
              },
              isMissingLibrary: true,
              groupKey,
              isVisible: node.visible !== false,
              libraryName,
              variableCategory, // Add category for filtering
              variableType: variableCategory
            });
          }
        };
        
        if (binding && typeof binding === 'object') {
          if ('id' in binding) {
            await processBinding(binding.id as string);
          } else if (Array.isArray(binding)) {
            for (let j = 0; j < binding.length; j++) {
              const item = binding[j];
              if (item && typeof item === 'object' && 'id' in item) {
                await processBinding(item.id as string, j);
              }
            }
          }
        }
        
        bindingsProcessed++;
        // Update progress during binding processing
        if (bindingsProcessed % 5 === 0 || bindingsProcessed === totalBindings) {
          const nodeProgress = 30 + (nodeProcessingWeight * (i + (bindingsProcessed / totalBindings)) / nodes.length);
          updateProgressWithDebounce(Math.round(nodeProgress));
        }
      }
    }
    
    processedNodes++;
    // Pulse progress update to show activity even when processing large nodes
    const baseProgress = 30 + (nodeProcessingWeight * processedNodes / nodes.length);
    updateProgressWithDebounce(Math.round(baseProgress));
  }
  
  console.log(`Deleted variables scan complete. Found ${results.length} deleted variables in ${availableTypes.size} categories`);
  
  // Filter results by variable type if types are specified
  let filteredResults = results;
  if (filterByTypes) {
    console.log(`Before filtering: ${results.length} results with categories:`, 
      [...new Set(results.map(r => r.variableCategory))]);
    
    filteredResults = results.filter(result => {
      const matchesType = variableTypes.includes(result.variableType || '') || 
                         variableTypes.includes(result.variableCategory || '');
      
      if (!matchesType) {
        console.log(`Filtering out result with category: ${result.variableCategory}, type: ${result.variableType}, property: ${result.property}`);
      }
      
      return matchesType;
    });
    
    console.log(`Filtered to ${filteredResults.length} results based on selected variable types:`, variableTypes);
    console.log(`Remaining categories:`, [...new Set(filteredResults.map(r => r.variableCategory))]);
  }
  
  // Ensure we show 100% at the end
  updateProgressWithDebounce(100);
  
  return { results: filteredResults, availableTypes };
}

/**
 * Group deleted variable scan results with type filtering support
 */
export function groupDeletedVariableResults(
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
      return `deleted-variable-${libraryName}-${variableName}`;
    })();
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  console.log(`Grouped ${filteredResults.length} deleted variable results into ${Object.keys(groups).length} groups`);
  
  return groups;
} 