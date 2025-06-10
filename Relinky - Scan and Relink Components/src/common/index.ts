// Common utilities and interfaces used by both features
// This file contains shared code between Values scanning and Variables scanning

// --- Common Interfaces ---

// Simplified type definitions
export interface MissingReference {
  nodeId: string;
  nodeName: string;
  type: string;
  property: string;
  currentValue: any;
  location: string;
  variableName?: string;
  variableValue?: any;
  variableType?: string;  // Add variableType property to store the variable's type
  variableCategory?: string; // Add variableCategory property for filtering
  preview?: string;
  isInactiveLibrary?: boolean;  // From inactive library
  isUnlinked?: boolean;         // Raw value (no variable/style)
  isTeamLibrary?: boolean;      // From team/remote library
  isLocalLibrary?: boolean;     // From local library
  isMissingLibrary?: boolean;   // Variable from missing library
  libraryName?: string;         // Name of the library if applicable
  libraryKey?: string;          // Key of the library if applicable
  parentNodeId?: string;        // Add parent node ID for context
  path?: string;                // Add node path for better location info
  isVisible: boolean;           // Whether the node is visible
  groupKey?: string;            // Custom key for grouping references with similar properties
  dimensionType?: string;       // Added for layout scanning (width/height)
}

// Update ScanType to include all scan types
export type ScanType = 'inactive-tokens' | 'missing-library' | 'deleted-variables' |
  'gap' | 'horizontal-padding' | 'vertical-padding' | 'corner-radius' | 'fill' | 'stroke' | 'typography' |
  'other' | 'color' | 'padding' | 'dimension' | 'opacity' | 'number' | 'string' | 'visibility' | 'boolean' |
  'layout' | 'effects' | 'effect-opacity'; // Added effects and effect-opacity types

// Interface for tracking scan progress
export interface ScanProgress {
  type: ScanType;
  progress: number;
}

// Interface for variable binding types based on Figma API
export interface VariableAlias {
  type: "VARIABLE_ALIAS";
  id: string;
}

export interface VariableBinding {
  type: "VARIABLE";
  id: string;
}

export type FillBinding = VariableAlias | VariableBinding | VariableAlias[];

// Interface for effect properties
export type EffectProperty = 'offset' | 'radius' | 'spread' | 'color';

export type EffectPropertyMap = {
  'DROP_SHADOW': EffectProperty[];
  'INNER_SHADOW': EffectProperty[];
  'LAYER_BLUR': EffectProperty[];
  'BACKGROUND_BLUR': EffectProperty[];
};

// Interface for corner radius bound variables
export interface CornerRadiusVariables {
  cornerRadius?: VariableBinding;
  topLeftRadius?: VariableBinding;
  topRightRadius?: VariableBinding;
  bottomLeftRadius?: VariableBinding;
  bottomRightRadius?: VariableBinding;
}

// Interface for text style variable bindings
export interface TextStyleBindings {
  textStyleId?: {
    type: 'VARIABLE';
    id: string;
  };
}

// Update the PluginMessage interface to include all possible message types
export interface PluginMessage {
  type: string;
  scanType?: ScanType;
  scanScope?: 'entire-page' | 'selected-frames';
  selectedFrameIds?: string[];
  width?: number;
  height?: number;
  nodeId?: string;
  nodeIds?: string[];
  tokenType?: string;
  tokenValue?: string;
  styleType?: string;
  styleId?: string;
  message?: string;
  progress?: number;
  references?: Record<string, MissingReference[]>;
  results?: MissingReference[]; // For raw results that need grouping
  variables?: MissingReference[]; // For debug-results message
  variableTypes?: string[]; // Array of variable types to filter by (e.g. 'color', 'number', etc.)
  isDebugScan?: boolean; // Flag for debug scan results
  status?: 'success' | 'error'; // For scan-complete message
  scanEntirePage?: boolean;
  isRescan?: boolean;
  ignoreHiddenLayers?: boolean;
  isLibraryVariableScan?: boolean; // Whether this is a library variable scan
  isScanning?: boolean; // Flag for scan-progress messages
  isGrouped?: boolean; // Flag for grouped results
  sourceType?: 'raw-values' | 'missing-library' | 'deleted-variables'; // Source type for scan-for-tokens message
}

// Interface for document change tracking
export interface DocumentChangeHandler {
  lastScanType?: ScanType;
  isWatching: boolean;
  timeoutId?: ReturnType<typeof setTimeout>;
  changeHandler?: () => void;
  scanEntirePage?: boolean;
  selectedFrameIds?: string[];
  ignoreHiddenLayers?: boolean;
}

// --- Type Guard Functions ---

// Type guards to safely work with Figma's node types
export function hasVariableBindings(node: BaseNode): boolean {
  if (!('boundVariables' in node)) return false;
  
  // Get boundVariables with type assertion for safer access
  const boundVars = (node as any).boundVariables;
  
  // Case 1: boundVariables exists and is not null/undefined
  if (!boundVars) return false;
  
  // Case 2: boundVariables has at least one key/property
  const keys = Object.keys(boundVars);
  if (keys.length === 0) return false;
  
  // Case 3: Check that at least one binding contains variable data
  for (const key of keys) {
    const binding = boundVars[key];
    
    // Handle array of bindings (e.g. fills)
    if (Array.isArray(binding)) {
      for (const item of binding) {
        if (isVariableBinding(item)) return true;
      }
      continue;
    }
    
    // Handle single binding
    if (isVariableBinding(binding)) return true;
  }
  
  return false;
}

// New helper to check for variable type bindings
export function isVariableBinding(binding: any): boolean {
  if (!binding) return false;
  
  // Check for VARIABLE or VARIABLE_ALIAS type
  if (binding.type === 'VARIABLE' || binding.type === 'VARIABLE_ALIAS') {
    return 'id' in binding && !!binding.id;
  }
  
  return false;
}

// Enhanced helper to detect team library variables
export async function isTeamLibraryVariable(variableId: string): Promise<boolean> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) return false;
    
    // Must be remote variable
    if (!variable.remote) return false;
    
    try {
      // Try to import - if successful, it's an active team library variable
      await figma.variables.importVariableByKeyAsync(variable.key);
      return true;
    } catch {
      // If import fails, it's not accessible
      return false;
    }
  } catch {
    return false;
  }
}

// Enhanced helper to detect local library variables
export async function isLocalLibraryVariable(variableId: string): Promise<boolean> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    // Local variables are not remote
    return variable !== null && !variable.remote;
  } catch {
    return false;
  }
}

// Enhanced helper to detect missing library variables
export async function isMissingLibraryVariable(variableId: string): Promise<boolean> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) return true; // Can't get variable, must be missing
    
    // Remote variable that can't be imported
    if (variable.remote) {
      try {
        await figma.variables.importVariableByKeyAsync(variable.key);
        return false; // Successfully imported, not missing
      } catch {
        return true; // Failed to import, it's missing
      }
    }
    
    return false; // Local variable, not missing
  } catch {
    return true; // Error getting variable, consider it missing
  }
}

// Helper to extract binding details
interface BindingDetails {
  isVariable: boolean;
  bindingType?: string;
  variableId?: string;
  name?: string;
  value?: any;
}

function getBindingDetails(binding: any): BindingDetails {
  if (!binding) return { isVariable: false };
  
  const details: BindingDetails = {
    isVariable: false,
  };
  
  if (typeof binding === 'object') {
    details.bindingType = binding.type || 'unknown';
    
    if ((binding.type === 'VARIABLE' || binding.type === 'VARIABLE_ALIAS') && 'id' in binding) {
      details.isVariable = true;
      details.variableId = binding.id;
      // Add other properties if they exist
      if ('name' in binding) details.name = binding.name;
      if ('value' in binding) details.value = binding.value;
    }
  }
  
  return details;
}

// Comprehensive function to examine boundVariables and detect all types
export function debugNodeVariables(node: SceneNode): Record<string, any> {
  const result: Record<string, any> = {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    hasVariables: false,
    variableBindings: {},
  };
  
  if (!('boundVariables' in node) || !node.boundVariables) {
    return result;
  }
  
  const boundVars = node.boundVariables as Record<string, any>;
  result.hasVariables = Object.keys(boundVars).length > 0;
  
  // Examine each binding
  for (const prop in boundVars) {
    const binding = boundVars[prop];
    
    // Handle array bindings (e.g. fills)
    if (Array.isArray(binding)) {
      const items: Array<{index: number} & BindingDetails> = [];
      
      for (let i = 0; i < binding.length; i++) {
        const details = getBindingDetails(binding[i]);
        if (details.isVariable) {
          items.push({
            index: i,
            ...details
          });
        }
      }
      
      result.variableBindings[prop] = {
        type: 'array',
        items
      };
      continue;
    }
    
    // Handle single binding
    if (binding && typeof binding === 'object') {
      result.variableBindings[prop] = getBindingDetails(binding);
    }
  }
  
  return result;
}

export function hasAutoLayout(node: BaseNode): node is FrameNode {
  return node.type === 'FRAME' && 'layoutMode' in node;
}

export function hasTextProperties(node: BaseNode): node is TextNode {
  return node.type === 'TEXT';
}

export function hasTextStyles(node: BaseNode): node is TextNode {
  return node.type === 'TEXT';
}

export function hasEffectStyles(node: BaseNode): node is (SceneNode & { effectStyleId: string }) {
  return 'effectStyleId' in node;
}

export function hasFills(node: BaseNode): node is SceneNode & { fills: readonly Paint[] } {
  return 'fills' in node && Array.isArray((node as any).fills);
}

export function hasStrokes(node: BaseNode): node is SceneNode & { strokes: readonly Paint[] } {
  return 'strokes' in node && Array.isArray((node as any).strokes);
}

export function hasEffects(node: BaseNode): node is SceneNode & { effects: readonly Effect[] } {
  return 'effects' in node && Array.isArray((node as any).effects);
}

export function hasCornerRadius(node: BaseNode): node is RectangleNode | ComponentNode | InstanceNode | FrameNode {
  if (node.type !== 'RECTANGLE' && 
      node.type !== 'COMPONENT' && 
      node.type !== 'INSTANCE' && 
      node.type !== 'FRAME') {
    return false;
  }
  
  // Check if the node has cornerRadius property
  return 'cornerRadius' in node || (
    'topLeftRadius' in node &&
    'topRightRadius' in node &&
    'bottomLeftRadius' in node &&
    'bottomRightRadius' in node
  );
}

export function hasOpacity(node: BaseNode): node is SceneNode & MinimalFillsMixin & MinimalStrokesMixin {
  return 'opacity' in node && typeof (node as any).opacity === 'number';
}

export function hasBlendMode(node: BaseNode): node is SceneNode & { blendMode: BlendMode } {
  return 'blendMode' in node;
}

export function hasConstraints(node: BaseNode): node is SceneNode & { constraints: Constraints } {
  return 'constraints' in node;
}

export function hasTextStyleBindings(node: BaseNode): node is TextNode & { 
  boundVariables: TextStyleBindings;
} {
  return node.type === 'TEXT' && 
         'boundVariables' in node && 
         node.boundVariables !== null &&
         'textStyleId' in (node.boundVariables || {});
}

// --- Helper Functions ---

// Visibility Helpers
export function isNodeVisible(node: BaseNode): boolean {
  try {
    // Skip instance children as they inherit visibility
    if (node.parent?.type === 'INSTANCE') {
      return false;
    }

    // Check if node itself is visible
    if ('visible' in node && !(node as SceneNode).visible) {
      return false;
    }

    // Check if node is inside a collapsed group/frame/component
    let current: BaseNode | null = node;
    while (current && current.parent) {
      const parent = current.parent as BaseNode & { type: NodeType };

      // 1. Check parent visibility
      if ('visible' in parent && !(parent as SceneNode).visible) {
        return false;
      }

      // 2. Check if hidden in frames
      if (parent.type === 'FRAME') {
        const frame = parent as FrameNode;
        const currentNode = current as SceneNode;

        // Check if hidden by clipping
        if (frame.clipsContent) {
          if (currentNode.x < 0 || 
              currentNode.y < 0 || 
              currentNode.x + currentNode.width > frame.width || 
              currentNode.y + currentNode.height > frame.height) {
            return false;
          }
        }

        // Check if hidden in auto-layout
        if (frame.layoutMode !== 'NONE') {
          const currentNode = current as SceneNode;
          if ('layoutPositioning' in currentNode && currentNode.layoutPositioning === 'ABSOLUTE') {
            return false;
          }
          // Check if hidden by auto-layout overflow
          if (frame.layoutMode === 'VERTICAL' && frame.clipsContent) {
            if (currentNode.y < 0 || currentNode.y + currentNode.height > frame.height) {
              return false;
            }
          }
          if (frame.layoutMode === 'HORIZONTAL' && frame.clipsContent) {
            if (currentNode.x < 0 || currentNode.x + currentNode.width > frame.width) {
              return false;
            }
          }
        }
      }

      // 3. Check if hidden in groups
      if (parent.type === 'GROUP') {
        const group = parent as GroupNode;
        // Check if group is collapsed
        if (!group.expanded) {
          return false;
        }
        // Check if node is actually in the group
        if (!group.children.includes(current as SceneNode)) {
          return false;
        }
      }

      // Check objects hidden in sections
      if (parent.type === 'SECTION') {
        const section = parent as SectionNode;
        if (!section.visible) {
          return false;
        }
        // Check if hidden by section collapse
        if ('visible' in section && !section.visible) {
          return false;
        }
      }
      // 4. Check if hidden in components
      if (parent.type === 'COMPONENT' || parent.type === 'COMPONENT_SET') {
        const component = parent as ComponentNode | ComponentSetNode;
        if (!component.expanded) {
          return false;
        }
      }
      // 5. Check if hidden in sections
      if (parent.type === 'SECTION') {
        const section = parent as SectionNode;
        if (!section.visible) {
          return false;
        }
      }

      // 6. Check opacity (fully transparent is considered hidden)
      if ('opacity' in parent && hasOpacity(parent)) {
        const nodeWithOpacity = parent as SceneNode & { opacity: number };
        if (nodeWithOpacity.opacity === 0) {
          return false;
        }
      }
            
      // Check if parent is collapsed
      if ('expanded' in parent) {
        const expandableParent = parent as FrameNode | GroupNode | ComponentNode | ComponentSetNode;
        if (!expandableParent.expanded) {
          return false;
        }
      }
      // General visibility checks
      if ('visible' in parent && !(parent as SceneNode).visible) {
        return false;
      }
      if ('opacity' in parent && (parent as SceneNode & { opacity: number }).opacity === 0) {
        return false;
      }

      // Check if hidden by mask
      if (parent.type === 'FRAME' && (parent as FrameNode).isMask) {
        const parentFrame = parent as FrameNode;
        const nodeIndex = parentFrame.children.indexOf(current as SceneNode);
        if (nodeIndex > 0) { // Not the mask itself
          return false;
        }
      }

      // Check blend mode visibility
      if ('blendMode' in current) {
        const currentNode = current as SceneNode & { blendMode: BlendMode };
        if (currentNode.blendMode === 'PASS_THROUGH') {
          const parentOpacity = 'opacity' in parent ? 
            (parent as SceneNode & { opacity: number }).opacity : 1;
          if (parentOpacity === 0) {
            return false;
          }
        }
      }
      current = parent;
    }

    return true;
  } catch (err) {
    console.warn('Error checking node visibility:', err);
    return false;
  }
}

// Helper to check if a node should be included in scan based on visibility settings
export function shouldIncludeNode(node: BaseNode, ignoreHiddenLayers: boolean): boolean {
  // If we're not ignoring hidden layers, include all nodes
  if (!ignoreHiddenLayers) {
    return true;
  }

  return isNodeVisible(node);
}

// Helper to check if a node is hidden by its parent
export function isHiddenByParent(node: SceneNode): boolean {
  let current: BaseNode | null = node;
  
  while (current && current.parent) {
    const parent: BaseNode = current.parent;
    
    // Check if parent is a SceneNode
    if ('type' in parent) {
      const sceneParent = parent as SceneNode;
      
      // Check visibility - visible property exists on SceneNode
      if (!sceneParent.visible) {
        return true;
      }

      // Check opacity - only exists on certain node types
      if ('opacity' in sceneParent && typeof sceneParent.opacity === 'number' && sceneParent.opacity === 0) {
        return true;
      }
    }
    
    current = parent;
  }
  
  return false;
}

// Helper to format typography values for display
export function formatTypographyValue(value: any): any {
  if (!value || typeof value !== 'object') {
    return {
      fontFamily: 'Unknown',
      fontWeight: 'Regular',
      fontSize: '12'
    };
  }
  
  // Extract values with defaults
  const fontFamily = value.fontFamily || 'Unknown';
  const fontWeight = value.fontWeight || 'Regular';
  const fontSize = value.fontSize || '12';
  
  // Return structured format for UI label display
  return {
    fontFamily,
    fontWeight,
    fontSize,
    // Keep the original string format for backward compatibility
    formatted: `${fontFamily} ${fontWeight} ${fontSize}px`
  };
}

// Helper to ensure a node is visible (expands parents, etc.)
export function ensureNodeIsVisible(node: SceneNode) {
  try {
    let current: BaseNode | null = node;
    
    while (current && current.parent) {
      // Handle different node types
      if ('visible' in current) {
        (current as SceneNode).visible = true;
      }

      // Expand groups/frames
      if ('expanded' in current.parent) {
        const parent = current.parent as FrameNode | GroupNode | ComponentNode | ComponentSetNode;
        parent.expanded = true;
      }

      // Handle auto-layout frames
      if ('layoutMode' in current.parent && 'clipsContent' in current.parent) {
        const parent = current.parent as FrameNode;
        if (parent.clipsContent) {
          parent.clipsContent = false;
        }
      }

      current = current.parent;
    }
  } catch (err) {
    console.warn('Error ensuring node visibility:', err);
  }
}

// Helper to get node path for better location info
export function getNodePath(node: BaseNode): string {
  const path: string[] = [];
  let current: BaseNode | null = node;
  
  while (current) {
    if ('name' in current) {
      path.unshift(current.name);
    }
    current = current.parent;
  }
  
  return path.join(' / ');
}

// Helper to check if a node is still valid
export async function isNodeValid(nodeId: string): Promise<boolean> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    return node !== null && !node.removed;
  } catch {
    return false;
  }
}

// Progress tracking helpers
export function updateProgress(progress: number) {
  // Normalize progress to 0-99.5 range during scanning
  const normalizedProgress = Math.min(99.5, Math.max(0, progress * 99.5));
  
  figma.ui.postMessage({
    type: 'scan-progress',
    progress: normalizedProgress,
    isScanning: true
  });
}

export function resetProgress() {
  figma.ui.postMessage({
    type: 'scan-progress',
    progress: 0,
    isScanning: false
  });
}

export function completeProgress() {
  figma.ui.postMessage({
    type: 'scan-progress',
    progress: 100,
    isScanning: false
  });
}

// Helper to create a throttled progress updater with adaptive sensitivity
export function createThrottledProgress(minChangePercent = 0.5) {
  let lastProgress = 0;
  let lastUpdateTime = Date.now();
  
  return (progress: number) => {
    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - lastUpdateTime;
    
    // Calculate target normalized progress (0-1 range)
    const normalizedProgress = Math.min(Math.max(0, progress), 1);
    
    // Determine if we should update based on either:
    // 1. Significant progress change OR
    // 2. Time-based interval for slow-changing scans (minimum 250ms between updates)
    const significantChange = Math.abs(normalizedProgress - lastProgress) >= minChangePercent / 100;
    const timeIntervalMet = timeSinceLastUpdate >= 250;
    
    // Always update when we reach specific milestone percentages (10%, 25%, 50%, 75%, 90%, 99%)
    const isProgressMilestone = 
      [0.1, 0.25, 0.5, 0.75, 0.9, 0.99].some(milestone => 
        Math.abs(normalizedProgress - milestone) < 0.01 && 
        Math.abs(lastProgress - milestone) >= 0.01
      );
    
    // Update progress under any of these conditions
    if (significantChange || timeIntervalMet || isProgressMilestone || normalizedProgress >= 0.995) {
      lastProgress = normalizedProgress;
      lastUpdateTime = currentTime;
      updateProgress(normalizedProgress);
    }
  };
}

// Node selection helpers
export async function selectNodes(nodeIds: string[]) {
  try {
    // Clear current selection
    figma.currentPage.selection = [];
    
    // For single node selection, use direct node selection
    if (nodeIds.length === 1) {
      const node = await figma.getNodeByIdAsync(nodeIds[0]);
      if (node && 'visible' in node) {
        const sceneNode = node as SceneNode;
        
        // Ensure node is visible in viewport
        const nodeRect = {
          x: sceneNode.x,
          y: sceneNode.y,
          width: sceneNode.width,
          height: sceneNode.height
        };

        // Select the node
        figma.currentPage.selection = [sceneNode];
        
        // Zoom to fit the node with some padding
        const padding = 100; // pixels of padding around node
        figma.viewport.scrollAndZoomIntoView([sceneNode]);
        
        // Additional viewport adjustment for better visibility
        const zoom = figma.viewport.zoom;
        figma.viewport.center = {
          x: nodeRect.x + (nodeRect.width / 2),
          y: nodeRect.y + (nodeRect.height / 2)
        };
        
        // Notify UI of successful selection
        figma.ui.postMessage({
          type: 'selection-updated',
          count: 1,
          selectedNodeIds: [sceneNode.id],
          nodeName: sceneNode.name,
          nodeType: sceneNode.type
        });
        
        return;
      } else {
        console.warn('Node not found or not selectable:', nodeIds[0]);
        figma.ui.postMessage({
          type: 'selection-error',
          message: 'Selected node no longer exists or is not selectable'
        });
        return;
      }
    }
    
    // For multiple nodes, use existing group selection logic
    const nodes = await Promise.all(
      nodeIds.map(id => figma.getNodeByIdAsync(id))
    );
    const validNodes = nodes.filter((node): node is SceneNode => 
      node !== null && 'visible' in node
    );

    if (validNodes.length > 0) {
      // Select nodes and scroll into view
      figma.currentPage.selection = validNodes;
      figma.viewport.scrollAndZoomIntoView(validNodes);
      
      // Notify UI of selection
      figma.ui.postMessage({
        type: 'selection-updated',
        count: validNodes.length,
        selectedNodeIds: validNodes.map(node => node.id)
      });
    } else {
      console.warn('No valid nodes found to select');
      figma.ui.postMessage({
        type: 'selection-error',
        message: 'Selected nodes no longer exist in the document'
      });
    }
  } catch (err) {
    console.error('Error selecting nodes:', err);
    figma.ui.postMessage({
      type: 'selection-error',
      message: 'Failed to select nodes'
    });
  }
}

export async function selectNode(nodeId: string) {
  try {
    // Get the node
    const node = await figma.getNodeByIdAsync(nodeId);
    
    if (!node) {
      throw new Error('Node not found');
    }

    // Ensure the node is a SceneNode
    if (!('visible' in node)) {
      throw new Error('Node is not selectable');
    }

    const sceneNode = node as SceneNode;

    // Don't modify visibility, just select the node
    figma.currentPage.selection = [sceneNode];

    // Calculate viewport adjustments
    const zoom = Math.min(2, figma.viewport.zoom * 1.5);
    const bounds = sceneNode.absoluteBoundingBox;
    
    if (!bounds) {
      throw new Error('Cannot determine node bounds');
    }

    // Center on node with padding
    const padding = 100;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    // Set viewport
    figma.viewport.center = { x: centerX, y: centerY };
    figma.viewport.zoom = zoom;

    // Notify UI of successful selection
    figma.ui.postMessage({
      type: 'selection-updated',
      count: 1,
      selectedNodeIds: [sceneNode.id],
      nodeName: sceneNode.name,
      nodeType: sceneNode.type,
      bounds: bounds,
      isVisible: sceneNode.visible
    });

    console.log('Node selected:', {
      id: sceneNode.id,
      name: sceneNode.name,
      type: sceneNode.type,
      bounds: bounds,
      isVisible: sceneNode.visible
    });

  } catch (err) {
    console.error('Error selecting node:', err);
    figma.ui.postMessage({
      type: 'selection-error',
      message: err instanceof Error ? err.message : 'Failed to select node'
    });
  }
}

// Helper to handle group selection
export async function selectNodeGroup(refs: MissingReference[]) {
  try {
    // Filter out invalid nodes first
    const validRefs = await Promise.all(
      refs.map(async ref => {
        const isValid = await isNodeValid(ref.nodeId);
        return isValid ? ref : null;
      })
    );

    const nodeIds = validRefs
      .filter((ref): ref is MissingReference => ref !== null)
      .map(ref => ref.nodeId);

    if (nodeIds.length > 0) {
      await selectNodes(nodeIds);
    } else {
      figma.ui.postMessage({
        type: 'selection-error',
        message: 'No valid nodes found in this group'
      });
    }
  } catch (err) {
    console.error('Error selecting node group:', err);
    figma.ui.postMessage({
      type: 'selection-error',
      message: 'Failed to select node group'
    });
  }
}

/**
 * Group missing references by value for UI display
 * Now with enhanced grouping to handle different reference types
 */
export function groupMissingReferences(missingRefs: MissingReference[]): Record<string, MissingReference[]> {
  const grouped: Record<string, MissingReference[]> = {};
  
  missingRefs.forEach(ref => {
    // First check if the reference has a custom groupKey (for local library variables)
    if (ref.groupKey) {
      // Use the provided groupKey directly
      const key = ref.groupKey;
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(ref);
      return; // Skip the rest of the processing for this reference
    }
    
    // Create a base group key combining value and type
    let baseKey: string;
    
    // Define the category for this reference
    let category = 'unlinked';
    if (ref.isInactiveLibrary) category = 'inactive-library';
    else if (ref.isMissingLibrary) category = 'missing-library';
    
    // Create a unique key based on the type of reference
    if (ref.type === 'typography') {
      const val = ref.currentValue;
      // Format typography-specific key
      baseKey = `typography-${category}-${val.fontFamily}-${val.fontWeight}-${val.fontSize}`;
    } else if (ref.type === 'fill' || ref.type === 'stroke') {
      const val = ref.currentValue;
      // For colors
      if (typeof val === 'object' && 'r' in val) {
        // Raw color value
        baseKey = `${ref.type}-${category}-${Math.round(val.r*255)}-${Math.round(val.g*255)}-${Math.round(val.b*255)}-${val.a || 1}`;
      } else if (val && typeof val === 'object' && 'variableId' in val) {
        // Variable reference
        baseKey = `${ref.type}-${category}-${val.variableId}`;
      } else {
        // Handle other cases
        baseKey = `${ref.type}-${category}-${JSON.stringify(val)}`;
      }
    } else {
      // For all other types (padding, gap, corner radius, etc.)
      baseKey = `${ref.type}-${category}-${ref.property}-${JSON.stringify(ref.currentValue)}`;
    }
    
    // Add the ref to the group
    if (!grouped[baseKey]) {
      grouped[baseKey] = [];
    }
    grouped[baseKey].push(ref);
  });
  
  return grouped;
}

/**
 * Check if a node is a scannable SceneNode type
 * This includes all node types that can have properties scanned (effects, fills, typography, etc.)
 * @param node The node to check
 * @returns True if the node is a scannable type
 */
export function isScannableNodeType(node: BaseNode | null): node is SceneNode {
  if (!node || !('type' in node)) {
    return false;
  }
  
  // Support ALL SceneNode types that can be meaningfully scanned
  return (
    node.type === 'FRAME' || 
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
    node.type === 'CODE_BLOCK'
  );
}

/**
 * Filter an array of nodes to only include scannable types
 * @param nodes Array of nodes to filter
 * @returns Array containing only scannable nodes
 */
export function filterScannableNodes(nodes: readonly BaseNode[]): SceneNode[] {
  return nodes.filter(isScannableNodeType);
} 