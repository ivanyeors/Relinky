// Effects Scanner Module
// Handles scanning for effect properties in the document (shadows, blurs, etc.)

import { MissingReference, ScanType } from '../common';
import { isScancelled } from './index';

// Extend MissingReference for effects-specific properties
interface EffectsReference extends MissingReference {
  effectType: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  effectProperty: 'x' | 'y' | 'blur' | 'spread' | 'color';
}

/**
 * Scan for effect properties in the document
 * 
 * @param scanType - Type of scan ('effects')
 * @param selectedFrameIds - Array of node IDs to scan (can include frames, components, groups, etc.)
 * @param progressCallback - Callback function for progress updates
 * @param ignoreHiddenLayers - Whether to ignore hidden layers during scanning
 * @param propertyFilter - Optional filter for specific effect properties (x, y, blur, spread, color)
 * @returns Promise<EffectsReference[]> - Array of references to effect properties
 */
export async function scanForEffects(
  scanType: 'effects',
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false,
  skipInstances: boolean = false,
  propertyFilter?: string
): Promise<EffectsReference[]> {
  console.log(`Starting ${scanType} scan - EFFECTS SCANNER INITIALIZED`, {
    selectedFrameIds: selectedFrameIds.length,
    ignoreHiddenLayers,
    propertyFilter
  });
  
  // Check if scan was cancelled before starting
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled before starting`);
    return [];
  }
  
  // Get nodes to scan
  let nodesToScan: SceneNode[] = [];
  
  // Determine which nodes to scan
  if (selectedFrameIds && selectedFrameIds.length > 0) {
    // Get selected nodes from IDs - now supporting ALL node types that can have effects
    const selectedNodes = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    ).then(nodes => nodes.filter((node): node is SceneNode => 
      node !== null && 'type' in node && 
      // Include ALL SceneNode types that can potentially have effects
      (node.type === 'FRAME' || 
       node.type === 'COMPONENT' || 
       node.type === 'COMPONENT_SET' ||
       node.type === 'INSTANCE' ||
       node.type === 'GROUP' ||
       node.type === 'SECTION' ||
       node.type === 'RECTANGLE' ||
       node.type === 'ELLIPSE' ||
       node.type === 'POLYGON' ||
       node.type === 'STAR' ||
       node.type === 'VECTOR' ||
       node.type === 'LINE' ||
       node.type === 'TEXT' ||
       node.type === 'BOOLEAN_OPERATION' ||
       node.type === 'SLICE' ||
       node.type === 'CONNECTOR' ||
       node.type === 'WIDGET' ||
       node.type === 'EMBED' ||
       node.type === 'LINK_UNFURL' ||
       node.type === 'MEDIA' ||
       node.type === 'STICKY' ||
       node.type === 'SHAPE_WITH_TEXT' ||
       node.type === 'CODE_BLOCK')
    ));
    
    console.log('Found selected nodes:', selectedNodes.length, 'nodes of types:', selectedNodes.map(n => n.type).join(', '));
    
    // Collect ALL nodes to scan (including all descendants)
    for (const selectedNode of selectedNodes) {
      // Add the selected node itself
      nodesToScan.push(selectedNode);
      
      // Add all descendants if the node has children and meets visibility criteria
      if ('children' in selectedNode && selectedNode.children.length > 0) {
        try {
          // Use findAll to get ALL descendant nodes
          const descendants = selectedNode.findAll((node: SceneNode) => {
            // Apply visibility filter if needed
            if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
              return false;
            }
            // Include all SceneNode types that can have effects
            return 'effects' in node;
          });
          
          console.log(`Adding ${descendants.length} descendants from ${selectedNode.name}`);
          nodesToScan.push(...descendants);
        } catch (error) {
          console.warn(`Error collecting descendants from ${selectedNode.name}:`, error);
        }
      }
    }
    
    console.log('Total nodes to scan (including descendants):', nodesToScan.length);
  } else {
    // Fallback to current page - use findAll to get all nodes
    nodesToScan = figma.currentPage.findAll((node: SceneNode) => {
      // Apply visibility filter if needed
      if (ignoreHiddenLayers && 'visible' in node && !node.visible) {
        return false;
      }
      // Include all nodes that can have effects
      return 'effects' in node;
    });
    console.log('Scanning entire page:', nodesToScan.length, 'nodes with effects capability');
  }
  
  // Check if scan was cancelled after getting nodes
  if (isScancelled()) {
    console.log(`${scanType} scan cancelled after getting nodes`);
    return [];
  }
  
  // Results array
  const results: EffectsReference[] = [];
  
  // Cache for nodes we've already processed to avoid duplicates
  const processedNodeIds = new Set<string>();
  
  // Total count for progress tracking
  let totalNodesProcessed = 0;
  let totalNodesToProcess = nodesToScan.length; // Now we know the exact count upfront
  
  console.log(`Found ${totalNodesToProcess} total nodes to scan for ${scanType}`);
  
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
    
    // Skip instances if skipInstances is true
    if (skipInstances && node.type === 'INSTANCE') return false;
    
    // Only process nodes that can have effects
    return 'effects' in node;
  }
  
  // Check if a property on a node is a raw value (not bound to a variable)
  function isRawValue(node: SceneNode, propertyName: string): boolean {
    try {
      // Make sure the node has boundVariables property
      if ('boundVariables' in node) {
        // If there are no bound variables at all, it's definitely a raw value
        if (!node.boundVariables) {
          return true;
        }
        
        // Type-safe check if the property is not in boundVariables
        // @ts-ignore - Figma API doesn't provide complete typings for all possible property names
        const boundVariable = node.boundVariables[propertyName];
        if (!boundVariable) {
          return true;
        }
        
        // The property is bound to something, so it's not a raw value
        return false;
      }
      
      // If the node doesn't have boundVariables property at all, 
      // it's using raw values by definition
      return true;
    } catch (error) {
      console.warn(`Error checking if ${propertyName} is raw on node ${node.name}:`, error);
      // Default to true in case of errors - better to report potentially false positives
      return true;
    }
  }
  
  // Check if we should include this effect property based on the filter
  function shouldIncludeProperty(property: string): boolean {
    if (!propertyFilter) return true;
    return propertyFilter === property || propertyFilter === 'all';
  }
  
  // Process a single node (no longer recursive since we have all nodes in the flat list)
  function processNode(node: SceneNode) {
    // Skip if we shouldn't include this node
    if (!shouldIncludeNode(node)) return;
    
    // Mark as processed
    processedNodeIds.add(node.id);
    
    // Update progress occasionally
    totalNodesProcessed++;
    if (totalNodesProcessed % 50 === 0 || totalNodesProcessed === totalNodesToProcess) {
      const progress = Math.min(totalNodesProcessed / totalNodesToProcess, 0.99);
      progressCallback(progress);
      console.log(`Processing effects: ${totalNodesProcessed}/${totalNodesToProcess} nodes (${Math.round(progress * 100)}%)`);
    }
    
    // Safe check for effects property
    if (!('effects' in node) || !Array.isArray(node.effects) || node.effects.length === 0) {
      return;
    }
    
    // Skip if effects has a variable binding and is not raw
    if (!isRawValue(node, 'effects')) {
      console.log(`Node ${node.name} has effects bound to variables, skipping`);
      return;
    }
    
    console.log(`Checking effects on node: ${node.name} (${node.type}) - found ${node.effects.length} effects`);
    
    // Process each effect
    for (let i = 0; i < node.effects.length; i++) {
      const effect = node.effects[i];
      
      // Skip if effect is not visible
      if (!effect.visible) {
        console.log(`Effect ${i} on ${node.name} is not visible, skipping`);
        continue;
      }
      
      console.log(`Processing effect ${i} on ${node.name}: ${effect.type}`);
      
      // Process DROP_SHADOW effects
      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        // Check X position
        if (shouldIncludeProperty('x') && typeof effect.offset.x === 'number') {
          console.log(`Found raw effect X offset: ${effect.offset.x} on ${node.name}`);
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property: `effects[${i}].offset.x`,
            type: 'effects',
            currentValue: effect.offset.x,
            isVisible: node.visible !== false,
            effectType: effect.type,
            effectProperty: 'x'
          });
        }
        
        // Check Y position
        if (shouldIncludeProperty('y') && typeof effect.offset.y === 'number') {
          console.log(`Found raw effect Y offset: ${effect.offset.y} on ${node.name}`);
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property: `effects[${i}].offset.y`,
            type: 'effects',
            currentValue: effect.offset.y,
            isVisible: node.visible !== false,
            effectType: effect.type,
            effectProperty: 'y'
          });
        }
        
        // Check blur radius
        if (shouldIncludeProperty('blur') && typeof effect.radius === 'number') {
          console.log(`Found raw effect blur radius: ${effect.radius} on ${node.name}`);
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property: `effects[${i}].radius`,
            type: 'effects',
            currentValue: effect.radius,
            isVisible: node.visible !== false,
            effectType: effect.type,
            effectProperty: 'blur'
          });
        }
        
        // Check spread (only for DROP_SHADOW and INNER_SHADOW)
        if (shouldIncludeProperty('spread') && typeof effect.spread === 'number') {
          console.log(`Found raw effect spread: ${effect.spread} on ${node.name}`);
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property: `effects[${i}].spread`,
            type: 'effects',
            currentValue: effect.spread,
            isVisible: node.visible !== false,
            effectType: effect.type,
            effectProperty: 'spread'
          });
        }
        
        // Check color
        if (shouldIncludeProperty('color') && effect.color) {
          console.log(`Found raw effect color on ${node.name}`);
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property: `effects[${i}].color`,
            type: 'effects',
            currentValue: {
              r: effect.color.r,
              g: effect.color.g,
              b: effect.color.b,
              a: effect.color.a || 1
            },
            isVisible: node.visible !== false,
            effectType: effect.type,
            effectProperty: 'color'
          });
        }
      }
      
      // Process LAYER_BLUR and BACKGROUND_BLUR effects
      else if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
        // Check blur radius
        if (shouldIncludeProperty('blur') && typeof effect.radius === 'number') {
          console.log(`Found raw blur effect radius: ${effect.radius} on ${node.name}`);
          results.push({
            nodeId: node.id,
            nodeName: node.name,
            location: getNodePath(node),
            property: `effects[${i}].radius`,
            type: 'effects',
            currentValue: effect.radius,
            isVisible: node.visible !== false,
            effectType: effect.type,
            effectProperty: 'blur'
          });
        }
      }
    }
  }
  
  // Process all nodes in the flat list (no longer recursive)
  for (const node of nodesToScan) {
    // Check if scan was cancelled
    if (isScancelled()) {
      console.log(`${scanType} scan cancelled during processing`);
      return [];
    }
    
    processNode(node);
  }
  
  // Set progress to 100% when done
  progressCallback(1);
  
  console.log(`${scanType} scan complete. Found ${results.length} effect property values.`);
  return results;
}

/**
 * Group effects scan results by type and value
 * 
 * @param results - Array of effects references to group
 * @returns Record<string, EffectsReference[]> - Grouped references
 */
export function groupEffectsResults(
  results: EffectsReference[]
): Record<string, EffectsReference[]> {
  const groups: Record<string, EffectsReference[]> = {};
  
  // Group by effect type, property type, and value
  results.forEach(result => {
    // Format value based on property type
    let formattedValue: string;
    
    if (result.effectProperty === 'color' && typeof result.currentValue === 'object') {
      // Format color values
      const color = result.currentValue;
      formattedValue = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${color.a.toFixed(2)})`;
    } else {
      // Format number values with fixed precision
      const value = Number(result.currentValue);
      formattedValue = value.toFixed(2);
    }
    
    // Create a group key based on effect type, property and value
    const groupKey = `${result.effectType}-${result.effectProperty}-${formattedValue}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    
    groups[groupKey].push(result);
  });
  
  return groups;
} 