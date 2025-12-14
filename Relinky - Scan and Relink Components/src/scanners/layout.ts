// Layout Scanner Module
// Handles scanning for width and height dimensions in layouts

import { MissingReference, ScanType, isNodeFromLibraryInstance, prepareLibraryInstanceFiltering } from '../common';
import { isScancelled } from './index';

// Extend MissingReference for layout-specific properties
interface LayoutReference extends MissingReference {
  dimensionType: 'width' | 'height';
  layoutSizingMode?: 'fixed' | 'fill' | 'hug';
}

/**
 * Scans for common width and height values in layouts
 * @param progressCallback Function to report scan progress
 * @param nodesToScan Optional array of nodes to scan, otherwise scans current page
 * @param ignoreHiddenLayers Whether to skip hidden layers
 * @param filterTypes Optional array of variable types to filter by
 * @returns Array of references to layout dimensions
 */
export async function scanForLayoutDimensions(
  progressCallback: (progress: number) => void,
  nodesToScan?: SceneNode[],
  ignoreHiddenLayers: boolean = false,
  filterTypes: string[] = [],
  skipInstances: boolean = false
): Promise<MissingReference[]> {
  const results: LayoutReference[] = [];
  
  try {
    await prepareLibraryInstanceFiltering(skipInstances);

    // Filter nodes that have width and height properties
    const nodes = (nodesToScan || figma.currentPage.findAll())
      .filter(node => {
        // Skip removed nodes
        if (!node || node.removed) return false;
        
        if (skipInstances && isNodeFromLibraryInstance(node)) return false;

        // Skip invisible nodes if ignoreHiddenLayers is true
        if (ignoreHiddenLayers && 'visible' in node && !node.visible) return false;
        
        // Only include nodes with width and height
        return 'width' in node && 'height' in node;
      });

    if (nodes.length === 0) {
      console.log('No eligible nodes to scan for layout dimensions after applying filters.');
      progressCallback(100);
      return results;
    }
    
    console.log(`Found ${nodes.length} nodes to scan for layout dimensions`);
    
    const totalNodes = nodes.length;
    let processedNodes = 0;

    for (let i = 0; i < nodes.length; i++) {
      if (isScancelled()) break;
      
      const node = nodes[i] as SceneNode & { width: number, height: number };
      
      try {
        // Get node path for better context
        const nodePath = node.parent ? 
          `${node.parent.name} › ${node.name}` : 
          node.name;
        
        // Check if width or height is already bound to a variable
        const boundVars = ('boundVariables' in node) ? 
          (node as any).boundVariables || {} : 
          {};
        
        // Determine layout sizing mode for width
        let widthSizingMode: 'fixed' | 'fill' | 'hug' = 'fixed';
        if ('layoutSizingHorizontal' in node) {
          if ((node as any).layoutSizingHorizontal === 'FILL') {
            widthSizingMode = 'fill';
          } else if ((node as any).layoutSizingHorizontal === 'HUG') {
            widthSizingMode = 'hug';
          }
        }
        
        // Determine layout sizing mode for height
        let heightSizingMode: 'fixed' | 'fill' | 'hug' = 'fixed';
        if ('layoutSizingVertical' in node) {
          if ((node as any).layoutSizingVertical === 'FILL') {
            heightSizingMode = 'fill';
          } else if ((node as any).layoutSizingVertical === 'HUG') {
            heightSizingMode = 'hug';
          }
        }
        
        // Check width dimension
        if (!boundVars.width && node.width > 0) {
          // Create a reference with dimension type 'width'
          results.push({
            nodeId: node.id,
            nodeName: node.name || 'Unnamed Node',
            type: 'layout',
            property: 'width',
            currentValue: node.width,
            location: 'Width Value',
            isUnlinked: true,
            parentNodeId: node.parent?.id,
            path: nodePath,
            dimensionType: 'width',
            layoutSizingMode: widthSizingMode,
            isVisible: 'visible' in node ? node.visible : true
          });
        }
        
        // Check height dimension
        if (!boundVars.height && node.height > 0) {
          // Create a reference with dimension type 'height'
          results.push({
            nodeId: node.id,
            nodeName: node.name || 'Unnamed Node',
            type: 'layout',
            property: 'height',
            currentValue: node.height,
            location: 'Height Value',
            isUnlinked: true,
            parentNodeId: node.parent?.id,
            path: nodePath,
            dimensionType: 'height',
            layoutSizingMode: heightSizingMode,
            isVisible: 'visible' in node ? node.visible : true
          });
        }
      } catch (err) {
        console.warn(`Error processing node ${node.name}:`, err);
      }

      // Update progress
      processedNodes++;
      const progress = Math.round((processedNodes / totalNodes) * 100);
      progressCallback(progress);

      // Add a small delay every few nodes to prevent UI freezing
      if (processedNodes % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Log results
    console.log(`Layout scan complete, found ${results.length} layout dimensions`);
    
    return results;
  } catch (err) {
    console.error('Error scanning for layout dimensions:', err);
    return [];
  }
}

/**
 * Groups layout dimension references for display
 * @param references Array of layout dimension references
 * @returns Grouped references by dimension value and type
 */
export function groupLayoutResults(references: MissingReference[]): Record<string, MissingReference[]> {
  const grouped: Record<string, MissingReference[]> = {};
  
  // Filter to just layout references
  const layoutRefs = references.filter(ref => ref.type === 'layout');
  
  for (const ref of layoutRefs) {
    // Create a key based on the dimension type and value
    const dimensionType = ref.dimensionType || 'unknown';
    const value = ref.currentValue;
    const key = `layout-${dimensionType}-${value}`;
    
    // Add to group
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(ref);
  }
  
  return grouped;
}

/**
 * Filter layout references by dimension type (width/height)
 * @param references Array of layout references to filter
 * @param dimensionType Type of dimension to filter by ('width' or 'height')
 * @returns Filtered array of references
 */
export function filterLayoutByDimensionType(
  references: MissingReference[],
  dimensionType: 'width' | 'height'
): MissingReference[] {
  return references.filter(ref => 
    ref.type === 'layout' && 
    ref.dimensionType === dimensionType
  );
}

/**
 * Filter layout references by sizing mode (fixed, fill, hug)
 * @param references Array of layout references to filter
 * @param sizingMode The sizing mode to filter by
 * @returns Filtered array of references
 */
export function filterLayoutBySizingMode(
  references: MissingReference[],
  sizingMode: 'fixed' | 'fill' | 'hug'
): MissingReference[] {
  return references.filter(ref => 
    ref.type === 'layout' && 
    (ref as LayoutReference).layoutSizingMode === sizingMode
  );
}

/**
 * Apply multiple layout filters to references
 * @param references Array of layout references to filter
 * @param filters Object containing filter criteria
 * @returns Filtered array of references
 */
export function filterLayoutReferences(
  references: MissingReference[],
  filters: {
    dimensionType?: 'width' | 'height';
    sizingMode?: 'fixed' | 'fill' | 'hug';
  }
): MissingReference[] {
  // Start with all layout references
  let filtered = references.filter(ref => ref.type === 'layout');
  
  // Apply dimension type filter if specified
  if (filters.dimensionType) {
    filtered = filtered.filter(ref => ref.dimensionType === filters.dimensionType);
  }
  
  // Apply sizing mode filter if specified
  if (filters.sizingMode) {
    filtered = filtered.filter(ref => 
      (ref as LayoutReference).layoutSizingMode === filters.sizingMode
    );
  }
  
  return filtered;
}

/**
 * Gets all unique dimension values from layout references
 * @param references Array of layout references
 * @returns Record with counts of different dimension types and sizing modes
 */
export function getLayoutReferenceStats(
  references: MissingReference[]
): {
  totalCount: number;
  widthCount: number;
  heightCount: number;
  fixedCount: number;
  fillCount: number;
  hugCount: number;
} {
  // Start with all layout references
  const layoutRefs = references.filter(ref => ref.type === 'layout') as LayoutReference[];
  
  // Count different types
  const stats = {
    totalCount: layoutRefs.length,
    widthCount: 0,
    heightCount: 0,
    fixedCount: 0,
    fillCount: 0,
    hugCount: 0
  };
  
  // Count dimension types
  layoutRefs.forEach(ref => {
    // Count dimension types
    if (ref.dimensionType === 'width') {
      stats.widthCount++;
    } else if (ref.dimensionType === 'height') {
      stats.heightCount++;
    }
    
    // Count sizing modes
    switch (ref.layoutSizingMode) {
      case 'fixed':
        stats.fixedCount++;
        break;
      case 'fill':
        stats.fillCount++;
        break;
      case 'hug':
        stats.hugCount++;
        break;
    }
  });
  
  return stats;
} 