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
  preview?: string;
  isInactiveLibrary?: boolean;
  isUnlinked?: boolean;
  parentNodeId?: string;  // Add parent node ID for context
  path?: string;          // Add node path for better location info
  isVisible: boolean;     // Whether the node is visible
}

// Update ScanType to include all scan types
export type ScanType = 'inactive-tokens' | 'vertical-gap' | 'horizontal-padding' | 'vertical-padding' | 'corner-radius' | 'fill' | 'stroke' | 'typography';

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
  scanEntirePage?: boolean;
  isRescan?: boolean;
  ignoreHiddenLayers?: boolean;
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
export function hasVariableBindings(node: BaseNode): node is SceneNode & { 
  boundVariables: { 
    [key: string]: {
      type: 'VARIABLE';
      id: string;
      value?: any;
    } 
  } 
} {
  return 'boundVariables' in node;
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
export function formatTypographyValue(value: any): string {
  if (!value || typeof value !== 'object') return 'Unknown';
  
  const {
    fontFamily = '',
    fontWeight = '',
    fontSize = ''
  } = value;

  return `${fontFamily} ${fontWeight} ${fontSize}px`;
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

// Helper to group missing references by type and value
export function groupMissingReferences(missingRefs: MissingReference[]): Record<string, MissingReference[]> {
  return missingRefs.reduce((groups, ref) => {
    // Create a unique key combining property and value
    const key = `${ref.property}:${JSON.stringify(ref.currentValue)}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(ref);
    return groups;
  }, {} as Record<string, MissingReference[]>);
}

// Progress tracking helpers
export function updateProgress(progress: number) {
  figma.ui.postMessage({
    type: 'scan-progress',
    progress: Math.max(0, Math.min(100, progress)),
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