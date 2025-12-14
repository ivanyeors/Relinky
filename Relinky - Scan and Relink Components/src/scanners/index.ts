// Scanner modules index file
// Exports all scanner modules for easy importing

// Import common types
import { ScanType, MissingReference, isNodeFromLibraryInstance, prepareLibraryInstanceFiltering } from '../common';

// Import scanner modules
import { scanForRawValues, groupRawValueResults } from './raw-values';
import { scanForBrokenVariableReferences, groupBrokenVariableReferenceResults } from './broken-variable-references';
import { scanForGap, groupGapResults } from './gap';
import { scanForPadding, groupPaddingResults } from './padding';
import { scanForCornerRadius, groupCornerRadiusResults } from './radius';
import { scanForColors, groupColorResults } from './color';
import { scanForTypography, groupTypographyResults } from './typography';
import { scanForLayoutDimensions, groupLayoutResults } from './layout';
import { scanForAppearance, groupAppearanceResults } from './appearance';
import { scanForEffects, groupEffectsResults } from './effects';
import { scanForLinkedLibraryTokens, groupLinkedLibraryResults } from './linked-library';

// Export all scanner functions - use explicit exports for modules with overlapping types
export * from './raw-values';
export * from './gap';
export * from './padding';
export * from './radius';
export * from './color';
export * from './typography';
export * from './layout';
export * from './appearance';
export * from './effects';
export * from './linked-library';

// Explicitly export from deleted-variables (formerly missing-library)
export { 
  scanForBrokenVariableReferences as scanForMissingLibraryVariables, 
  groupBrokenVariableReferenceResults as groupMissingLibraryResults,
  // Also export legacy names for backwards compatibility
  scanForBrokenVariableReferences,
  groupBrokenVariableReferenceResults,
  // Re-export the VariableTypeMetadata interface and VARIABLE_TYPE_CATEGORIES 
  VariableTypeMetadata,
  VARIABLE_TYPE_CATEGORIES
} from './broken-variable-references';

// Cancellation flag for stopping scans
let scanCancelled = false;

/**
 * Check if scan has been cancelled
 * @returns True if scan has been cancelled
 */
export function isScancelled(): boolean {
  return scanCancelled;
}

/**
 * Reset cancellation flag
 */
export function resetCancellation(): void {
  scanCancelled = false;
}

/**
 * Cancel an ongoing scan
 */
export function cancelScan(): void {
  scanCancelled = true;
}

/**
 * Helper function to safely extract fontFamily from a node
 */
export function getFontFamilyFromNode(node: TextNode): string {
  if (!node.fontName) return 'Unknown Font';
  
  // Check if fontName is an object with a family property
  if (typeof node.fontName === 'object' && 'family' in node.fontName) {
    return node.fontName.family;
  }
  
  // Fall back to a default or try to extract information differently
  return node.fontName.toString() || 'Unknown Font';
}

/**
 * Helper function to safely extract fontWeight from a node
 */
export function getFontWeightFromNode(node: TextNode): number {
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

/**
 * Run a scanner based on source type and scan type
 * @param sourceType Source type for the scan
 * @param scanType Specific type of scan to run
 * @param selectedFrameIds IDs of selected frames to scan (empty for entire page)
 * @param progressCallback Function to call with progress updates
 * @param ignoreHiddenLayers Whether to ignore hidden layers
 * @param variableTypes Array of variable types to filter by
 * @returns Array of scan results
 */
export async function runScanner(
  sourceType: string,
  scanType: ScanType,
  selectedFrameIds: string[] = [],
  progressCallback?: (progress: number) => void,
  ignoreHiddenLayers: boolean = false,
  variableTypes: string[] = [],
  skipInstances: boolean = false
): Promise<MissingReference[]> {
  // Reset cancellation flag
  resetCancellation();

  await prepareLibraryInstanceFiltering(skipInstances, { force: true });

  // Default progress callback if none provided
  const progressHandler = progressCallback || ((progress: number) => {
    // No-op if no callback provided
  });

  // Get nodes to scan based on selection
  let nodesToScan: SceneNode[] = [];
  if (selectedFrameIds.length > 0) {
    // Get selected nodes and their children
    const selectedFrames = await Promise.all(
      selectedFrameIds.map(id => figma.getNodeByIdAsync(id))
    );

    // Filter to valid frame types and get all descendants
    const validFrames = selectedFrames
      .filter((node): node is SceneNode =>
        node !== null &&
        // Support ALL SceneNode types that can be meaningfully scanned
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
      );

    // Collect all nodes to scan
    for (const frame of validFrames) {
      // Skip the frame itself if it's an instance and skipInstances is true
      if (!skipInstances || frame.type !== 'INSTANCE') {
        nodesToScan.push(frame);
      }
      
      // Only add descendants if they're visible or we're not ignoring hidden layers
      // Also check if the node has children (container nodes)
      if ((!ignoreHiddenLayers || ('visible' in frame && frame.visible)) &&
          ('children' in frame)) {
        nodesToScan = [...nodesToScan, ...frame.findAll((node: SceneNode) => {
          // Filter out hidden nodes if ignoreHiddenLayers is true
          const isVisible = !ignoreHiddenLayers || ('visible' in node && node.visible);
          // Filter out instances if skipInstances is true
          const isNotInstance = !skipInstances || node.type !== 'INSTANCE';
          return isVisible && isNotInstance;
        })];
      }
    }
  } else {
    // Scan entire page
    nodesToScan = figma.currentPage.findAll(node => {
      // Filter out hidden nodes if ignoreHiddenLayers is true
      const isVisible = !ignoreHiddenLayers || ('visible' in node && node.visible);
      // Filter out instances if skipInstances is true
      const isNotInstance = !skipInstances || node.type !== 'INSTANCE';
      return isVisible && isNotInstance;
    });
  }

  if (skipInstances) {
    nodesToScan = nodesToScan.filter(node => !isNodeFromLibraryInstance(node));
  }

  console.log(`Using scanner: ${sourceType} - ${scanType} on ${nodesToScan.length} nodes`);

  // Run the appropriate scanner based on source type and scan type
  switch (sourceType) {
    case 'raw-values':
      switch (scanType) {
        case 'gap':
          return scanForGap('gap', selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
        case 'horizontal-padding':
        case 'vertical-padding':
          return scanForPadding(scanType, selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
        case 'corner-radius':
          return scanForCornerRadius('corner-radius', selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
        case 'fill':
        case 'stroke':
          return scanForColors(scanType, selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
        case 'typography':
          return scanForTypography('typography', selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
        case 'layout':
          return scanForLayoutDimensions(progressHandler, nodesToScan, ignoreHiddenLayers, variableTypes, skipInstances);
        case 'opacity':
          return scanForAppearance('opacity', selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
        case 'effects':
          return scanForEffects('effects', selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
        default:
          return scanForRawValues(scanType, selectedFrameIds, progressHandler, ignoreHiddenLayers, skipInstances);
      }
    case 'missing-library':
      return scanForBrokenVariableReferences(progressHandler, selectedFrameIds, ignoreHiddenLayers, variableTypes, skipInstances)
        .then(result => result.results);
    case 'deleted-variables':
      return scanForBrokenVariableReferences(progressHandler, selectedFrameIds, ignoreHiddenLayers, variableTypes, skipInstances)
        .then(result => result.results);
    case 'linked-library':
      return scanForLinkedLibraryTokens(progressHandler, selectedFrameIds, ignoreHiddenLayers, skipInstances);
    default:
      console.error(`Unknown scanner source type: ${sourceType}`);
      return [];
  }
}

/**
 * Group scan results based on source type
 * @param sourceType Source type for the scan
 * @param results Scan results to group
 * @returns Grouped results
 */
export function groupScanResults(
  sourceType: string,
  results: MissingReference[]
): Record<string, MissingReference[]> {
  // For empty results, return empty object
  if (!results || results.length === 0) {
    return {};
  }
  
  switch (sourceType) {
    case 'raw-values':
      if (results.some(ref => ref.type === 'gap')) {
        // Type assertion to handle the specific return type
        return groupGapResults(results as any);
      } else if (results.some(ref => ref.type === 'horizontal-padding' || ref.type === 'vertical-padding')) {
        return groupPaddingResults(results as any);
      } else if (results.some(ref => ref.type === 'corner-radius')) {
        return groupCornerRadiusResults(results as any);
      } else if (results.some(ref => ref.type === 'fill' || ref.type === 'stroke' || ref.type === 'color')) {
        return groupColorResults(results);
      } else if (results.some(ref => ref.type === 'typography')) {
        return groupTypographyResults(results);
      } else if (results.some(ref => ref.type === 'layout')) {
        return groupLayoutResults(results);
      } else if (results.some(ref => ref.type === 'opacity')) {
        return groupAppearanceResults(results as any);
      } else if (results.some(ref => ref.type === 'effects')) {
        return groupEffectsResults(results as any);
      } else {
        return groupRawValueResults(results);
      }
    case 'missing-library':
      return groupBrokenVariableReferenceResults(results as any);
    case 'deleted-variables':
      return groupBrokenVariableReferenceResults(results as any);
    case 'linked-library':
      return groupLinkedLibraryResults(results);
    default:
      console.error(`Unknown group source type: ${sourceType}`);
      return {};
  }
}

/**
 * Debug document variables
 * 
 * @param progressCallback - Callback function for progress updates
 * @returns Promise<void>
 */
export async function debugDocumentVariables(
  progressCallback: (progress: number) => void = () => {}
): Promise<void> {
  console.log('Debugging document variables...');
  
  try {
    // Log document statistics
    console.log(`------ Document Variables Debug ------`);
    console.log(`Document: ${figma.root.name}`);
    console.log(`Current page: ${figma.currentPage.name}`);
    
    // Get all local variables
    const localVariables = await figma.variables.getLocalVariablesAsync();
    console.log(`Found ${localVariables.length} local variables`);
    
    // Get all local variable collections
    const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    console.log(`Found ${localCollections.length} local variable collections`);
    
    // Log collection details
    localCollections.forEach((collection, index) => {
      progressCallback((index / localCollections.length) * 0.5); // First half of progress
      
      console.log(`\nCollection: ${collection.name}`);
      console.log(`- ID: ${collection.id}`);
      console.log(`- Remote: ${collection.remote}`);
      console.log(`- Modes: ${collection.modes.map(m => m.name).join(', ')}`);
      
      // Find variables in this collection
      const collectionVars = localVariables.filter(v => v.variableCollectionId === collection.id);
      console.log(`- Variables: ${collectionVars.length}`);
      
      // Log first 5 variables in the collection
      collectionVars.slice(0, 5).forEach(variable => {
        console.log(`  - ${variable.name} (${variable.resolvedType}): ${variable.id}`);
      });
    });
    
    // Log bound variables on the current page
    let nodesWithVars = 0;
    let boundVarCount = 0;
    
    // Helper function to count variables
    function countBoundVariables(node: SceneNode) {
      if ('boundVariables' in node && node.boundVariables) {
        const varCount = Object.keys(node.boundVariables).length;
        if (varCount > 0) {
          nodesWithVars++;
          boundVarCount += varCount;
        }
      }
      
      if ('children' in node) {
        node.children.forEach(child => {
          countBoundVariables(child as SceneNode);
        });
      }
    }
    
    // Count variables on current page
    figma.currentPage.children.forEach((node, index) => {
      progressCallback(0.5 + (index / figma.currentPage.children.length) * 0.5); // Second half of progress
      countBoundVariables(node);
    });
    
    console.log(`\nOn current page "${figma.currentPage.name}":`);
    console.log(`- Nodes with bound variables: ${nodesWithVars}`);
    console.log(`- Total bound variables: ${boundVarCount}`);
    
    console.log(`\n------ End Debug ------`);
    
    // Set progress to 100%
    progressCallback(1);
  } catch (error) {
    console.error('Error debugging document variables:', error);
  }
} 