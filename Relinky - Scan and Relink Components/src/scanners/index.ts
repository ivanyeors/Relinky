// Scanner modules index file
// Exports all scanner modules for easy importing

// Import common types
import { ScanType, MissingReference } from '../common';

// Import scanner modules
import { scanForRawValues, groupRawValueResults } from './raw-values';
import { scanForTeamLibraryVariables, groupTeamLibraryResults } from './team-library';
import { scanForLocalLibraryVariables, groupLocalLibraryResults } from './local-library';
import { scanForMissingLibraryVariables, groupMissingLibraryResults } from './missing-library';
import { scanForGap, groupGapResults } from './gap';
import { scanForPadding, groupPaddingResults } from './padding';
import { scanForCornerRadius, groupCornerRadiusResults } from './radius';
import { scanForColors, groupColorResults } from './color';
import { scanForTypography, groupTypographyResults } from './typography';

// Export all scanner functions
export * from './raw-values';
export * from './team-library';
export * from './local-library';
export * from './missing-library';
export * from './gap';
export * from './padding';
export * from './radius';
export * from './color';
export * from './typography';

// Scan cancellation flag
let isScanCancelled = false;

/**
 * Cancel any ongoing scan by setting the cancellation flag
 */
export function cancelScan(): void {
  isScanCancelled = true;
  console.log('Scan cancelled');
}

/**
 * Check if scan is cancelled
 */
export function isScancelled(): boolean {
  return isScanCancelled;
}

/**
 * Reset cancellation flag (called before starting a new scan)
 */
export function resetCancellation(): void {
  isScanCancelled = false;
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
 * Run the appropriate scanner based on the source type and scan type
 * 
 * @param sourceType - The type of scanner to run
 * @param scanType - The type of scan to perform
 * @param selectedFrameIds - Array of frame IDs to scan
 * @param progressCallback - Callback for scan progress
 * @param ignoreHiddenLayers - Whether to ignore hidden layers
 * @param variableTypes - Array of variable types to filter by (optional)
 * @returns Promise<MissingReference[]> - Scan results
 */
export async function runScanner(
  sourceType: 'raw-values' | 'team-library' | 'local-library' | 'missing-library',
  scanType: ScanType,
  selectedFrameIds: string[] = [],
  progressCallback: (progress: number) => void = () => {},
  ignoreHiddenLayers: boolean = false,
  variableTypes: string[] = []
): Promise<MissingReference[]> {
  console.log(`Running ${sourceType} scanner with scan type ${scanType}`);
  
  // Reset cancellation flag before starting new scan
  resetCancellation();
  
  // Handle different source types
  switch (sourceType) {
    case 'raw-values':
      // For raw values, we need to select the appropriate specialized scanner based on scanType
      switch (scanType) {
        case 'gap':
          return scanForGap(scanType, selectedFrameIds, progressCallback, ignoreHiddenLayers);
        
        case 'horizontal-padding':
        case 'vertical-padding':
          return scanForPadding(scanType, selectedFrameIds, progressCallback, ignoreHiddenLayers);
        
        case 'corner-radius':
          return scanForCornerRadius(scanType, selectedFrameIds, progressCallback, ignoreHiddenLayers);
        
        case 'fill':
        case 'stroke':
          return scanForColors(scanType, selectedFrameIds, progressCallback, ignoreHiddenLayers);
        
        case 'typography':
          return scanForTypography(scanType, selectedFrameIds, progressCallback, ignoreHiddenLayers);
        
        default:
          // Default to raw values scanner
          return scanForRawValues(scanType, selectedFrameIds, progressCallback, ignoreHiddenLayers);
      }
    
    case 'team-library':
      return scanForTeamLibraryVariables(progressCallback, selectedFrameIds, ignoreHiddenLayers);
    
    case 'local-library':
      return scanForLocalLibraryVariables(progressCallback, selectedFrameIds, ignoreHiddenLayers);
    
    case 'missing-library':
      // Pass the variableTypes to the missing library scanner
      const missingLibResult = await scanForMissingLibraryVariables(progressCallback, selectedFrameIds, ignoreHiddenLayers, variableTypes);
      return missingLibResult.results;
    
    default:
      console.error(`Unknown scanner type: ${sourceType}`);
      return [];
  }
}

/**
 * Group scan results based on the source type and scan type
 * 
 * @param sourceType - The type of scanner that produced the results
 * @param results - Array of scan results to group
 * @returns Record<string, MissingReference[]> - Grouped results
 */
export function groupScanResults(
  sourceType: 'raw-values' | 'team-library' | 'local-library' | 'missing-library',
  results: MissingReference[]
): Record<string, MissingReference[]> {
  console.log(`Grouping ${results.length} results from ${sourceType} scanner`);
  
  // First check if results array is empty
  if (results.length === 0) {
    return {};
  }
  
  // Get the scan type from the first result
  const firstResult = results[0];
  const scanType = firstResult.type || '';
  
  // Handle different source types
  switch (sourceType) {
    case 'raw-values':
      // Group by specific scan type
      switch (scanType) {
        case 'gap':
        case 'verticalGap':
        case 'horizontalGap':
          return groupGapResults(results as any);
        
        case 'horizontalPadding':
        case 'verticalPadding':
          return groupPaddingResults(results);
        
        case 'cornerRadius':
          return groupCornerRadiusResults(results);
        
        case 'fill':
        case 'stroke':
          return groupColorResults(results);
        
        case 'typography':
          return groupTypographyResults(results);
        
        default:
          // Default to raw values grouping
          return groupRawValueResults(results);
      }
    
    case 'team-library':
      return groupTeamLibraryResults(results);
    
    case 'local-library':
      return groupLocalLibraryResults(results);
    
    case 'missing-library':
      return groupMissingLibraryResults(results);
    
    default:
      console.error(`Unknown scanner type for grouping: ${sourceType}`);
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