// Raw Values Scanner Module
// Handles scanning for raw values in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

// Type guards for node properties
function hasLayoutMode(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME' && 'layoutMode' in node;
}

function hasCornerRadius(node: SceneNode): node is RectangleNode | EllipseNode | PolygonNode | StarNode | VectorNode | FrameNode | ComponentNode | InstanceNode {
  return 'cornerRadius' in node;
}

function hasIndividualCornerRadii(node: SceneNode): node is RectangleNode | FrameNode | ComponentNode | InstanceNode {
  return (
    'topLeftRadius' in node &&
    'topRightRadius' in node &&
    'bottomLeftRadius' in node &&
    'bottomRightRadius' in node
  );
}

function hasPadding(node: SceneNode): node is FrameNode {
  return (
    node.type === 'FRAME' &&
    'paddingLeft' in node &&
    'paddingRight' in node &&
    'paddingTop' in node &&
    'paddingBottom' in node
  );
}

/**
 * Scan for raw values (direct values that are not from libraries)
 * 
 * @param selectedFrameIds - Array of frame IDs to scan (if empty, scans entire page)
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @returns Promise<MissingReference[]> - Array of references to raw values
 */
export async function scanForRawValues(
  scanType: ScanType,
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false
): Promise<MissingReference[]> {
  console.log('Starting raw values scan:', {
    scanType,
    selectedFrameIds: selectedFrameIds.length,
    ignoreHiddenLayers
  });
  
  // Check if scan was cancelled before starting
  if (isScancelled()) {
    console.log('Raw values scan cancelled before starting');
    return [];
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

  // Check if scan was cancelled after getting nodes
  if (isScancelled()) {
    console.log('Raw values scan cancelled after getting nodes');
    return [];
  }

  // Results array
  const results: MissingReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Total count for progress tracking
  let totalNodesProcessed = 0;
  let totalNodesToProcess = 0;
  
  // Recursively count nodes for accurate progress reporting
  function countNodes(nodes: readonly SceneNode[]): number {
    let count = nodes.length;
    for (const node of nodes) {
      if (isScancelled()) break;
      
      if ('children' in node) {
        count += countNodes(node.children);
      }
    }
    return count;
  }
  
  // Count total nodes to process
  totalNodesToProcess = countNodes(nodesToScan);
  console.log(`Total nodes to process: ${totalNodesToProcess}`);
  
  // Check if scan was cancelled after counting nodes
  if (isScancelled()) {
    console.log('Raw values scan cancelled after counting nodes');
    return [];
  }
  
  // Helper function to get a readable path for a node
  function getNodePath(node: BaseNode): string {
    const parts: string[] = [];
    let current: BaseNode | null = node;
    
    while (current && current.id !== figma.currentPage.id) {
      parts.unshift(current.name || current.id);
      current = current.parent;
    }
    
    return parts.join(' > ');
  }
  
  // Helper function to determine if we should include this node in results
  function shouldIncludeNode(node: SceneNode): boolean {
    // Skip if we've already processed this node
    if (processedNodeIds.has(node.id)) return false;
    
    // Skip if node is hidden and we're ignoring hidden layers
    if (ignoreHiddenLayers && 'visible' in node && !node.visible) return false;
    
    return true;
  }
  
  // Function to check if a property has a raw value (not using variables)
  function isRawValue(node: SceneNode, property: string): boolean {
    // Check for variable bindings
    if ('boundVariables' in node && node.boundVariables) {
      // For properties that could have array bindings (like fills)
      if (property === 'fills' || property === 'strokes') {
        // Get the binding, which could be an array for fills/strokes
        const binding = node.boundVariables[property];
        
        // If we have any binding at all for this property, it's not fully raw
        if (binding) {
          console.log(`Node ${node.name} has bound variables for ${property}:`, binding);
          
          // For fills/strokes, we need to check if ALL paints have variables
          // Since a partially bound fill array can still have raw values
          if (Array.isArray(binding)) {
            // Get the actual fills/strokes array
            const paints = (node as any)[property] as Paint[];
            
            // If there are fewer bindings than paints, some paints are raw values
            if (binding.length < paints.length) {
              console.log(`Node ${node.name} has partially bound ${property}: ${binding.length} bindings for ${paints.length} paints`);
              return true; // Has some raw values
            }
            
            // Check if any binding is null/undefined in the array (indicating a raw value)
            for (let i = 0; i < binding.length; i++) {
              if (!binding[i] || !binding[i].id) {
                console.log(`Node ${node.name} has a null/undefined binding for ${property}[${i}]`);
                return true; // Has some raw values
              }
            }
            
            // All paints have valid variable bindings
            console.log(`Node ${node.name} has fully bound ${property} (${binding.length} bindings)`);
            return false;
          }
          
          // Single binding for the whole property
          return false;
        }
      } else if (property in node.boundVariables) {
        console.log(`Property ${property} in node ${node.name} has a bound variable`);
        return false;
      }
    }
    
    // Check for styles, based on node type
    switch (node.type) {
      case 'RECTANGLE':
      case 'ELLIPSE':
      case 'POLYGON':
      case 'STAR':
      case 'VECTOR':
      case 'FRAME':
      case 'COMPONENT':
      case 'INSTANCE':
        // For shapes and containers
        if (property === 'fills' && 'fillStyleId' in node) {
          const styleId = node.fillStyleId;
          if (styleId !== '' && styleId !== undefined) {
            console.log(`Node ${node.name} uses a fill style, not a raw value`);
            return false;
          }
        }
        
        if (property === 'strokes' && 'strokeStyleId' in node) {
          const styleId = node.strokeStyleId;
          if (styleId !== '' && styleId !== undefined) {
            console.log(`Node ${node.name} uses a stroke style, not a raw value`);
            return false;
          }
        }
        
        if (property === 'effects' && 'effectStyleId' in node) {
          const styleId = node.effectStyleId;
          if (styleId !== '' && styleId !== undefined) {
            console.log(`Node ${node.name} uses an effect style, not a raw value`);
            return false;
          }
        }
        break;
        
      case 'TEXT':
        // For text nodes
        if (property === 'fillStyleId' || 
            property === 'fontName' || 
            property === 'fontSize' || 
            property === 'fontWeight' || 
            property === 'lineHeight' || 
            property === 'letterSpacing') {
          if ('textStyleId' in node) {
            const styleId = node.textStyleId;
            if (styleId !== '' && styleId !== undefined) {
              console.log(`Text node ${node.name} uses a text style, not raw values`);
              return false;
            }
          }
        }
        break;
    }
    
    // If we've gotten here, it's a raw value
    return true;
  }
  
  // Helper to check if an array property has valid items
  function hasValidItems(arr: any[] | null | undefined): boolean {
    return Array.isArray(arr) && arr.length > 0;
  }
  
  // Helper to check if a node has a valid fill
  function hasValidFill(node: SceneNode): boolean {
    if (!('fills' in node)) {
      return false;
    }
    
    // Access fills safely with type casting
    const fills = node.fills as ReadonlyArray<Paint> | PluginAPI['mixed'];
    
    // Handle mixed or undefined fills
    if (fills === figma.mixed || !fills || !Array.isArray(fills) || fills.length === 0) {
      return false;
    }
    
    // Check if any of the fills are enabled and aren't transparent
    return fills.some((fill) => {
      // Skip invisible fills
      if (fill.visible === false) {
        return false;
      }
      
      if (fill.type === 'SOLID') {
        // For solid fills - check if it has color and non-zero opacity
        if (!fill.color) {
          return false;
        }
        
        // Check opacity from both the fill's opacity property and the color's alpha
        const fillOpacity = typeof fill.opacity === 'number' ? fill.opacity : 1;
        const colorAlpha = 'a' in fill.color ? fill.color.a : 1;
        
        // A fill is valid if it has any opacity
        return fillOpacity > 0 && colorAlpha > 0;
      } 
      
      // Consider other fill types (gradients, images) as valid
      return true;
    });
  }
  
  // Helper to check if a node has a valid stroke
  function hasValidStroke(node: SceneNode): boolean {
    if (!('strokes' in node)) return false;
    
    const strokes = (node as any).strokes;
    if (!hasValidItems(strokes)) return false;
    
    // Check if any of the strokes are enabled and have a non-zero weight
    return strokes.some((stroke: Paint) => {
      if (stroke.visible === false) return false;
      
      if ('strokeWeight' in node) {
        const weight = (node as any).strokeWeight;
        if (typeof weight === 'number') {
          return weight > 0;
        }
      }
      
      return true;
    });
  }
  
  // Helper to check if a node has a valid effect
  function hasValidEffect(node: SceneNode): boolean {
    if (!('effects' in node)) return false;
    
    const effects = (node as any).effects;
    if (!hasValidItems(effects)) return false;
    
    // Check if any of the effects are enabled
    return effects.some((effect: Effect) => effect.visible !== false);
  }
  
  // Recursively process nodes
  async function processNodes(nodes: readonly SceneNode[]) {
    // Check if scan was cancelled
    if (isScancelled()) return;
    
    for (const node of nodes) {
      // Check if scan was cancelled
      if (isScancelled()) break;
      
      // Update progress
      totalNodesProcessed++;
      if (totalNodesProcessed % 50 === 0) {
        progressCallback(Math.min(totalNodesProcessed / totalNodesToProcess, 0.99));
        console.log(`Processing node: ${node.name} (${String(node.type)}), #${totalNodesProcessed} of ${totalNodesToProcess}`);
      }
      
      // Skip if we shouldn't include this node
      if (!shouldIncludeNode(node)) continue;
      
      // Mark this node as processed
      processedNodeIds.add(node.id);
      
      // Process raw values based on node type
      switch (node.type) {
        case 'RECTANGLE':
        case 'ELLIPSE':
        case 'POLYGON':
        case 'STAR':
        case 'VECTOR':
        case 'FRAME':
        case 'COMPONENT':
        case 'INSTANCE':
        case 'GROUP':
          // Check fill
          if (hasValidFill(node) && isRawValue(node, 'fills')) {
            console.log(`Found raw fill value in node: ${node.name} (${String(node.type)})`);
            
            // Get fills as a properly typed array - need to ensure 'fills' exists
            if (!('fills' in node)) {
              continue;
            }
            
            const fillsProp = node.fills as ReadonlyArray<Paint> | PluginAPI['mixed'];
            
            // Skip mixed fills as they're complicated to handle
            if (fillsProp === figma.mixed) {
              console.log(`Node ${node.name} has mixed fills, skipping`);
              continue;
            }
            
            // Ensure we have an array of fills
            const fills = Array.isArray(fillsProp) ? fillsProp : [];
            
            // Get bound variables for fills if they exist
            const boundVars = ('boundVariables' in node && node.boundVariables && node.boundVariables['fills']) 
                            ? node.boundVariables['fills'] 
                            : [];
            
            // Log for debugging
            console.log(`Node ${node.name} has ${fills.length} fills and ${Array.isArray(boundVars) ? boundVars.length : 0} bound variables`);
            
            // Find raw (unbound) fills
            if (fills.length > 0) {
              // Handle case where boundVars is an array (multiple bindings)
              if (Array.isArray(boundVars) && boundVars.length > 0) {
                // Process each fill to check which ones are raw
                for (let i = 0; i < fills.length; i++) {
                  const fill = fills[i];
                  
                  // Skip invisible fills
                  if (fill.visible === false) continue;
                  
                  // Check if this specific fill has a bound variable
                  const isBound = i < boundVars.length && 
                                  boundVars[i] && 
                                  typeof boundVars[i] === 'object' && 
                                  'id' in boundVars[i] && 
                                  boundVars[i].id;
                  
                  if (!isBound) {
                    // This is a raw fill
                    console.log(`Fill ${i} in node ${node.name} is raw:`, fill.type);
                    
                    // Add to results
                    results.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      location: getNodePath(node),
                      property: `fills[${i}]`,
                      type: 'raw-value',
                      currentValue: fill,
                      isVisible: node.visible !== false
                    });
                  }
                }
              } else {
                // No bound variables array, all fills are raw
                console.log(`All ${fills.length} fills in node ${node.name} are raw`);
                
                // Add each fill individually for better tracking
                for (let i = 0; i < fills.length; i++) {
                  const fill = fills[i];
                  
                  // Skip invisible fills
                  if (fill.visible === false) continue;
                  
                  results.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    location: getNodePath(node),
                    property: `fills[${i}]`,
                    type: 'raw-value',
                    currentValue: fill,
                    isVisible: node.visible !== false
                  });
                }
              }
            }
          }
          
          // Check stroke
          if (hasValidStroke(node) && isRawValue(node, 'strokes')) {
            console.log(`Found raw stroke value in node: ${node.name} (${String(node.type)})`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'strokes',
              type: 'raw-value',
              currentValue: (node as any).strokes,
              isVisible: node.visible !== false
            });
          }
          
          // Check effects (shadows, blurs)
          if (hasValidEffect(node) && isRawValue(node, 'effects')) {
            console.log(`Found raw effect value in node: ${node.name} (${String(node.type)})`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'effects',
              type: 'raw-value',
              currentValue: (node as any).effects,
              isVisible: node.visible !== false
            });
          }
          
          // Check for autolayout properties in Frame nodes
          if (hasLayoutMode(node) && node.layoutMode !== 'NONE') {
            // Check for gap value
            if (node.itemSpacing > 0 && isRawValue(node, 'itemSpacing')) {
              console.log(`Found raw gap value in node: ${node.name} (${String(node.layoutMode)})`);
              results.push({
                nodeId: node.id,
                nodeName: node.name,
                location: getNodePath(node),
                property: 'itemSpacing',
                type: 'raw-value',
                currentValue: node.itemSpacing,
                isVisible: node.visible !== false
              });
            }
            
            // Check padding values if this is a Frame with padding
            if (hasPadding(node)) {
              // Left padding
              if (node.paddingLeft > 0 && isRawValue(node, 'paddingLeft')) {
                console.log(`Found raw paddingLeft value in node: ${node.name}`);
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: 'paddingLeft',
                  type: 'raw-value',
                  currentValue: node.paddingLeft,
                  isVisible: node.visible !== false
                });
              }
              
              // Right padding
              if (node.paddingRight > 0 && isRawValue(node, 'paddingRight')) {
                console.log(`Found raw paddingRight value in node: ${node.name}`);
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: 'paddingRight',
                  type: 'raw-value',
                  currentValue: node.paddingRight,
                  isVisible: node.visible !== false
                });
              }
              
              // Top padding
              if (node.paddingTop > 0 && isRawValue(node, 'paddingTop')) {
                console.log(`Found raw paddingTop value in node: ${node.name}`);
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: 'paddingTop',
                  type: 'raw-value',
                  currentValue: node.paddingTop,
                  isVisible: node.visible !== false
                });
              }
              
              // Bottom padding
              if (node.paddingBottom > 0 && isRawValue(node, 'paddingBottom')) {
                console.log(`Found raw paddingBottom value in node: ${node.name}`);
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: 'paddingBottom',
                  type: 'raw-value',
                  currentValue: node.paddingBottom,
                  isVisible: node.visible !== false
                });
              }
            }
          }
          
          // Check corner radius
          if (hasCornerRadius(node) && typeof node.cornerRadius === 'number' && node.cornerRadius > 0 && isRawValue(node, 'cornerRadius')) {
            console.log(`Found raw corner radius value in node: ${node.name}`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'cornerRadius',
              type: 'raw-value',
              currentValue: node.cornerRadius,
              isVisible: node.visible !== false
            });
          }
          
          // Check individual corner radii if supported by this node type
          if (hasIndividualCornerRadii(node)) {
            // Top left
            if (node.topLeftRadius > 0 && isRawValue(node, 'topLeftRadius')) {
              console.log(`Found raw topLeftRadius value in node: ${node.name}`);
              results.push({
                nodeId: node.id,
                nodeName: node.name,
                location: getNodePath(node),
                property: 'topLeftRadius',
                type: 'raw-value',
                currentValue: node.topLeftRadius,
                isVisible: node.visible !== false
              });
            }
            
            // Top right
            if (node.topRightRadius > 0 && isRawValue(node, 'topRightRadius')) {
              console.log(`Found raw topRightRadius value in node: ${node.name}`);
              results.push({
                nodeId: node.id,
                nodeName: node.name,
                location: getNodePath(node),
                property: 'topRightRadius',
                type: 'raw-value',
                currentValue: node.topRightRadius,
                isVisible: node.visible !== false
              });
            }
            
            // Bottom left
            if (node.bottomLeftRadius > 0 && isRawValue(node, 'bottomLeftRadius')) {
              console.log(`Found raw bottomLeftRadius value in node: ${node.name}`);
              results.push({
                nodeId: node.id,
                nodeName: node.name,
                location: getNodePath(node),
                property: 'bottomLeftRadius',
                type: 'raw-value',
                currentValue: node.bottomLeftRadius,
                isVisible: node.visible !== false
              });
            }
            
            // Bottom right
            if (node.bottomRightRadius > 0 && isRawValue(node, 'bottomRightRadius')) {
              console.log(`Found raw bottomRightRadius value in node: ${node.name}`);
              results.push({
                nodeId: node.id,
                nodeName: node.name,
                location: getNodePath(node),
                property: 'bottomRightRadius',
                type: 'raw-value',
                currentValue: node.bottomRightRadius,
                isVisible: node.visible !== false
              });
            }
          }
          break;
          
        case 'TEXT':
          // Check text styles
          if (isRawValue(node, 'fillStyleId')) {
            console.log(`Found raw text style in node: ${node.name} (${String(node.type)})`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'fillStyleId',
              type: 'raw-value',
              currentValue: node.characters,
              isVisible: node.visible !== false
            });
          }
          
          // Check font properties
          if (isRawValue(node, 'fontName')) {
            console.log(`Found raw font name in node: ${node.name}`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'fontName',
              type: 'raw-value',
              currentValue: node.fontName,
              isVisible: node.visible !== false
            });
          }
          
          // Check for font size
          if (isRawValue(node, 'fontSize')) {
            console.log(`Found raw font size in node: ${node.name}: ${String(node.fontSize)}`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'fontSize',
              type: 'raw-value',
              currentValue: node.fontSize,
              isVisible: node.visible !== false
            });
          }
          
          // Check for font weight if it exists
          if ('fontWeight' in node && isRawValue(node, 'fontWeight')) {
            console.log(`Found raw font weight in node: ${node.name}`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'fontWeight',
              type: 'raw-value',
              currentValue: (node as any).fontWeight,
              isVisible: node.visible !== false
            });
          }
          
          // Check for line height
          if ('lineHeight' in node && isRawValue(node, 'lineHeight')) {
            console.log(`Found raw line height in node: ${node.name}`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'lineHeight',
              type: 'raw-value',
              currentValue: (node as any).lineHeight,
              isVisible: node.visible !== false
            });
          }
          
          // Check for letter spacing
          if ('letterSpacing' in node && isRawValue(node, 'letterSpacing')) {
            console.log(`Found raw letter spacing in node: ${node.name}`);
            results.push({
              nodeId: node.id,
              nodeName: node.name,
              location: getNodePath(node),
              property: 'letterSpacing',
              type: 'raw-value',
              currentValue: (node as any).letterSpacing,
              isVisible: node.visible !== false
            });
          }
          break;
      }
      
      // Process children recursively if they exist
      if ('children' in node) {
        await processNodes(node.children);
      }
    }
  }
  
  // Start processing nodes
  await processNodes(nodesToScan);
  
  // Check if scan was cancelled after processing
  if (isScancelled()) {
    console.log('Raw values scan cancelled during processing');
    return [];
  }
  
  // Set progress to 100% when done
  progressCallback(1);
  
  console.log(`Raw values scan complete. Found ${results.length} raw values.`);
  return results;
}

/**
 * Group raw value scan results by type and value
 * 
 * @param results - Array of raw value references to group
 * @returns Record<string, MissingReference[]> - Grouped references
 */
export function groupRawValueResults(
  results: MissingReference[]
): Record<string, MissingReference[]> {
  console.log(`Grouping ${results.length} raw value results`);
  const groups: Record<string, MissingReference[]> = {};
  
  // Group by type and value
  results.forEach(result => {
    // Skip invalid results
    if (!result || !result.property || result.currentValue === undefined) {
      console.warn('Skipping invalid raw value result:', result);
      return;
    }
    
    // Create a group key based on type and value properties
    let groupKey = '';
    
    // Handle different types of values for better grouping
    if (result.property === 'fills' || result.property.startsWith('fills[')) {
      // For fills, group by the first item's type and color
      const value = Array.isArray(result.currentValue) ? result.currentValue : [result.currentValue];
      
      if (value.length > 0) {
        const firstItem = value[0];
        if (firstItem && firstItem.type === 'SOLID') {
          // For solid fills, use the color as key
          if (firstItem.color) {
            const color = firstItem.color as RGBA | RGB;
            const colorKey = `r:${color.r.toFixed(2)},g:${color.g.toFixed(2)},b:${color.b.toFixed(2)}`;
            const opacityKey = 'a' in color ? `,a:${color.a.toFixed(2)}` : '';
            groupKey = `${result.property}-${firstItem.type}-${colorKey}${opacityKey}`;
          } else {
            groupKey = `${result.property}-${firstItem.type}-unknown-color`;
          }
        } else if (firstItem && firstItem.type) {
          // For other fill types, just use the type
          groupKey = `${result.property}-${firstItem.type}`;
        } else {
          groupKey = `${result.property}-unknown`;
        }
      } else {
        groupKey = `${result.property}-empty`;
      }
    } else if (result.property === 'strokes' || result.property.startsWith('strokes[')) {
      // For strokes, similar to fills but with stroke type
      const value = Array.isArray(result.currentValue) ? result.currentValue : [result.currentValue];
      if (value.length > 0) {
        const firstItem = value[0];
        if (firstItem && firstItem.type === 'SOLID') {
          // For solid strokes, use the color as key
          if (firstItem.color) {
            const color = firstItem.color as RGBA | RGB;
            const colorKey = `r:${color.r.toFixed(2)},g:${color.g.toFixed(2)},b:${color.b.toFixed(2)}`;
            const opacityKey = 'a' in color ? `,a:${color.a.toFixed(2)}` : '';
            groupKey = `${result.property}-${firstItem.type}-${colorKey}${opacityKey}`;
          } else {
            groupKey = `${result.property}-${firstItem.type}-unknown-color`;
          }
        } else if (firstItem && firstItem.type) {
          groupKey = `${result.property}-${firstItem.type}`;
        } else {
          groupKey = `${result.property}-unknown`;
        }
      } else {
        groupKey = `${result.property}-empty`;
      }
    } else if (result.property === 'fontName') {
      // For fonts, group by family and style
      const value = result.currentValue as FontName;
      if (value && value.family && value.style) {
        groupKey = `${result.property}-${value.family}-${value.style}`;
      } else {
        groupKey = `${result.property}-unknown-font`;
      }
    } else if (result.property === 'effects') {
      // For effects, try to group by effect type
      const value = result.currentValue as Effect[];
      if (Array.isArray(value) && value.length > 0) {
        const firstEffect = value[0];
        groupKey = `${result.property}-${firstEffect.type}`;
      } else {
        groupKey = `${result.property}-unknown-effect`;
      }
    } else if (result.property.includes('padding') || 
               result.property === 'itemSpacing' || 
               result.property.includes('Radius')) {
      // For spacing and radius values, group by property name and value
      groupKey = `${result.property}-${result.currentValue}`;
    } else if (result.property === 'fontSize' || 
               result.property === 'fontWeight' || 
               result.property === 'lineHeight' || 
               result.property === 'letterSpacing') {
      // For typography properties, group by property and value
      groupKey = `${result.property}-${result.currentValue}`;
    } else {
      // Default grouping
      try {
        groupKey = `${result.property}-${JSON.stringify(result.currentValue)}`;
      } catch (error) {
        console.warn('Error stringifying value for grouping:', error);
        groupKey = `${result.property}-complex-value`;
      }
    }
    
    // Ensure we have a valid group key
    if (!groupKey) {
      console.warn('Could not generate group key for result:', result);
      groupKey = `unknown-${Date.now()}-${Math.random()}`;
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  // Log group information
  console.log(`Grouped ${results.length} raw values into ${Object.keys(groups).length} groups`);
  
  return groups;
}