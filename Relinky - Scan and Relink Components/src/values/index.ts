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
  getNodePath
} from '../common';

// Global variable to allow cancellation of scanning
let isScanCancelled = false;

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
        type: 'vertical-gap',
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
 * Main function to scan for missing references based on scan type
 * This is the entry point for all value scanning operations
 */
export async function scanForMissingReferences(
  scanType: ScanType,
  selectedFrameIds?: string[],
  progressCallback?: (progress: number) => void,
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  let nodesToScan: SceneNode[] = [];
  
  try {
    console.log(`Starting scan for ${scanType}`);
    // Reset the cancellation flag at the start of every scan
    isScanCancelled = false;
    
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
      console.log('Scanning entire page');
      nodesToScan = figma.currentPage.findAll(n => shouldIncludeNode(n, ignoreHiddenLayers));
    }

    console.log(`Found ${nodesToScan.length} nodes to scan (ignoreHiddenLayers: ${ignoreHiddenLayers})`);
    let refs: MissingReference[] = [];
    
    switch (scanType) {
      case 'vertical-gap':
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
    }

    console.log(`Scan complete. Found ${refs.length} issues`);
    return refs;
  } catch (err) {
    console.error('Error in scanForMissingReferences:', err);
    return [];
  }
}

/**
 * Cancel any ongoing scan by setting the cancellation flag
 */
export function cancelScan(): void {
  isScanCancelled = true;
  console.log('Scan cancelled');
} 