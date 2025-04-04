// Raw Values Scanner Module
// Handles scanning for raw values in the document

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

// Type guards for node properties
function hasLayoutMode(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME';
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

/**
 * Determines if a FrameNode has any padding (top, right, bottom, or left)
 */
function hasPadding(node: FrameNode): boolean {
  return node.paddingTop > 0 || 
         node.paddingRight > 0 || 
         node.paddingBottom > 0 || 
         node.paddingLeft > 0;
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
    const selectedNodes = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => node !== null && 'type' in node));
    
    nodesToScan = selectedNodes;
    console.log('Scanning selected frames:', nodesToScan.length, 'nodes');
    console.log('Selected node names:', nodesToScan.map(n => n.name).join(', '));
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
    if (ignoreHiddenLayers && 'visible' in node) {
      // Safely check visibility
      try {
        // Need to check explicitly against false since visible could be a mixed value
        if (node.visible === false) {
          return false;
        }
      } catch (e) {
        // If an error occurs, default to including the node
        console.warn(`Error checking visibility for node ${node.name}:`, e);
      }
    }
    
    return true;
  }
  
  /**
   * Checks if a property on a node is a raw value (not bound to a variable)
   */
  function isRawValue(node: SceneNode, propertyName: string): boolean {
    try {
      // Make sure the node has boundVariables property
      if ('boundVariables' in node) {
        // If there are no bound variables at all, it's definitely a raw value
        if (!node.boundVariables) {
          console.log(`Node ${node.name} has no boundVariables at all, property ${propertyName} is raw`);
          return true;
        }
        
        // Type-safe check if the property is not in boundVariables
        // @ts-ignore - Figma API doesn't provide complete typings for all possible property names
        const boundVariable = node.boundVariables[propertyName];
        if (!boundVariable) {
          console.log(`Property ${propertyName} is not bound on node ${node.name}, considering it raw`);
          return true;
        }
        
        // The property is bound to something, so it's not a raw value
        console.log(`Property ${propertyName} is bound on node ${node.name}, not a raw value`);
        return false;
      }
      
      // If the node doesn't have boundVariables property at all, 
      // it's using raw values by definition
      console.log(`Node ${node.name} cannot have bound variables (doesn't support boundVariables property), property ${propertyName} is raw`);
      return true;
    } catch (error) {
      console.warn(`Error checking if ${propertyName} is raw on node ${node.name}:`, error);
      // Default to true in case of errors - better to report potentially false positives
      return true;
    }
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
    if (fills === figma.mixed || !fills) {
      return false;
    }
    
    // For traversal purposes, consider all frames and containers valid
    // This ensures nested elements are scanned even if parent has no fills
    if (['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(node.type)) {
      return true;
    }
    
    // Empty array is valid for the purpose of traversal - we want to check children
    // even if the parent has no fills
    if (!Array.isArray(fills) || fills.length === 0) {
      return true; // Changed to true to allow traversal
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
  
  /**
   * Gets a node's visibility, considering all its parents
   */
  function getNodeVisibility(node: SceneNode): boolean {
    try {
      // Check if the node itself is visible
      if ('visible' in node && !node.visible) {
        return false;
      }
      
      // Check parent visibility recursively
      let parent = node.parent;
      while (parent) {
        if ('visible' in parent && !parent.visible) {
          return false;
        }
        parent = parent.parent;
      }
      
      return true;
    } catch (error) {
      console.warn(`Error checking visibility for node ${node.name}:`, error);
      // Default to true in case of errors
      return true;
    }
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
      
      // Check if node has children
      const hasChildren = 'children' in node && node.children && node.children.length > 0;
      
      // Extra debug for frames
      if (node.type === 'FRAME') {
        console.log(`Processing frame: ${node.name}, hasChildren: ${hasChildren}, layoutMode: ${(node as FrameNode).layoutMode}, scanType: ${scanType}`);
      }
      
      // Determine if this node should be included in the results
      const includeNode = shouldIncludeNode(node);
      
      // Get node visibility for logging
      const isVisible = getNodeVisibility(node);
      
      // If we're processing a hidden node, log it
      if (!isVisible) {
        console.log(`Processing ${includeNode ? '' : 'but skipping results for'} hidden node: ${node.name} (${node.type})`);
      }

      // Process this node first if it's a special scan type
      if (includeNode) {
        // Mark this node as processed
        processedNodeIds.add(node.id);
        
        // Extra debug logging for fill detection
        if (scanType === 'fill' && 'fills' in node) {
          const fills = node.fills as Paint[] | readonly Paint[] | PluginAPI['mixed'];
          const fillCount = fills === figma.mixed ? 'mixed' : (Array.isArray(fills) ? fills.length : 0);
          console.log(`Checking node for fills: ${node.name} (${node.type}), has ${fillCount} fills, visible: ${isVisible}`);
        }

        // For autolayout scans, we need to check the node regardless of children
        if (['gap', 'vertical-padding', 'horizontal-padding'].includes(scanType) && node.type === 'FRAME') {
          try {
            // Debug logging for autolayout properties
            console.log(`Checking frame for layout properties: ${node.name}, layoutMode: ${(node as FrameNode).layoutMode}, scanType: ${scanType}`);
            
            const frameNode = node as FrameNode;
            // Check for vertical spacing (gap value) - only if it has a valid layout mode
            if (frameNode.layoutMode !== 'NONE') {
              const spacing = frameNode.itemSpacing;
              console.log(`Frame ${node.name} has spacing: ${spacing}, layout: ${frameNode.layoutMode}`);
              
              // For vertical gap, we care only if the layout is VERTICAL
              if (scanType === 'gap' && frameNode.layoutMode === 'VERTICAL' && 
                  spacing > 0 && isRawValue(node, 'itemSpacing')) {
                console.log(`Found raw vertical gap in ${node.name}: ${spacing}`);
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: 'itemSpacing',
                  type: 'raw-value',
                  currentValue: spacing,
                  isVisible: isVisible
                });
              }
              
              // Check padding values if needed
              if ((scanType === 'vertical-padding' || scanType === 'horizontal-padding') && 
                  hasPadding(frameNode)) {
                
                if (scanType === 'vertical-padding') {
                  // Top padding
                  if (frameNode.paddingTop > 0 && isRawValue(node, 'paddingTop')) {
                    console.log(`Found raw paddingTop in ${node.name}: ${frameNode.paddingTop}`);
                    results.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      location: getNodePath(node),
                      property: 'paddingTop',
                      type: 'raw-value',
                      currentValue: frameNode.paddingTop,
                      isVisible: isVisible
                    });
                  }
                  
                  // Bottom padding
                  if (frameNode.paddingBottom > 0 && isRawValue(node, 'paddingBottom')) {
                    console.log(`Found raw paddingBottom in ${node.name}: ${frameNode.paddingBottom}`);
                    results.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      location: getNodePath(node),
                      property: 'paddingBottom',
                      type: 'raw-value',
                      currentValue: frameNode.paddingBottom,
                      isVisible: isVisible
                    });
                  }
                } else if (scanType === 'horizontal-padding') {
                  // Left padding
                  if (frameNode.paddingLeft > 0 && isRawValue(node, 'paddingLeft')) {
                    console.log(`Found raw paddingLeft in ${node.name}: ${frameNode.paddingLeft}`);
                    results.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      location: getNodePath(node),
                      property: 'paddingLeft',
                      type: 'raw-value',
                      currentValue: frameNode.paddingLeft,
                      isVisible: isVisible
                    });
                  }
                  
                  // Right padding
                  if (frameNode.paddingRight > 0 && isRawValue(node, 'paddingRight')) {
                    console.log(`Found raw paddingRight in ${node.name}: ${frameNode.paddingRight}`);
                    results.push({
                      nodeId: node.id,
                      nodeName: node.name,
                      location: getNodePath(node),
                      property: 'paddingRight',
                      type: 'raw-value',
                      currentValue: frameNode.paddingRight,
                      isVisible: isVisible
                    });
                  }
                }
              }
            } else {
              console.log(`Frame ${node.name} has no layout mode (NONE), skipping layout property checks`);
            }
          } catch (error) {
            console.warn(`Error checking layout properties for node ${node.name}:`, error);
          }
        }
        
        // Process other properties based on node type
        if (!['gap', 'vertical-padding', 'horizontal-padding'].includes(scanType)) {
          // Process regular properties as before
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
              // Check fill - only for node types that can have fills
              if (scanType === 'fill' && 'fills' in node) {
                try {
                  const fills = node.fills as Paint[] | readonly Paint[] | PluginAPI['mixed'];
                  
                  // Skip mixed fills - they're complex to handle
                  if (fills === figma.mixed) {
                    console.log(`Node ${node.name} has mixed fills, skipping fill check`);
                  } 
                  // Process array of fills - even empty ones
                  else if (Array.isArray(fills)) {
                    // Check if the fill array is a raw value that should be reported
                    if (fills.length > 0 && isRawValue(node, 'fills')) {
                      console.log(`Found raw fill value(s) in node: ${node.name} (${String(node.type)})`);
                      
                      // Get bound variables for fills if they exist
                      const boundVars = ('boundVariables' in node && node.boundVariables && node.boundVariables['fills']) 
                                    ? node.boundVariables['fills'] 
                                    : [];
                      
                      // Process each fill to determine if it's raw
                      for (let i = 0; i < fills.length; i++) {
                        const fill = fills[i];
                        
                        // Skip invisible fills
                        if (fill.visible === false) continue;
                        
                        // Check if this specific fill has a bound variable
                        let isBound = false;
                        
                        if (Array.isArray(boundVars) && boundVars.length > 0) {
                          // Safely check each condition separately
                          if (i < boundVars.length) {
                            const binding = boundVars[i];
                            if (binding && typeof binding === 'object') {
                              // Now safely check for id property
                              if ('id' in binding && binding.id) {
                                isBound = true;
                              }
                            }
                          }
                        }
                        
                        // Process each unbound fill
                        if (!isBound) {
                          results.push({
                            nodeId: node.id,
                            nodeName: node.name,
                            location: getNodePath(node),
                            property: `fills[${i}]`,
                            type: 'raw-value',
                            currentValue: fill,
                            isVisible: isVisible
                          });
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`Error processing fills in node ${node.name}:`, error);
                }
              }
              
              // Check stroke
              if (hasValidStroke(node) && isRawValue(node, 'strokes')) {
                console.log(`Found raw stroke value in node: ${node.name} (${String(node.type)})`);
                
                // Use a safe way to determine visibility
                const isNodeVisible = getNodeVisibility(node);
                
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: 'strokes',
                  type: 'raw-value',
                  currentValue: (node as any).strokes,
                  isVisible: isNodeVisible
                });
              }
              
              // Check effects (shadows, blurs)
              const effects = (node as any).effects;
              
              if (node && effects && effects.length > 0 && isRawValue(node, 'effects')) {
                console.log(`Found raw effects in node: ${node.name}`);
                results.push({
                  nodeId: node.id,
                  nodeName: node.name,
                  location: getNodePath(node),
                  property: 'effects',
                  type: 'raw-value',
                  currentValue: effects,
                  isVisible: getNodeVisibility(node)
                });
              }
              
              // Check for autolayout properties in Frame nodes
              if (node.type === 'FRAME') {
                // Debug log for autolayout detection
                console.log(`Checking frame for autolayout: ${node.name}, layoutMode: ${(node as FrameNode).layoutMode}`);
                
                try {
                  // Check for vertical spacing (gap value)
                  if ((node as FrameNode).layoutMode !== 'NONE') {
                    const spacing = (node as FrameNode).itemSpacing;
                    console.log(`Frame ${node.name} has spacing: ${spacing}, vertical: ${(node as FrameNode).layoutMode === 'VERTICAL'}`);
                    
                    // Only report raw value if the spacing is non-zero and is a raw value (not from a variable)
                    if (spacing > 0 && isRawValue(node, 'itemSpacing')) {
                      console.log(`Found raw gap value in node: ${node.name} (${(node as FrameNode).layoutMode})`);
                      results.push({
                        nodeId: node.id,
                        nodeName: node.name,
                        location: getNodePath(node),
                        property: 'itemSpacing',
                        type: 'raw-value',
                        currentValue: (node as FrameNode).itemSpacing,
                        isVisible: getNodeVisibility(node)
                      });
                    }
                  }
                  
                  // Check padding values if this is a Frame with padding and non-NONE layout
                  if (hasPadding(node as FrameNode) && (node as FrameNode).layoutMode !== 'NONE') {
                    // Left padding
                    if ((node as FrameNode).paddingLeft > 0 && isRawValue(node, 'paddingLeft')) {
                      console.log(`Found raw paddingLeft value in node: ${node.name}`);
                      results.push({
                        nodeId: node.id,
                        nodeName: node.name,
                        location: getNodePath(node),
                        property: 'paddingLeft',
                        type: 'raw-value',
                        currentValue: (node as FrameNode).paddingLeft,
                        isVisible: getNodeVisibility(node)
                      });
                    }
                    
                    // Right padding
                    if ((node as FrameNode).paddingRight > 0 && isRawValue(node, 'paddingRight')) {
                      console.log(`Found raw paddingRight value in node: ${node.name}`);
                      results.push({
                        nodeId: node.id,
                        nodeName: node.name,
                        location: getNodePath(node),
                        property: 'paddingRight',
                        type: 'raw-value',
                        currentValue: (node as FrameNode).paddingRight,
                        isVisible: getNodeVisibility(node)
                      });
                    }
                    
                    // Top padding
                    if ((node as FrameNode).paddingTop > 0 && isRawValue(node, 'paddingTop')) {
                      console.log(`Found raw paddingTop value in node: ${node.name}`);
                      results.push({
                        nodeId: node.id,
                        nodeName: node.name,
                        location: getNodePath(node),
                        property: 'paddingTop',
                        type: 'raw-value',
                        currentValue: (node as FrameNode).paddingTop,
                        isVisible: getNodeVisibility(node)
                      });
                    }
                    
                    // Bottom padding
                    if ((node as FrameNode).paddingBottom > 0 && isRawValue(node, 'paddingBottom')) {
                      console.log(`Found raw paddingBottom value in node: ${node.name}`);
                      results.push({
                        nodeId: node.id,
                        nodeName: node.name,
                        location: getNodePath(node),
                        property: 'paddingBottom',
                        type: 'raw-value',
                        currentValue: (node as FrameNode).paddingBottom,
                        isVisible: getNodeVisibility(node)
                      });
                    }
                  }
                } catch (error) {
                  console.warn(`Error checking autolayout properties for node ${node.name}:`, error);
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
                  isVisible: getNodeVisibility(node)
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
                    isVisible: getNodeVisibility(node)
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
                    isVisible: getNodeVisibility(node)
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
                    isVisible: getNodeVisibility(node)
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
                    isVisible: getNodeVisibility(node)
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
                  isVisible: getNodeVisibility(node)
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
                  isVisible: getNodeVisibility(node)
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
                  isVisible: getNodeVisibility(node)
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
                  isVisible: getNodeVisibility(node)
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
                  isVisible: getNodeVisibility(node)
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
                  isVisible: getNodeVisibility(node)
                });
              }
              break;
          }
        }
      }
      
      // Process children regardless of scanning order
      // This ensures we catch all nested elements even if parent doesn't match criteria
      if (hasChildren) {
        console.log(`Processing children of ${node.name} for ${scanType}`);
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