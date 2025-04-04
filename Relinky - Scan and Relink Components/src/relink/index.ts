// Values scanning feature
// This module contains functions for scanning unlinked design values like colors, typography, spacing, etc.

import { 
  MissingReference, 
  ScanType, 
  isNodeVisible, 
  shouldIncludeNode, 
  formatTypographyValue,
  hasTextStyleBindings,
  hasAutoLayout,
  hasCornerRadius,
  hasFills,
  hasStrokes,
  getNodePath,
  hasVariableBindings,
  // Import new debug helpers
  debugNodeVariables,
  isTeamLibraryVariable,
  isLocalLibraryVariable,
  isMissingLibraryVariable,
  isVariableBinding,
} from '../common';

// Global variable to allow cancellation of scanning
let isScanCancelled = false;

// Extend MissingReference interface to add properties we need
interface ExtendedMissingReference extends MissingReference {
  variableId?: string;
  value?: any;
  paddingType?: string;
  cornerType?: string;
}

/**
 * Sanitizes reference groups to ensure they are valid for UI rendering
 * This prevents errors when processing the results
 */
function sanitizeReferenceGroups(groupedRefs: Record<string, MissingReference[]>): Record<string, MissingReference[]> {
  const sanitized: Record<string, MissingReference[]> = {};
  
  // Process each group
  for (const [key, refs] of Object.entries(groupedRefs)) {
    // Skip empty arrays
    if (!refs || refs.length === 0) continue;
    
    // Skip groups with invalid first reference
    if (!refs[0]) continue;
    
    // Only include valid groups
    sanitized[key] = refs;
  }
  
  // Return debug info about the sanitized groups
  console.log(`Sanitized ${Object.keys(sanitized).length} reference groups`);
  
  return sanitized;
}

/**
 * Scans for unlinked text styles/typography
 * Looks for TextNodes that either:
 * 1. Have no textStyleId binding
 * 2. Use variables from inactive libraries
 */
export async function scanForTextTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Use type guard to ensure we only get TextNodes
    const textNodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => {
        if (node.type !== 'TEXT') return false;
        
        // Skip instance children
        if (node.parent?.type === 'INSTANCE') {
          return false;
        }
        
        // Use enhanced visibility check
        if (ignoreHiddenLayers && !isNodeVisible(node)) {
          return false;
        }
        
        return true;
      }) as TextNode[];
    const totalNodes = textNodes.length;
    let processedNodes = 0;
    
    for (const node of textNodes) {
      if (isScanCancelled) break;
      
      try {
        // Check for variable bindings using type guard
        if (hasTextStyleBindings(node) && node.boundVariables.textStyleId?.type === 'VARIABLE') {
          const binding = node.boundVariables.textStyleId;
          try {
            const variable = await figma.variables.getVariableByIdAsync(binding.id);
            if (variable?.remote) {
              try {
                await figma.variables.importVariableByKeyAsync(variable.key);
                continue; // Active library - skip
              } catch {
                // Inactive library - add to results
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: 'typography',
                  property: 'textStyleId',
                  currentValue: {
                    variableId: binding.id,
                    variableName: variable.name
                  },
                  location: 'Inactive Library Typography',
                  isInactiveLibrary: true,
                  isVisible: 'visible' in node ? node.visible : true
                });
                continue;
              }
            }
          } catch (err) {
            console.warn(`Failed to check text variable: ${binding.id}`, err);
          }
        }

        // Check for unlinked text styles
        if (!node.textStyleId && (!hasTextStyleBindings(node) || !node.boundVariables.textStyleId)) {
          const typographyValue = {
            fontFamily: typeof node.fontName === 'object' ? node.fontName.family : '',
            fontWeight: typeof node.fontName === 'object' ? node.fontName.style : '',
            fontSize: node.fontSize,
            lineHeight: node.lineHeight === figma.mixed ? 'MIXED' :
                       typeof node.lineHeight === 'number' ? node.lineHeight :
                       'unit' in (node.lineHeight || {}) ? node.lineHeight.unit :
                       null,
            letterSpacing: node.letterSpacing === figma.mixed ? 'MIXED' :
                          typeof node.letterSpacing === 'number' ? node.letterSpacing :
                          'value' in (node.letterSpacing || {}) ? node.letterSpacing.value :
                          null,
            paragraphSpacing: node.paragraphSpacing,
            textCase: node.textCase,
            textDecoration: node.textDecoration,
            content: node.characters.substring(0, 50)
          };

          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'typography',
            property: 'textStyleId',
            currentValue: typographyValue,
            location: 'Unlinked Typography',
            preview: formatTypographyValue(typographyValue),
            isUnlinked: true,
            isVisible: 'visible' in node ? node.visible : true
          });
        }
      } catch (err) {
        console.warn(`Error processing text node ${node.name}:`, err);
      }

      // Update progress more frequently
      processedNodes++;
      // Ensure progress is a whole number between 0 and 100
      const progress = Math.round((processedNodes / totalNodes) * 100);
      progressCallback(progress);

      // Add a small delay every few nodes to prevent UI freezing
      if (processedNodes % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  } catch (err) {
    console.error('Error scanning for text tokens:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for unlinked color tokens (fills and strokes)
 * Looks for:
 * 1. Nodes with unlinked fill colors
 * 2. Nodes with unlinked stroke colors
 * 3. Variables from inactive libraries
 */
export async function scanForColorTokens(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Update the filter to strictly check visibility
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => {
        // Skip removed nodes
        if (!node || node.removed) return false;
        
        // Skip instance children
        if (node.parent?.type === 'INSTANCE') return false;

        // Skip invisible nodes
        if ('visible' in node && !node.visible) return false;
        
        // Skip if ignoring hidden layers and node is hidden
        if (ignoreHiddenLayers && !isNodeVisible(node)) return false;
        
        // Check for fills/strokes/etc
        return 'fills' in node || 'strokes' in node;
      });
        
    const totalNodes = nodes.length;
    let processedNodes = 0;

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i];
      
      try {
        // Get node path and parent info
        const nodePath = getNodePath(node);
        const parentNodeId = node.parent?.id;

        // Check for bound variables
        if ('boundVariables' in node) {
          const boundVars = (node as any).boundVariables;
          if (boundVars) {
            const keys = Object.keys(boundVars || {});
            for (const key of keys) {
              const binding = boundVars[key];
              if (binding && binding.type === 'VARIABLE') {
                // Get local variables
                const localVariables = await figma.variables.getLocalVariablesAsync();
                const localVar = localVariables.find(v => v.id === binding.id);
                
                // Get library variables
                const remoteVariables = localVariables.filter(v => v.remote);
                const libraryVar = await Promise.all(
                  remoteVariables.map(async v => {
                    try {
                      return await figma.variables.importVariableByKeyAsync(v.key);
                    } catch (err) {
                      console.warn(`Failed to import variable: ${v.key}`, err);
                      return null;
                    }
                  })
                ).then(vars => vars.find(v => v?.id === binding.id));
                
                if (!localVar && !libraryVar) {
                  missingRefs.push({
                    nodeId: node.id,
                    nodeName: node.name || 'Unnamed Node',
                    type: 'fill',
                    property: key,
                    currentValue: binding.id,
                    location: `Missing Library Variable`,
                    variableName: binding.name || 'Unknown Variable',
                    variableValue: binding.value || null,
                    parentNodeId,
                    path: nodePath,
                    isVisible: 'visible' in node ? node.visible : true
                  });
                }
              }
            }
          }
        }

        // Check fills for unlinked values
        if (hasFills(node)) {
          const fills = node.fills;
          if (Array.isArray(fills)) {
            fills.forEach((fill: Paint, index) => {
              // Only add if there's no variable binding for this fill
              if (fill.type === 'SOLID' && 
                  (!('fillStyleId' in node) || !node.fillStyleId) &&
                  (!node.boundVariables?.fills?.[index] || 
                   !node.boundVariables?.fills?.[index]?.type)) {
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Unnamed Node',
                  type: 'fill',
                  property: `fills[${index}]`,
                  currentValue: fill.color,
                  location: 'Unlinked Fill',
                  isUnlinked: true, // Flag for unlinked values
                  parentNodeId,
                  path: nodePath,
                  isVisible: 'visible' in node ? node.visible : true
                });
              }
            });
          }
        }

        // Check strokes similarly
        if (hasStrokes(node)) {
          const strokes = node.strokes;
          if (Array.isArray(strokes)) {
            strokes.forEach((stroke: Paint, index) => {
              // Only add if there's no variable binding for this stroke
              if (stroke.type === 'SOLID' && 
                  (!('strokeStyleId' in node) || !node.strokeStyleId) &&
                  (!node.boundVariables?.strokes?.[index] || 
                   !node.boundVariables?.strokes?.[index]?.type)) {
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name || 'Unnamed Node',
                  type: 'stroke',
                  property: `strokes[${index}]`,
                  currentValue: stroke.color,
                  location: 'Unlinked Stroke',
                  isUnlinked: true, // Flag for unlinked values
                  parentNodeId,
                  path: nodePath,
                  isVisible: 'visible' in node ? node.visible : true
                });
              }
            });
          }
        }

        // Update progress
        processedNodes++;
        const progress = Math.round((processedNodes / nodes.length) * 100);
        progressCallback(progress);

        // Add a small delay every few nodes to prevent UI freezing
        if (processedNodes % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } catch (err) {
        console.warn(`Error processing node ${nodes[i].name}:`, err);
      }
    }

    return missingRefs;
  } catch (err) {
    console.error('Error scanning for colors:', err);
    return missingRefs;
  }
}

/**
 * Scans for unlinked vertical spacing in auto-layout frames
 * Finds frames with vertical auto-layout that have non-zero itemSpacing
 * but no variable binding for that spacing
 */
export async function scanForVerticalGap(
  progressCallback: (progress: number) => void,
  nodesToScan: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = nodesToScan.filter(node => {
      if (!hasAutoLayout(node) || node.layoutMode !== 'VERTICAL') {
        return false;
      }
      
      // Check visibility if ignoreHiddenLayers is true
      if (ignoreHiddenLayers && !isNodeVisible(node)) {
        return false;
      }
      
      return node.itemSpacing > 0 && !node.boundVariables?.itemSpacing;
    });
    
    console.log(`Found ${nodes.length} nodes with unlinked vertical auto-layout`);

    // Process nodes with progress updates
    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as FrameNode;
      
      missingRefs.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'gap',
        property: 'itemSpacing',
        currentValue: node.itemSpacing,
        location: 'Vertical Gap',
        isVisible: 'visible' in node ? node.visible : true
      });

      // Calculate and report progress
      const progress = ((i + 1) / nodes.length) * 100;
      progressCallback(progress);

      // Add a small delay to prevent UI freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for vertical gaps:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for unlinked padding in auto-layout frames
 * Finds frames with auto-layout that have padding not bound to variables
 */
export async function scanForPadding(
  progressCallback: (progress: number) => void,
  type: 'horizontal-padding' | 'vertical-padding',
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = (nodesToScan || figma.currentPage.findAll()).filter(node => {
      if (!hasAutoLayout(node)) return false;
      
      // Use the enhanced visibility check
      if (ignoreHiddenLayers && !shouldIncludeNode(node, true)) {
        return false;
      }
      
      return true;
    });
    console.log(`Found ${nodes.length} nodes with auto-layout`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as FrameNode;
      const boundVars = node.boundVariables || {};

      if (type === 'horizontal-padding') {
        if (node.paddingLeft > 0 && !boundVars.paddingLeft) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'horizontal-padding',
            property: 'paddingLeft',
            currentValue: node.paddingLeft,
            location: 'Left Padding',
            isVisible: 'visible' in node ? node.visible : true
          });
        }
        if (node.paddingRight > 0 && !boundVars.paddingRight) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'horizontal-padding',
            property: 'paddingRight',
            currentValue: node.paddingRight,
            location: 'Right Padding',
            isVisible: 'visible' in node ? node.visible : true
          });
        }
      } else {
        if (node.paddingTop > 0 && !boundVars.paddingTop) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'vertical-padding',
            property: 'paddingTop',
            currentValue: node.paddingTop,
            location: 'Top Padding',
            isVisible: 'visible' in node ? node.visible : true
          });
        }
        if (node.paddingBottom > 0 && !boundVars.paddingBottom) {
          missingRefs.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'vertical-padding',
            property: 'paddingBottom',
            currentValue: node.paddingBottom,
            location: 'Bottom Padding',
            isVisible: 'visible' in node ? node.visible : true
          });
        }
      }

      // Calculate and report progress
      const progress = ((i + 1) / nodes.length) * 100;
      progressCallback(progress);

      // Add a small delay to prevent UI freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for padding:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for unlinked corner radius values
 * Finds rectangles, frames, components, and instances with corner radius
 * that is not bound to a variable
 */
export async function scanForCornerRadius(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    // Update the type check for cornerRadius
    const nodes = (nodesToScan || figma.currentPage.findAll()).filter(node => {
      if (!hasCornerRadius(node)) return false;
      
      // Use the enhanced visibility check
      if (ignoreHiddenLayers && !shouldIncludeNode(node, true)) {
        return false;
      }
      
      return true;
    });
    
    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i] as SceneNode & { cornerRadius: number };
      const boundVars = (node as any).boundVariables || {};
      
      if (!boundVars.cornerRadius) {
        missingRefs.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'corner-radius',
          property: 'cornerRadius',
          currentValue: node.cornerRadius,
          location: 'Shape',
          isVisible: 'visible' in node ? node.visible : true
        });
      }

      const progress = ((i + 1) / nodes.length) * 100;
      progressCallback(progress);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (err) {
    console.error('Error scanning for corner radius:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for fill variables (not used in the UI but included for completeness)
 * This scans for nodes that use fill variables, regardless of whether 
 * they are from active or inactive libraries
 */
export async function scanForFillVariables(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => {
        if (!hasFills(node)) return false;
        
        // Use the enhanced visibility check
        if (ignoreHiddenLayers && !shouldIncludeNode(node, true)) {
          return false;
        }
        
        return true;
      });
    
    console.log('Found nodes with fills:', nodes.length);

    const allVariables = await figma.variables.getLocalVariablesAsync();
    console.log('Found variables:', allVariables.length);

    for (const node of nodes) {
      try {
        if (node.boundVariables) {
          console.log('Node bound variables:', {
            nodeName: node.name,
            boundVars: node.boundVariables
          });

          const fillBindings = node.boundVariables['fills'];
          
          if (Array.isArray(fillBindings)) {
            // Handle array of variable bindings
            for (const binding of fillBindings) {
              if (binding.type === 'VARIABLE_ALIAS') {
                // Cast binding to VariableAlias type and access id
                const variableBinding = binding;
                const variable = await figma.variables.getVariableByIdAsync('id' in variableBinding ? variableBinding.id : '');
                console.log('Found variable:', variable);

                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: 'fill-variable',
                  property: 'fills',
                  currentValue: {
                    variableId: 'id' in variableBinding ? variableBinding.id : '',
                    variableName: variable?.name || 'Unknown',
                    variableType: variable?.resolvedType || 'Unknown',
                    isRemote: variable?.remote || false
                  },
                  location: 'Fill Color Variable',
                  variableName: variable?.name || 'Unknown Variable',
                  preview: `Variable: ${variable?.name || 'Unknown'}`,
                  isInactiveLibrary: false,
                  isVisible: 'visible' in node ? node.visible : true
                });
              }
            }
          } else if (fillBindings) {
            // Handle single variable binding
            try {
              // Type assertion to access properties safely
              const bindingWithType = fillBindings as { type?: string, id?: string };
              
              if (bindingWithType.type === 'VARIABLE_ALIAS' && bindingWithType.id) {
                const variable = await figma.variables.getVariableByIdAsync(bindingWithType.id);
                console.log('Found variable:', variable);
                
                // Add to missingReferences array
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: 'COLOR',
                  property: 'fills',
                  currentValue: {
                    variableId: bindingWithType.id,
                    variableName: variable?.name || 'Unknown',
                    variableType: variable?.resolvedType || 'Unknown',
                    collection: variable?.variableCollectionId || 'Unknown'
                  },
                  location: getNodePath(node),
                  preview: `Variable: ${variable?.name || 'Unknown'}`,
                  isVisible: 'visible' in node ? node.visible : true
                });
              }
            } catch (error) {
              console.error('Error processing fillBindings:', error);
            }
          }
        }
      } catch (err) {
        console.warn(`Error processing node ${node.name}:`, err);
      }

      progressCallback(Math.round((nodes.indexOf(node) + 1) / nodes.length * 100));
    }

    console.log('Fill variables scan complete. Found:', missingRefs.length);

  } catch (err) {
    console.error('Error scanning for fill variables:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for linked variables from team/remote libraries
 * Identifies nodes using variables from team libraries
 */
export async function scanForTeamLibraryVariables(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    console.log('Starting scan for team library variables');
    
    // Get all variables, including remote ones
    const allVariables = await figma.variables.getLocalVariablesAsync();
    const variablesMap = new Map(allVariables.map(v => [v.id, v]));
    
    // Get collections for better naming
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionsMap = new Map(collections.map(c => [c.id, c]));
    
    // Process all nodes with possible variable bindings - look for ANY nodes with boundVariables property
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => 'boundVariables' in node && node.boundVariables && shouldIncludeNode(node, ignoreHiddenLayers));

    console.log(`Found ${nodes.length} nodes to scan for team library variables`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i];
      
      // Analyze ALL variable bindings in the node
      const varInfo = debugNodeVariables(node);
      console.log(`Analyzing variables for node ${node.name}:`, varInfo);
      
      // Process each binding property
      for (const prop in varInfo.variableBindings) {
        const binding = varInfo.variableBindings[prop];
        
        // Handle direct variable binding
        if (binding.isVariable && binding.variableId) {
          // Only include if it's a team library variable
          if (await isTeamLibraryVariable(binding.variableId)) {
            const variable = await figma.variables.getVariableByIdAsync(binding.variableId);
            const collection = variable ? 
              await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId) : null;
            
            missingRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              type: node.type.toLowerCase(),
              property: prop,
              currentValue: {
                variableId: binding.variableId,
                variableName: variable?.name || 'Unknown',
                variableType: variable?.resolvedType || 'UNKNOWN',
                collectionName: collection?.name || 'Unknown'
              },
              location: getNodePath(node),
              variableName: variable?.name || 'Unknown',
              isVisible: 'visible' in node ? node.visible : true,
              isTeamLibrary: true,
              libraryName: collection?.name || 'Team Library'
            });
          }
        } 
        // Handle array of bindings (e.g., fills)
        else if (binding.type === 'array' && binding.items) {
          for (const item of binding.items) {
            if (item.isVariable && item.variableId) {
              // Only include if it's a team library variable
              if (await isTeamLibraryVariable(item.variableId)) {
                const variable = await figma.variables.getVariableByIdAsync(item.variableId);
                const collection = variable ? 
                  await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId) : null;
                
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: node.type.toLowerCase(),
                  property: `${prop}[${item.index}]`,
                  currentValue: {
                    variableId: item.variableId,
                    variableName: variable?.name || 'Unknown',
                    variableType: variable?.resolvedType || 'UNKNOWN',
                    collectionName: collection?.name || 'Unknown'
                  },
                  location: getNodePath(node),
                  variableName: variable?.name || 'Unknown',
                  isVisible: 'visible' in node ? node.visible : true,
                  isTeamLibrary: true,
                  libraryName: collection?.name || 'Team Library'
                });
              }
            }
          }
        }
      }
      
      // Update progress
      progressCallback(Math.round((i + 1) / nodes.length * 100));
    }
    
    console.log(`Found ${missingRefs.length} team library variables`);
  } catch (err) {
    console.error('Error scanning for team library variables:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for linked variables from local libraries
 * Identifies nodes using variables from local library/document
 */
export async function scanForLocalLibraryVariables(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    console.log('Starting enhanced scan for local library variables');
    
    // Get all local variables with improved logging
    const allVariables = await figma.variables.getLocalVariablesAsync();
    const localVariables = allVariables.filter(v => !v.remote);
    const variablesMap = new Map(localVariables.map(v => [v.id, v]));
    
    console.log(`Found ${localVariables.length} local variables out of ${allVariables.length} total variables`);
    
    if (localVariables.length === 0) {
      console.log('No local variables found in this document');
      return [];
    }
    
    // Log detailed information about local variables
    localVariables.forEach((v, index) => {
      if (index < 10) { // Limit to first 10 to prevent log overflow
        console.log(`Local variable ${index+1}: ${v.name}, type: ${v.resolvedType}, id: ${v.id}, collection: ${v.variableCollectionId}`);
      }
    });
    
    // Get collections for naming
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionsMap = new Map(collections.map(c => [c.id, c]));
    
    console.log(`Found ${collections.length} variable collections`);
    
    // Log collection details
    collections.forEach((c, index) => {
      if (index < 5) {
        console.log(`Collection ${index+1}: ${c.name}, id: ${c.id}, remote: ${c.remote}`);
      }
    });
    
    // Process all nodes with possible variable bindings - look for ANY nodes with boundVariables property
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => 'boundVariables' in node && node.boundVariables && shouldIncludeNode(node, ignoreHiddenLayers));

    console.log(`Found ${nodes.length} nodes to scan for local library variables`);
    
    // Log the first few text nodes for debugging
    const textNodes = nodes.filter(node => node.type === 'TEXT');
    console.log(`Found ${textNodes.length} text nodes with boundVariables`);
    
    if (textNodes.length > 0) {
      console.log('Examples of text nodes with boundVariables:');
      textNodes.slice(0, 3).forEach((node, i) => {
        const textNode = node as TextNode;
        console.log(`Text node ${i+1}: "${textNode.name}", text: "${textNode.characters.substring(0, 20)}${textNode.characters.length > 20 ? '...' : ''}"`);
        if ('boundVariables' in textNode && textNode.boundVariables) {
          console.log('Bound variables:', textNode.boundVariables);
        }
      });
    }
    
    let nodesWithLocalVars = 0;
    let variableCheckCount = 0;
    let failedLookups = 0;
    let typographyVarsFound = 0;
    
    // Create a Set to track which variable IDs we've already checked
    const checkedVariableIds = new Set<string>();
    
    // Pre-validate the first few local variables to ensure they're accessible
    if (localVariables.length > 0) {
      console.log('Testing variable lookup functionality:');
      for (let i = 0; i < Math.min(3, localVariables.length); i++) {
        const testVar = localVariables[i];
        try {
          const looked = await figma.variables.getVariableByIdAsync(testVar.id);
          console.log(`Test lookup ${i+1}: ${testVar.name}, id: ${testVar.id}, found: ${!!looked}, type: ${looked?.resolvedType}`);
        } catch (err) {
          console.error(`Failed to look up test variable ${testVar.name}:`, err);
        }
      }
    }
    
    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i];
      let foundLocalVarInNode = false;
      
      // Analyze ALL variable bindings in the node
      const varInfo = debugNodeVariables(node);
      
      // Add special handling for text nodes and typography
      const isTextNode = node.type === 'TEXT';
      const typographyProperties = [
        'fontName', 'fontSize', 'fontWeight', 'textDecoration', 
        'textCase', 'letterSpacing', 'lineHeight', 'paragraphSpacing',
        'paragraphIndent', 'textStyleId'
      ];
      
      // Process each binding property
      for (const prop in varInfo.variableBindings) {
        const binding = varInfo.variableBindings[prop];
        
        // Determine if this is a typography-related property
        const isTypographyProperty = isTextNode && typographyProperties.includes(prop);
        
        // Handle direct variable binding
        if (binding.isVariable && binding.variableId) {
          variableCheckCount++;
          
          // Check if we've already processed this variable ID
          const variableId = binding.variableId;
          let isLocal = checkedVariableIds.has(variableId);
          
          // If we haven't checked this variable before, look it up and cache the result
          if (!checkedVariableIds.has(variableId)) {
            try {
              isLocal = await isLocalLibraryVariable(variableId);
              checkedVariableIds.add(variableId);
            } catch (err) {
              failedLookups++;
              console.error(`Failed to check variable: ${variableId}`, err);
              continue;
            }
          }
          
          // Only include if it's a local library variable
          if (isLocal) {
            const variable = variablesMap.get(variableId);
            const collection = variable ? collectionsMap.get(variable.variableCollectionId) : null;
            
            foundLocalVarInNode = true;
            
            // Track typography variables separately
            if (isTypographyProperty) {
              typographyVarsFound++;
            }
            
            // Create a more descriptive key for grouping similar variables
            let groupKey;
            
            if (isTypographyProperty) {
              // Special handling for typography
              const textNode = node as TextNode;
              const fontFamily = getFontFamilyFromNode(textNode);
              const fontWeight = getFontWeightFromNode(textNode);
              const fontSize = typeof textNode.fontSize === 'number' ? textNode.fontSize : 16;
              
              groupKey = `typography-local-library-${fontFamily}-${fontWeight}-${fontSize}`;
            } else {
              // Default handling for other types
              const varType = variable?.resolvedType?.toLowerCase() || 'unknown';
              groupKey = `${prop}-local-library-${variableId}`;
            }
            
            missingRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              type: isTypographyProperty ? 'typography' : node.type.toLowerCase(),
              property: prop,
              currentValue: variable ? {
                variableId: variableId,
                variableName: variable.name || 'Unknown',
                variableType: variable.resolvedType || 'UNKNOWN',
                collectionName: collection?.name || 'Unknown',
                // Add special handling for typography values
                ...(isTypographyProperty && node.type === 'TEXT' ? { 
                  fontFamily: getFontFamilyFromNode(node as TextNode),
                  fontWeight: getFontWeightFromNode(node as TextNode),
                  fontSize: (node as TextNode).fontSize || 0
                } : {})
              } : {
                variableId: variableId,
                variableName: 'Unknown',
                variableType: 'UNKNOWN',
                collectionName: 'Unknown'
              },
              location: getNodePath(node),
              variableName: variable?.name || 'Unknown',
              isVisible: 'visible' in node ? node.visible : true,
              isLocalLibrary: true,
              libraryName: collection?.name || 'Local Document',
              groupKey: groupKey // Add a specific key for better grouping
            });
          }
        }
        // Handle array of bindings (e.g., fills)
        else if (binding.type === 'array' && binding.items) {
          for (const item of binding.items) {
            if (item.isVariable && item.variableId) {
              variableCheckCount++;
              
              // Check if we've already processed this variable ID
              const variableId = item.variableId;
              let isLocal = checkedVariableIds.has(variableId);
              
              // If we haven't checked this variable before, look it up and cache the result
              if (!checkedVariableIds.has(variableId)) {
                try {
                  isLocal = await isLocalLibraryVariable(variableId);
                  checkedVariableIds.add(variableId);
                } catch (err) {
                  failedLookups++;
                  console.error(`Failed to check variable in array: ${variableId}`, err);
                  continue;
                }
              }
              
              // Only include if it's a local library variable
              if (isLocal) {
                const variable = variablesMap.get(variableId);
                const collection = variable ? collectionsMap.get(variable.variableCollectionId) : null;
                
                foundLocalVarInNode = true;
                
                // Create a more descriptive key for grouping similar variables
                const varType = variable?.resolvedType?.toLowerCase() || 'unknown';
                const groupKey = `${prop}-local-library-${variableId}`;
                
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: node.type.toLowerCase(),
                  property: `${prop}[${item.index}]`,
                  currentValue: variable ? {
                    variableId: variableId,
                    variableName: variable.name || 'Unknown',
                    variableType: variable.resolvedType || 'UNKNOWN',
                    collectionName: collection?.name || 'Unknown'
                  } : {
                    variableId: variableId,
                    variableName: 'Unknown',
                    variableType: 'UNKNOWN',
                    collectionName: 'Unknown'
                  },
                  location: getNodePath(node),
                  variableName: variable?.name || 'Unknown',
                  isVisible: 'visible' in node ? node.visible : true,
                  isLocalLibrary: true,
                  libraryName: collection?.name || 'Local Document',
                  groupKey: groupKey // Add a specific key for better grouping
                });
              }
            }
          }
        }
      }
      
      if (foundLocalVarInNode) {
        nodesWithLocalVars++;
      }
      
      // Update progress
      progressCallback(Math.round((i + 1) / nodes.length * 100));
    }
    
    console.log(`Found ${missingRefs.length} local library variable references in ${nodesWithLocalVars} nodes`);
    console.log(`Stats: checked ${variableCheckCount} variables, encountered ${failedLookups} failed lookups`);
    console.log(`Typography variables found: ${typographyVarsFound}`);
    
    // Log the first few results for debugging
    if (missingRefs.length > 0) {
      console.log('First 3 local library references:');
      missingRefs.slice(0, 3).forEach((ref, i) => {
        console.log(`Ref ${i+1}: ${ref.nodeName}, property: ${ref.property}, type: ${ref.type}, variableName: ${ref.variableName}, groupKey: ${ref.groupKey}`);
      });
      
      // Log typography-specific results
      const typographyRefs = missingRefs.filter(ref => ref.type === 'typography');
      if (typographyRefs.length > 0) {
        console.log(`Found ${typographyRefs.length} typography references`);
        typographyRefs.slice(0, 3).forEach((ref, i) => {
          console.log(`Typography ref ${i+1}:`, {
            nodeName: ref.nodeName,
            property: ref.property,
            variableName: ref.variableName,
            currentValue: ref.currentValue
          });
        });
      } else {
        console.log('No typography references found');
      }
    } else {
      console.log('No local library references found after scanning');
    }
  } catch (err) {
    console.error('Error scanning for local library variables:', err);
  }
  
  return missingRefs;
}

/**
 * Scans for variables from missing libraries
 * Identifies nodes with variables that can't be accessed/imported
 */
export async function scanForMissingLibraryVariables(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  const missingRefs: MissingReference[] = [];
  
  try {
    console.log('Starting scan for missing library variables');
    
    // Process all nodes with possible variable bindings - look for ANY nodes with boundVariables property
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => 'boundVariables' in node && node.boundVariables && shouldIncludeNode(node, ignoreHiddenLayers));

    console.log(`Found ${nodes.length} nodes to scan for missing library variables`);

    for (let i = 0; i < nodes.length; i++) {
      if (isScanCancelled) break;
      
      const node = nodes[i];
      
      // Analyze ALL variable bindings in the node
      const varInfo = debugNodeVariables(node);
      console.log(`Analyzing variables for node ${node.name}:`, varInfo);
      
      // Process each binding property
      for (const prop in varInfo.variableBindings) {
        const binding = varInfo.variableBindings[prop];
        
        // Handle direct variable binding
        if (binding.isVariable && binding.variableId) {
          // Only include if it's a missing library variable
          if (await isMissingLibraryVariable(binding.variableId)) {
            // Try to get variable info, but it might fail
            let variable = null;
            try {
              variable = await figma.variables.getVariableByIdAsync(binding.variableId);
            } catch (err) {
              console.log(`Unable to get variable info for ${binding.variableId}`);
            }
            
            missingRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              type: node.type.toLowerCase(),
              property: prop,
              currentValue: {
                variableId: binding.variableId,
                variableName: variable?.name || 'Unknown Variable',
                variableType: variable?.resolvedType || 'UNKNOWN',
                libraryId: variable?.key ? variable.key.split(':')[0] : 'Unknown'
              },
              location: getNodePath(node),
              variableName: variable?.name || 'Unknown Variable',
              isVisible: 'visible' in node ? node.visible : true,
              isMissingLibrary: true,
              libraryName: 'Missing Library'
            });
          }
        } 
        // Handle array of bindings (e.g., fills)
        else if (binding.type === 'array' && binding.items) {
          for (const item of binding.items) {
            if (item.isVariable && item.variableId) {
              // Only include if it's a missing library variable
              if (await isMissingLibraryVariable(item.variableId)) {
                // Try to get variable info, but it might fail
                let variable = null;
                try {
                  variable = await figma.variables.getVariableByIdAsync(item.variableId);
                } catch (err) {
                  console.log(`Unable to get variable info for ${item.variableId}`);
                }
                
                missingRefs.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  type: node.type.toLowerCase(),
                  property: `${prop}[${item.index}]`,
                  currentValue: {
                    variableId: item.variableId,
                    variableName: variable?.name || 'Unknown Variable',
                    variableType: variable?.resolvedType || 'UNKNOWN',
                    libraryId: variable?.key ? variable.key.split(':')[0] : 'Unknown'
                  },
                  location: getNodePath(node),
                  variableName: variable?.name || 'Unknown Variable',
                  isVisible: 'visible' in node ? node.visible : true,
                  isMissingLibrary: true,
                  libraryName: 'Missing Library'
                });
              }
            }
          }
        }
      }
      
      // Update progress
      progressCallback(Math.round((i + 1) / nodes.length * 100));
    }
    
    console.log(`Found ${missingRefs.length} missing library variables`);
  } catch (err) {
    console.error('Error scanning for missing library variables:', err);
  }
  
  return missingRefs;
}

/**
 * Groups missing references by their value to show in the UI
 * This helps display results in a more organized way
 */
export function groupMissingReferences(references: MissingReference[]): Record<string, MissingReference[]> {
  // Check for empty results
  if (!references || references.length === 0) {
    return {};
  }
  
  // Create a map to store grouped references
  const groupedRefs: Record<string, MissingReference[]> = {};
  
  // Process each reference
  for (const ref of references) {
    // Cast to extended interface to allow accessing extra properties
    const extRef = ref as ExtendedMissingReference;
    // Create a key based on the reference type and value
    let key: string;
    
    try {
      // Check if the reference has a predefined groupKey (for local library variables)
      if (ref.groupKey) {
        key = ref.groupKey;
      }
      // Group references by their value type
      else if (ref.type === 'typography') {
        const typographyValue = ref.currentValue || {};
        const family = typographyValue.fontFamily || 'Unknown';
        const style = typographyValue.fontWeight || 'Regular';
        const size = typographyValue.fontSize || '0';
        key = `typography-${family}-${style}-${size}`;
      } else if (ref.type === 'fill' || ref.type === 'stroke') {
        // Color values need special handling
        const colorValue = ref.currentValue;
        
        if (colorValue?.variableId) {
          // For variable colors, group by variable ID
          key = `${ref.type}-variable-${colorValue.variableId}`;
          
          // Add library type to the key if present
          if (ref.isTeamLibrary) key = `${key}-team`;
          else if (ref.isLocalLibrary) key = `${key}-local`;
          else if (ref.isMissingLibrary) key = `${key}-missing`;
        } else if (colorValue && typeof colorValue === 'object' && 'r' in colorValue) {
          // For raw colors, round the values for better grouping
          const r = Math.round(colorValue.r * 255);
          const g = Math.round(colorValue.g * 255);
          const b = Math.round(colorValue.b * 255);
          const a = colorValue.a !== undefined ? Math.round(colorValue.a * 100) / 100 : 1;
          key = `${ref.type}-color-${r}-${g}-${b}-${a}`;
        } else {
          // Fallback for any other type of color value
          key = `${ref.type}-other-${JSON.stringify(colorValue)}`;
        }
      } else if (extRef.paddingType) {
        // For padding, group by value and padding type
        key = `${ref.type}-${extRef.paddingType}-${ref.currentValue}`;
      } else if (extRef.cornerType) {
        // For corner radius, group by value and corner type
        key = `${ref.type}-${extRef.cornerType}-${ref.currentValue}`;
      } else {
        // Default grouping for other types
        key = `${ref.type}-${ref.property}-${JSON.stringify(ref.currentValue)}`;
      }
      
      // Handle references from libraries by adding the library type to the key
      if (ref.isTeamLibrary && !key.includes('-team')) {
        key = `team-${key}`;
      } else if (ref.isLocalLibrary && !key.includes('-local')) {
        key = `local-${key}`;
      } else if (ref.isMissingLibrary && !key.includes('-missing')) {
        key = `missing-${key}`;
      }
      
      // Handle vertical and horizontal padding separately
      if (ref.type === 'verticalPadding' || ref.type === 'horizontalPadding') {
        if (ref.property === 'paddingTop' || ref.property === 'paddingBottom' || 
            ref.property === 'paddingLeft' || ref.property === 'paddingRight') {
          key = `${ref.type}-${ref.property}-${ref.currentValue}`;
        }
      }
      
      // Add the reference to its group
      if (!groupedRefs[key]) {
        groupedRefs[key] = [];
      }
      groupedRefs[key].push(ref);
    } catch (error) {
      console.error(`Error grouping reference: ${error}`, ref);
      // Skip this reference if there's an error
      continue;
    }
  }
  
  // Log some debug info about the grouping results
  console.log(`Grouped ${references.length} references into ${Object.keys(groupedRefs).length} groups`);
  
  // Final sanitization to ensure no empty or invalid groups
  return sanitizeReferenceGroups(groupedRefs);
}

/**
 * Main function for scanning and finding missing references
 * This function dispatches to the appropriate specialized scanner
 * based on the scanType
 */
export async function scanForMissingReferences(
  scanType: ScanType,
  selectedFrameIds: string[] = [], // default to empty array instead of undefined
  progressCallback?: (progress: number) => void,
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  try {
    console.log(`Starting scan for ${scanType}`);
    isScanCancelled = false;
    let nodesToScan: SceneNode[] = [];

    // Reset progress at start
    progressCallback?.(0);
    
    // Get the nodes to scan based on selection
    if (selectedFrameIds && selectedFrameIds.length > 0) {
      console.log(`Scanning selected frames: ${selectedFrameIds.length} frames`);
      // Use Promise.all to fetch all nodes asynchronously
      const selectedFrames = await Promise.all(
        selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
      );

      // Filter out null values and include SECTION type
      const validFrames = selectedFrames.filter((node): node is FrameNode | ComponentNode | ComponentSetNode | SectionNode => 
        node !== null && 
        (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'SECTION') &&
        shouldIncludeNode(node, ignoreHiddenLayers)
      );
      
      // Get all children of selected frames and sections
      nodesToScan = validFrames.reduce<SceneNode[]>((acc, frame) => {
        // For sections, we need to get all their child frames
        if (frame.type === 'SECTION') {
          const sectionChildren = frame.children.reduce<SceneNode[]>((children, child) => {
            if (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'COMPONENT_SET') {
              if (shouldIncludeNode(child, ignoreHiddenLayers)) {
                // Only include visible children if ignoreHiddenLayers is true
                const visibleDescendants = child.findAll(n => shouldIncludeNode(n, ignoreHiddenLayers));
                return [...children, child, ...visibleDescendants];
              }
            }
            return children;
          }, []);
          return [...acc, ...sectionChildren];
        }
        // Include the frame itself and all its visible descendants
        if (shouldIncludeNode(frame, ignoreHiddenLayers)) {
          const visibleDescendants = frame.findAll(n => shouldIncludeNode(n, ignoreHiddenLayers));
          return [...acc, frame, ...visibleDescendants];
        }
        return acc;
      }, []);
    } else {
      // Empty array or undefined means scan entire page
      console.log('Scanning entire page');
      nodesToScan = figma.currentPage.findAll(n => shouldIncludeNode(n, ignoreHiddenLayers));
    }

    console.log(`Found ${nodesToScan.length} nodes to scan (ignoreHiddenLayers: ${ignoreHiddenLayers})`);
    
    // NEW: Debug node variable bindings to help identify what's available
    if (['team-library', 'local-library', 'missing-library'].includes(scanType)) {
      console.log('DEBUG: Analyzing variable bindings in all nodes');
      
      // Look for any nodes with boundVariables
      const nodesWithVariables = nodesToScan.filter(n => 'boundVariables' in n && n.boundVariables);
      console.log(`Found ${nodesWithVariables.length} nodes with boundVariables property`);
      
      // For the first few nodes with variables, output detailed binding info
      const sampleNodes = nodesWithVariables.slice(0, 5);
      
      for (const node of sampleNodes) {
        try {
          // Get detailed variable info
          const varInfo = debugNodeVariables(node);
          console.log('Node variable details:', varInfo);
          
          // For each variable binding, check what type it is
          for (const prop in varInfo.variableBindings) {
            const binding = varInfo.variableBindings[prop];
            
            if (binding.isVariable && binding.variableId) {
              console.log(`Testing variable ${binding.variableId} in ${node.name}...`);
              
              // Test each type
              const isTeamVar = await isTeamLibraryVariable(binding.variableId);
              const isLocalVar = await isLocalLibraryVariable(binding.variableId);
              const isMissingVar = await isMissingLibraryVariable(binding.variableId);
              
              console.log(`Variable ${binding.variableId} classification:`, {
                property: prop,
                isTeamLibrary: isTeamVar,
                isLocalLibrary: isLocalVar,
                isMissingLibrary: isMissingVar
              });
            } else if (binding.type === 'array' && binding.items) {
              // Handle arrays of bindings
              for (const item of binding.items) {
                if (item.isVariable && item.variableId) {
                  console.log(`Testing array variable ${item.variableId} in ${node.name}...`);
                  
                  // Test each type
                  const isTeamVar = await isTeamLibraryVariable(item.variableId);
                  const isLocalVar = await isLocalLibraryVariable(item.variableId);
                  const isMissingVar = await isMissingLibraryVariable(item.variableId);
                  
                  console.log(`Variable ${item.variableId} classification:`, {
                    property: `${prop}[${item.index}]`,
                    isTeamLibrary: isTeamVar,
                    isLocalLibrary: isLocalVar,
                    isMissingLibrary: isMissingVar
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error('Error analyzing variable bindings for node:', node.name, err);
        }
      }
    }
    
    let refs: MissingReference[] = [];
    
    switch (scanType) {
      case 'gap':
        refs = await scanForVerticalGap(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'horizontal-padding':
      case 'vertical-padding':
        refs = await scanForPadding(
          progress => progressCallback?.(progress),
          scanType,
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'corner-radius':
        refs = await scanForCornerRadius(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'fill':
      case 'stroke':
        refs = await scanForColorTokens(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'typography':
        refs = await scanForTextTokens(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'team-library':
        refs = await scanForTeamLibraryVariables(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'local-library':
        refs = await scanForLocalLibraryVariables(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'missing-library':
        refs = await scanForMissingLibraryVariables(
          progress => progressCallback?.(progress),
          nodesToScan,
          ignoreHiddenLayers
        );
        break;
      case 'inactive-tokens':
        // This is handled by the unlink module
        break;
    }

    console.log(`Scan complete. Found ${refs.length} issues`);

    // Sanitize results and send to UI
    const groupedRefs = groupMissingReferences(refs);
    const sanitizedGroups = sanitizeReferenceGroups(groupedRefs);
    
    // Send results to UI
    figma.ui.postMessage({
      type: 'missing-references-result',
      references: sanitizedGroups,
      isLibraryVariableScan: ['team-library', 'local-library', 'missing-library'].includes(scanType),
      // Add raw refs array for compatibility with the groupByValue function in UI
      results: refs,
      scanType
    });
    
    // Return the references for further processing
    return refs;
  } catch (err: unknown) {
    console.error('Error in scanForMissingReferences:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    figma.ui.postMessage({
      type: 'scan-error',
      message: `Error scanning for references: ${errorMessage}`
    });
    return [];
  }
}

/**
 * Debug function to directly test all variables in a document
 * This is helpful for troubleshooting when variable detection isn't working
 */
export async function debugDocumentVariables(
  progressCallback?: (progress: number) => void
): Promise<void> {
  try {
    console.log('======= START VARIABLE DEBUG =======');
    
    // 1. Get all variables in the document
    const allVariables = await figma.variables.getLocalVariablesAsync();
    console.log(`Document has ${allVariables.length} variables`);
    console.log('Variable types:', allVariables.map(v => v.resolvedType));
    console.log('Remote variables:', allVariables.filter(v => v.remote).length);
    console.log('Local variables:', allVariables.filter(v => !v.remote).length);
    
    // 2. Find all nodes with boundVariables
    const allNodes = figma.currentPage.findAll();
    console.log(`Document has ${allNodes.length} nodes`);
    
    const nodesWithVars = allNodes.filter(node => 'boundVariables' in node && node.boundVariables);
    console.log(`Found ${nodesWithVars.length} nodes with boundVariables property`);
    
    // 3. Detailed analysis of 5 sample nodes with variables
    const sampleNodes = nodesWithVars.slice(0, 5);
    
    for (let i = 0; i < sampleNodes.length; i++) {
      const node = sampleNodes[i];
      console.log(`\n=== Analyzing node ${i+1}/${sampleNodes.length}: ${node.name} (${node.type}) ===`);
      
      try {
        // Get detailed variable info
        const details = debugNodeVariables(node);
        console.log('Node variable details:', JSON.stringify(details, null, 2));
        
        // For each variable in this node, check what type it is
        for (const prop in details.variableBindings) {
          const binding = details.variableBindings[prop];
          
          // Process direct variable binding
          if (binding.isVariable && binding.variableId) {
            await analyzeVariableBinding(binding.variableId, `${prop}`);
          } 
          // Process array bindings (like fills)
          else if (binding.type === 'array' && binding.items) {
            for (const item of binding.items) {
              if (item.isVariable && item.variableId) {
                await analyzeVariableBinding(item.variableId, `${prop}[${item.index}]`);
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error analyzing node ${node.name}:`, err);
      }
      
      // Update progress if callback provided
      if (progressCallback) {
        progressCallback(Math.round(((i + 1) / sampleNodes.length) * 100));
      }
    }
    
    console.log('======= END VARIABLE DEBUG =======');
  } catch (err) {
    console.error('Error in debugDocumentVariables:', err);
  }
}

// Helper function to analyze a specific variable binding
async function analyzeVariableBinding(variableId: string, propPath: string): Promise<void> {
  try {
    console.log(`\nAnalyzing variable: ${variableId} at ${propPath}`);
    
    // Try to get the variable
    let variable = null;
    try {
      variable = await figma.variables.getVariableByIdAsync(variableId);
      if (variable) {
        console.log('Variable info:', {
          name: variable.name || 'No name',
          type: variable.resolvedType || 'Unknown type',
          remote: variable.remote || false,
          key: variable.key || 'No key'
        });
      }
    } catch (err) {
      console.log('Failed to get variable:', err);
    }
    
    // Check what type of variable this is
    const isTeam = await isTeamLibraryVariable(variableId);
    const isLocal = await isLocalLibraryVariable(variableId);
    const isMissing = await isMissingLibraryVariable(variableId);
    
    console.log('Variable classification:', {
      isTeamLibrary: isTeam,
      isLocalLibrary: isLocal,
      isMissingLibrary: isMissing
    });
    
    // If it's a remote variable, try to get more info about the library
    if (variable && variable.remote && variable.key) {
      try {
        // Parse library ID from the key
        const libraryId = variable.key.split(':')[0];
        console.log('Library ID:', libraryId);
        
        // Try to import to check if accessible
        try {
          await figma.variables.importVariableByKeyAsync(variable.key);
          console.log('Variable successfully imported - library is accessible');
        } catch (err) {
          console.log('Failed to import variable - library may be inaccessible:', err);
        }
      } catch (err) {
        console.log('Error analyzing remote variable:', err);
      }
    }
  } catch (err) {
    console.error('Error analyzing variable binding:', err);
  }
}

/**
 * Cancel any ongoing scan by setting the cancellation flag
 */
export function cancelScan(): void {
  isScanCancelled = true;
  console.log('Scan cancelled');
}

// Helper function to safely extract fontFamily from a node
function getFontFamilyFromNode(node: TextNode): string {
  if (!node.fontName) return 'Unknown Font';
  
  // Check if fontName is an object with a family property
  if (typeof node.fontName === 'object' && 'family' in node.fontName) {
    return node.fontName.family;
  }
  
  // Fall back to a default or try to extract information differently
  return node.fontName.toString() || 'Unknown Font';
}

// Helper function to safely extract fontWeight from a node
function getFontWeightFromNode(node: TextNode): number {
  if (!node.fontName) return 400;
  
  // Check if fontName is an object with a style property
  if (typeof node.fontName === 'object' && 'style' in node.fontName) {
    // Try to extract weight from style (e.g., "Bold" -> 700, "Regular" -> 400)
    const style = node.fontName.style.toLowerCase();
    if (style.includes('bold')) return 700;
    if (style.includes('medium')) return 500;
    if (style.includes('light')) return 300;
    return 400; // Default to regular weight
  }
  
  return 400; // Default weight
} 