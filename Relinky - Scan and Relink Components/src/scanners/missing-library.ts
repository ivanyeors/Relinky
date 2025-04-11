// Missing Library Scanner Module
// Handles scanning for missing library variables in the document

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
 * Checks if a variable is from a missing library
 */
async function isMissingLibraryVariable(variableId: string): Promise<{isMissing: boolean, error?: string, resolvedType?: string}> {
  try {
    // Try to access the variable - if it exists but can't be found in team or local,
    // it's likely from a missing library
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) return { isMissing: false };
    
    // Check if it's in missingVariables collection
    // This is a simplified check and may need more complex logic
    const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
    return { 
      isMissing: !!collection && !collection.remote && collection.name.includes('Missing'),
      resolvedType: variable.resolvedType
    };
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
 * Returns both the results and available variable types for filtering
 */
export async function scanForMissingLibraryVariables(
  progressCallback: (progress: number) => void = () => {},
  selectedFrameIds: string[] | undefined = undefined,
  ignoreHiddenLayers: boolean = false,
  variableTypes: string[] = []
): Promise<{
  results: MissingReference[],
  availableTypes: Set<string>
}> {
  console.log('Starting missing library variables scan');
  
  const results: MissingReference[] = [];
  const availableTypes = new Set<string>();
  const filterByTypes = variableTypes.length > 0;
  
  if (filterByTypes) {
    console.log(`Filtering missing variables by types:`, variableTypes);
  }
  
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
    if (isScancelled()) {
      console.log('Missing library scan cancelled');
      break;
    }
    
    const node = nodes[i];
    
    // Handle missingVariables property
    if ('missingVariables' in node && node.missingVariables) {
      for (const [property, missingInfo] of Object.entries(node.missingVariables)) {
        if (isScancelled()) break;
        
        if (missingInfo) {
          const libraryName = missingInfo.libraryName || 'Unknown Library';
          const variableName = missingInfo.variableName || 'Unknown Variable';
          
          // Determine variable category
          const variableCategory = getVariableCategory(property);
          availableTypes.add(variableCategory);
          
          const groupKey = `missing-library-${libraryName}-${variableName}`;
          
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
    }
    
    // Handle boundVariables
    if ('boundVariables' in node && node.boundVariables) {
      for (const [property, binding] of Object.entries(node.boundVariables)) {
        if (isScancelled()) break;
        
        const processBinding = async (variableId: string, arrayIndex?: number) => {
          const checkResult = await isMissingLibraryVariable(variableId);
          
          if (checkResult.isMissing) {
            let variableName = 'Unknown Variable';
            let libraryName = 'Missing Library';
            
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
              `missing-library-${libraryName}-${variableName}-array-${arrayIndex}` :
              `missing-library-${libraryName}-${variableName}`;
            
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
      }
    }
    
    progressCallback(Math.round((i + 1) / nodes.length * 100));
  }
  
  console.log(`Missing library scan complete. Found ${results.length} missing library variables in ${availableTypes.size} categories`);
  
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
  
  return { results: filteredResults, availableTypes };
}

/**
 * Group missing library variable scan results with type filtering support
 */
export function groupMissingLibraryResults(
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
      return `missing-library-${libraryName}-${variableName}`;
    })();
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  console.log(`Grouped ${filteredResults.length} missing library results into ${Object.keys(groups).length} groups`);
  
  return groups;
} 
