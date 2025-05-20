// Import the CSS file so webpack can process it
import './styles.css';

// Import the icons from icons.js
import { icons } from './icons.js';

// Wait for DOM content to be loaded
document.addEventListener('DOMContentLoaded', () => {
  // Show loading indicator initially
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = 'flex';
  }

  // Initialize the application
  initializeApp();
  initResizeHandle();
});

function initializeApp() {
  const { createApp } = Vue;
  
  // Add the SuccessToast component definition
  const SuccessToast = {
    template: '#success-toast',
    props: {
      message: String,
      show: Boolean
    },
    methods: {
      close() {
        this.$emit('close');
      }
    }
  };

  // Create new icon components that use the imported SVGs
  const Icon = {
    props: {
      name: {
        type: String,
        required: true
      }
    },
    template: `
      <div class="icon" v-html="getIcon"></div>
    `,
    computed: {
      getIcon() {
        const icon = this.$root.icons[this.name];
        console.log('Loading icon:', this.name, icon ? 'found' : 'not found');
        console.log('Icon content:', icon);
        return icon;
      }
    }
  };

  createApp({
    components: {
      Icon,
      SuccessToast,
      ColorPreview: {
        template: '#color-preview',
        props: {
          color: {
            type: Object,
            required: true
          }
        },
        methods: {
          formatColorToHex({ r, g, b }) {
            const toHex = (n) => {
              const hex = Math.round(n * 255).toString(16);
              return hex.length === 1 ? '0' + hex : hex;
            };
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
          },
          // Add a helper function to normalize color values for the color-preview component
          normalizeColorValue(colorValue) {
            // Handle missing or null values
            if (!colorValue) {
              return { r: 0, g: 0, b: 0, a: 1 };
            }
            
            // If already in the right format, return as is
            if (typeof colorValue === 'object' && 'r' in colorValue && 'g' in colorValue && 'b' in colorValue) {
              return {
                r: parseFloat(colorValue.r) || 0,
                g: parseFloat(colorValue.g) || 0,
                b: parseFloat(colorValue.b) || 0,
                a: parseFloat(colorValue.a !== undefined ? colorValue.a : 1)
              };
            }
            
            // Try to parse HEX values
            if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
              let hex = colorValue.substring(1);
              // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
              if (hex.length === 3) {
                hex = hex.split('').map(x => x + x).join('');
              }
              
              // Parse the hex values
              const r = parseInt(hex.substring(0, 2), 16) / 255;
              const g = parseInt(hex.substring(2, 4), 16) / 255;
              const b = parseInt(hex.substring(4, 6), 16) / 255;
              const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
              
              return { r, g, b, a };
            }
            
            // Default fallback for unknown formats
            return { r: 0, g: 0, b: 0, a: 1 };
          },
        }
      }
    },
    data() {
      return {
        // Make icons available to all templates
        icons,
        // UI state
        isScanning: false,
        scanComplete: false,
        scanProgress: 0,
        showSuccessToast: false,
        successMessage: '',
        showErrorToast: false,
        errorMessage: '',
        activeTab: 'tokens',
        // Basic plugin state
        selectedScanType: null, // Currently selected token scan type
        selectedSourceType: 'raw-values', // Source type for scanning (raw, team-library, local-library)
        selectedFrameIds: [], // List of selected frame IDs, empty means scan entire page
        // Results state
        groupedReferences: {}, // Grouped scan results
        expandedGroups: new Set(), // Groups currently expanded
        scanType: null, // Type of scan that produced the results
        isTokenScan: false, // Whether the scan was for tokens
        isLibraryVariableScan: false, // Whether the scan was for library variables
        ignoreHiddenLayers: false, // Whether to ignore hidden layers when scanning
        // Library token state
        hasLibraryResults: false,
        activeLibraryTokens: [],
        inactiveLibraryTokens: [],
        linkedVariables: [],
        variableFilters: {
          type: 'all',
          collection: 'all',
          search: '',
          libraryType: 'all'
        },
        isVariableScanning: false,
        variableScanComplete: false,
        variableScanProgress: 0,
        selectedVariable: null,
        selectedVariableScanTypes: ['all'],
        selectedVariableTypes: [], // Legacy array for backward compatibility
        selectedVariableTypeFilter: 'all', // New single selection variable type filter
        availableVariableTypes: [], // Array to store available variable types from scan results
        // Add a flag to control visibility of variable filters
        showVariableTypeFilters: false,
        // Filter type for padding (all, top, bottom, left, right)
        paddingFilterType: 'all',
        // Filter type for corner radius (all, top-left, top-right, bottom-left, bottom-right)
        radiusFilterType: 'all',
        // Filter type for gap (all, vertical, horizontal)
        gapFilterType: 'all',
        // Filter type for layout (all, width, height, fill, hug)
        layoutFilterType: 'all',
        // Filter type for effects (all, x, y, blur, spread, color)
        effectsFilterType: 'all',
        tokenScanOptions: [
          {
            value: 'typography',
            label: 'Typography',
            description: 'Find text layers missing text style variables',
            icon: 'typography'
          },
          {
            value: 'gap',
            label: 'Gap',
            description: 'Find frames with unlinked gaps in auto-layouts',
            icon: 'spacing'
          },
          {
            value: 'horizontal-padding',
            label: 'Horizontal Padding',
            description: 'Find frames with unlinked horizontal padding',
            icon: 'horizontal-padding'
          },
          {
            value: 'vertical-padding',
            label: 'Vertical Padding',
            description: 'Find frames with unlinked vertical padding',
            icon: 'vertical-padding'
          },
          {
            value: 'corner-radius',
            label: 'Corner Radius',
            description: 'Find shapes with unlinked corner radius',
            icon: 'radius'
          },
          {
            value: 'fill',
            label: 'Fill Colors',
            description: 'Find layers with unlinked fill colors',
            icon: 'fill'
          },
          {
            value: 'stroke',
            label: 'Stroke Colors',
            description: 'Find layers with unlinked stroke colors',
            icon: 'stroke'
          },
          {
            value: 'layout',
            label: 'Layout Dimensions',
            description: 'Find common width and height values in layouts',
            icon: 'layout'
          },
          {
            value: 'opacity',
            label: 'Appearance',
            description: 'Find layers with unlinked element opacity values',
            icon: 'opacity'
          },
          {
            value: 'effects',
            label: 'Effects',
            description: 'Find layers with unlinked effect properties (shadows, blur, etc.)',
            icon: 'effects'
          },
          {
            value: 'team-library',
            label: 'Team Library Variables',
            description: 'Find all elements using team library variables',
            icon: 'library'
          },
          {
            value: 'local-library',
            label: 'Local Library Variables',
            description: 'Find all elements using local document variables',
            icon: 'local'
          },
          {
            value: 'missing-library',
            label: 'Missing Library Variables',
            description: 'Find all elements using variables from missing libraries',
            icon: 'missing'
          }
        ],
        showSettings: false,
        windowSize: {
          width: 400,
          height: 600
        },
        isResizing: false,
        selectedLibraryTokenScanType: 'all', // Default to 'all' instead of empty
        isLibraryScanning: false,
        libraryScanProgress: 0,
        hasLibraryResults: false,
        isPaused: false,
        currentScanNode: null,
        scanSummary: null,
        variableCollections: [],
        lastScannedType: null, // Add this to track the last scan type
        showHiddenOnly: false,
        variables: [],
        variableTypeOptions: [
          { value: 'color', label: 'Colors' },
          { value: 'typography', label: 'Typography' },
          { value: 'spacing', label: 'Spacing' },
          { value: 'radius', label: 'Corner Radius' },
          { value: 'effect', label: 'Effects' },
          { value: 'layout', label: 'Layout' },
          { value: 'opacity', label: 'Opacity' }
        ],
        isLoadingVariables: false,
        selectedVariableId: null,
        variableScanOptions: [
          {
            value: 'all',
            label: 'All Variables',
            description: 'Scan for all variable types',
            icon: 'variable'
          },
          {
            value: 'color',
            label: 'Color Variables',
            description: 'Scan for color variables',
            icon: 'fill'
          },
          {
            value: 'boolean',
            label: 'Boolean Variables',
            description: 'Scan for boolean variables',
            icon: 'toggle'
          },
          {
            value: 'number',
            label: 'Number Variables',
            description: 'Scan for number variables',
            icon: 'spacing'
          },
          {
            value: 'string',
            label: 'String Variables',
            description: 'Scan for string variables',
            icon: 'typography'
          }
        ],
        selectedVariableScanTypes: ['all'],
        isVariableScanning: false,
        variableScanProgress: 0,
        linkedVariables: [],
        showVariableScanResults: false,
        showRescanVariablesButton: false,
        hasProcessedResults: false,
        selectedVariableTypes: [], // Array to store selected variable types for filtering
        variableTypeOptions: [
          { value: 'color', label: 'Colors' },
          { value: 'typography', label: 'Typography' },
          { value: 'spacing', label: 'Spacing' },
          { value: 'radius', label: 'Corner Radius' },
          { value: 'effect', label: 'Effects' },
          { value: 'layout', label: 'Layout' },
          { value: 'opacity', label: 'Opacity' }
        ],
      }
    },
    computed: {
      scanScope() {
        return this.scanEntirePage ? 'entire-page' : 'selected-frames';
      },
      canStartScan() {
        const hasSourceType = !!this.selectedSourceType;
        const hasScanType = !!this.selectedScanType;
        const isMissingLibrary = this.selectedSourceType === 'missing-library';
        
        console.log('Can start scan?', {
          hasSourceType,
          hasScanType,
          isMissingLibrary,
          isScanning: this.isScanning
        });
        
        // Special case for missing-library: allow scanning without selecting a scan type
        if (isMissingLibrary) {
          return hasSourceType && !this.isScanning;
        }
        
        // For other scan types, require both source type and scan type
        return hasSourceType && hasScanType && !this.isScanning;
      },
      hasResults() {
        const hasRefs = Object.keys(this.groupedReferences).length > 0;
        
        // Ensure we properly count missing library results
        // (the console shows missing library variables but the UI says "no issues found")
        const hasMissingLibraryRefs = this.scanType === 'missing-library' && 
          ((this.selectedSourceType === 'missing-library' && Object.keys(this.groupedReferences).length > 0) || 
           (this.libraryResults && this.libraryResults.missing && this.libraryResults.missing.length > 0));
        
        console.log('Has results?', {
          groupedReferences: this.groupedReferences,
          count: Object.keys(this.groupedReferences).length,
          hasMissingLibraryRefs,
          hasRefs: hasRefs || hasMissingLibraryRefs,
          scanType: this.scanType,
          selectedSourceType: this.selectedSourceType
        });
        
        return hasRefs || hasMissingLibraryRefs;
      },
      groupedByValue() {
        const valueGroups = {};
        
        Object.entries(this.groupedReferences).forEach(([key, refs]) => {
          try {
            // Filter out references from inactive libraries
            const filteredRefs = refs.filter(ref => !ref.isInactiveLibrary);
            
            // Skip if no references left after filtering
            if (filteredRefs.length === 0) return;
            
            // Split the key safely
            const [property, ...valueParts] = key.split(':');
            const valueStr = valueParts.join(':'); // Rejoin in case value contains colons
            
            // Parse the value safely
            let value;
            try {
              value = JSON.parse(valueStr);
            } catch {
              value = valueStr; // Use raw string if parsing fails
            }
            
            const groupKey = typeof value === 'object' ? JSON.stringify(value) : String(value);
            
            if (!valueGroups[groupKey]) {
              valueGroups[groupKey] = {
                value,
                properties: new Set(),
                refs: []
              };
            }
            
            valueGroups[groupKey].properties.add(property);
            valueGroups[groupKey].refs.push(...filteredRefs);
          } catch (err) {
            console.warn('Error processing group:', key, err);
          }
        });
        
        return valueGroups;
      },
      watchButtonTitle() {
        if (!this.scanEntirePage) {
          return 'Enable "Scan Entire Page" to use watch mode';
        }
        return this.isWatching ? 'Stop watching for changes' : 'Watch for changes';
      },
      canWatch() {
        return this.scanEntirePage;
      },
      showScanResults() {
        // Original logic
        const shouldShow = !this.isScanning && this.hasResults && this.scanComplete;
        
        // Override to debug - show results if there are any grouped references
        const hasGroupedRefs = this.groupedReferences && 
                              Object.keys(this.groupedReferences).length > 0;
        
        // Also check if there are any filtered results
        const hasFilteredResults = Object.keys(this.filteredResults || {}).length > 0;
        
        // Special check for missing library variables
        const hasMissingLibraryResults = 
          this.scanType === 'missing-library' && 
          this.libraryResults && 
          this.libraryResults.missing && 
          this.libraryResults.missing.length > 0;
        
        // Temporarily force show if we have any results
        const forceShow = hasGroupedRefs || hasFilteredResults || hasMissingLibraryResults;
        
        console.log('Show scan results?', {
          isScanning: this.isScanning,
          hasResults: this.hasResults,
          scanComplete: this.scanComplete,
          shouldShow,
          hasGroupedRefs,
          hasFilteredResults,
          hasMissingLibraryResults,
          forceShow,
          filteredResultsCount: Object.keys(this.filteredResults || {}).length,
          activeTab: this.activeTab,
          scanType: this.scanType
        });
        
        // Force show results if there are any, bypassing other conditions
        return forceShow;
      },
      showStopButton() {
        return this.isScanning && !this.scanComplete;
      },
      showRescanButton() {
        // Only show rescan if we have results AND the scan type hasn't changed
        return this.hasResults && this.selectedScanType === this.lastScannedType;
      },
      filteredResults() {
        console.log('Computing filteredResults with groupedReferences:', {
          hasGroupedReferences: !!this.groupedReferences,
          groupCount: this.groupedReferences ? Object.keys(this.groupedReferences).length : 0
        });
        
        // If no grouped references, return empty object
        if (!this.groupedReferences || typeof this.groupedReferences !== 'object') {
          console.log('No valid groupedReferences, returning empty object');
          return {};
        }
        
        // Log the actual data to help debug
        for (const [key, group] of Object.entries(this.groupedReferences)) {
          console.log(`Group ${key}:`, {
            hasRefs: group && group.refs ? true : false,
            refCount: group && group.refs ? group.refs.length : 0,
            firstRef: group && group.refs && group.refs.length > 0 ? group.refs[0] : null
          });
        }
        
        // Make a deep copy with all nested properties
        const result = {};
        for (const [key, group] of Object.entries(this.groupedReferences)) {
          if (group && (group.refs || Array.isArray(group))) {
            // Handle both formats (object with refs array or direct array)
            let refs = group.refs || group;
            
            // Only include group if it has valid references
            if (Array.isArray(refs) && refs.length > 0) {
              // Check if we should filter by variable type
              const shouldFilterByType = this.scanType === 'missing-library' && 
                                        this.selectedVariableTypeFilter !== 'all';
              
              if (shouldFilterByType) {
                // For missing library variables, check if the first reference's type matches the filter
                const firstRef = refs[0];
                const variableType = firstRef.variableType || firstRef.variableCategory || '';
                
                // Handle special case: merge typography and "other" types
                if (this.selectedVariableTypeFilter === 'typography') {
                  // Include both explicit typography variables and 'other' or string variables
                  // as they are often typography-related
                  const isTypography = variableType === 'typography' || 
                                     variableType === 'other' || 
                                     variableType === 'STRING' ||
                                     variableType === 'string' ||
                                     variableType === 'Text';
                  
                  if (!isTypography) {
                    // Skip if not typography-related
                    console.log(`Filtering out group ${key} with type ${variableType}, not typography-related`);
                    continue;
                  } else {
                    console.log(`Including group ${key} with type ${variableType}, matched as typography-related`);
                  }
                } 
                else if (variableType.toLowerCase() !== this.selectedVariableTypeFilter.toLowerCase()) {
                  // Skip this group if it doesn't match the selected variable type filter
                  console.log(`Filtering out group ${key} with type ${variableType}, not matching filter: ${this.selectedVariableTypeFilter}`);
                  continue;
                } else {
                  console.log(`Including group ${key} with type ${variableType}, matches selected filter: ${this.selectedVariableTypeFilter}`);
                }
              }
              
              // Apply layout filters if needed
              if (this.selectedScanType === 'layout' && this.layoutFilterType !== 'all') {
                const filteredLayoutRefs = refs.filter(ref => {
                  // Skip if not a layout reference
                  if (ref.type !== 'layout') return false;
                  
                  // Filter by dimension type (width/height)
                  if (this.layoutFilterType === 'width' && ref.dimensionType !== 'width') return false;
                  if (this.layoutFilterType === 'height' && ref.dimensionType !== 'height') return false;
                  
                  // Filter by sizing mode (fill/hug)
                  if (this.layoutFilterType === 'fill' && ref.layoutSizingMode !== 'fill') return false;
                  if (this.layoutFilterType === 'hug' && ref.layoutSizingMode !== 'hug') return false;
                  
                  return true;
                });
                
                // Skip empty groups after filtering
                if (filteredLayoutRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredLayoutRefs;
              }
              
              // Apply effects filters if needed
              if (this.selectedScanType === 'effects' && this.effectsFilterType !== 'all') {
                const filteredEffectsRefs = refs.filter(ref => {
                  // Skip if not an effects reference
                  if (ref.type !== 'effects') return false;
                  
                  // Filter by effect property type
                  if (ref.effectProperty !== this.effectsFilterType) return false;
                  
                  return true;
                });
                
                // Skip empty groups after filtering
                if (filteredEffectsRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredEffectsRefs;
              }
              
              // Create a proper group object
              result[key] = {
                refs: [...refs]  // Make a copy of the refs array
              };
            }
          }
        }
        
        console.log('Filtered results:', {
          resultCount: Object.keys(result).length,
          firstGroupRefs: Object.values(result)[0]?.refs?.length || 0
        });
        
        return result;
      },
      filteredVariables() {
        return this.variables.filter(variable => {
          // Filter by type
          if (this.variableFilters.type !== 'all' && 
              variable.type !== this.variableFilters.type) {
            return false;
          }
          
          // Filter by collection
          if (this.variableFilters.collection !== 'all' && 
              variable.collectionId !== this.variableFilters.collection) {
            return false;
          }
          
          // Filter by search
          if (this.variableFilters.search) {
            const searchLower = this.variableFilters.search.toLowerCase();
            return variable.name.toLowerCase().includes(searchLower);
          }
          
          return true;
        });
      },
      canStartVariableScan() {
        // Add null check before accessing length
        return this.selectedVariableScanTypes && this.selectedVariableScanTypes.length > 0 && !this.isVariableScanning;
      },
      showVariableScanResults() {
        // Add null check before accessing length
        return this.linkedVariables && this.linkedVariables.length > 0 && !this.isVariableScanning && this.variableScanComplete;
      },
      groupedVariables() {
        if (!this.linkedVariables?.length) {
          console.log('No linked variables to display');
          return {};
        }
        
        console.log(`Grouping ${this.linkedVariables.length} variables with filters:`, this.variableFilters);
        
        // Apply filters
        const filteredVariables = this.linkedVariables.filter(variable => {
          // Skip undefined variables
          if (!variable) return false;
          
          // Filter by type
          if (this.variableFilters.type !== 'all') {
            // Handle different type naming conventions (FLOAT vs number, etc.)
            const varType = (variable.type || '').toUpperCase();
            if (this.variableFilters.type === 'color' && varType !== 'COLOR') {
              return false;
            }
            if (this.variableFilters.type === 'number' && 
                varType !== 'FLOAT' && varType !== 'INTEGER' && varType !== 'NUMBER') {
              return false;
            }
            if (this.variableFilters.type === 'string' && varType !== 'STRING') {
              return false;
            }
            if (this.variableFilters.type === 'boolean' && varType !== 'BOOLEAN') {
              return false;
            }
          }
          
          // Filter by collection
          if (this.variableFilters.collection !== 'all' && 
              (!variable.collection || variable.collection.id !== this.variableFilters.collection)) {
            return false;
          }
          
          // Filter by library type (new)
          if (this.variableFilters.libraryType !== 'all') {
            if (this.variableFilters.libraryType === 'team-library' && !variable.isTeamLibrary) {
              return false;
            }
            if (this.variableFilters.libraryType === 'local-library' && !variable.isLocalLibrary) {
              return false;
            }
            if (this.variableFilters.libraryType === 'missing-library' && !variable.isMissingLibrary) {
              return false;
            }
          }
          
          // Filter by search term
          if (this.variableFilters.search) {
            const searchTerm = this.variableFilters.search.toLowerCase();
            const variableName = (variable.name || '').toLowerCase();
            const collectionName = (variable.collection?.name || '').toLowerCase();
            
            if (!variableName.includes(searchTerm) && !collectionName.includes(searchTerm)) {
              return false;
            }
          }
          
          return true;
        });
        
        console.log(`Filtered to ${filteredVariables.length} variables`);
        
        // Group by collection and type
        const groups = {};
        for (const variable of filteredVariables) {
          // Skip incomplete variables
          if (!variable || !variable.type) continue;
          
          const collectionName = variable.collection?.name || 
                               (variable.isTeamLibrary ? 'Team Library' : 
                                variable.isLocalLibrary ? 'Local Library' : 
                                variable.isMissingLibrary ? 'Missing Library' : 'Unknown Collection');
                                
          const groupKey = `${collectionName}-${variable.type}`;
          
          if (!groups[groupKey]) {
            groups[groupKey] = {
              collectionName,
              type: variable.type,
              libraryType: variable.isTeamLibrary ? 'team-library' : 
                          variable.isLocalLibrary ? 'local-library' : 
                          variable.isMissingLibrary ? 'missing-library' : 'unknown',
              variables: []
            };
          }
          
          // Ensure variables array exists before pushing
          if (!groups[groupKey].variables) {
            groups[groupKey].variables = [];
          }
          
          groups[groupKey].variables.push(variable);
        }
        
        console.log(`Grouped into ${Object.keys(groups).length} groups`);
        return groups;
      },
      designTokenOptions() {
        // Filter for standard design token options (typography, spacing, padding, radius, colors)
        const options = this.tokenScanOptions.filter(option => 
          ['typography', 'gap', 'horizontal-padding', 'vertical-padding', 'corner-radius', 'fill', 'stroke', 'layout'].includes(option.value)
        );
        console.log('Design token options:', options.map(o => o.value));
        return options;
      },
      libraryVariableOptions() {
        // Filter for library-related options
        return this.tokenScanOptions.filter(option => 
          ['team-library', 'local-library', 'missing-library'].includes(option.value)
        );
      },
      
      // Source type options (team library, local library, missing library, raw values)
      librarySourceOptions() {
        return [
          {
            value: 'raw-values',
            label: 'Raw Values',
            description: 'Find unlinked design tokens that need to be connected to variables',
            icon: 'raw-value'
          },
          {
            value: 'team-library',
            label: 'Team Library',
            description: 'Find elements using variables from shared team libraries',
            icon: 'team-lib'
          },
          {
            value: 'local-library',
            label: 'Local Variables',
            description: 'Find elements using variables defined in this document',
            icon: 'local-var'
          },
          {
            value: 'missing-library',
            label: 'Missing Variables',
            description: 'Find elements using variables from inaccessible libraries',
            icon: 'missing-var'
          }
        ];
      },
      
      // Token options filtered based on selected source type
      filteredTokenOptions() {
        console.log(`Getting filtered token options for source: ${this.selectedSourceType}`);
        
        // If no source type selected, return empty array
        if (!this.selectedSourceType) {
          return [];
        }
        
        // For raw-values source, filter by raw values options
        if (this.selectedSourceType === 'raw-values') {
          return this.tokenScanOptions.filter(option => {
            // Include specific raw value types
            return ['typography', 'gap', 'horizontal-padding', 'vertical-padding', 
                    'corner-radius', 'fill', 'stroke', 'layout', 'opacity', 'effects'].includes(option.value);
          });
        }
        
        // For team-library source, return only team library option
        if (this.selectedSourceType === 'team-library') {
          return this.tokenScanOptions.filter(option => 
            option.value === 'team-library'
          );
        }
        
        // For local-library source, return only local library option
        if (this.selectedSourceType === 'local-library') {
          return this.tokenScanOptions.filter(option => 
            option.value === 'local-library'
          );
        }
        
        // For missing-library source, return only missing library option
        if (this.selectedSourceType === 'missing-library') {
          return this.tokenScanOptions.filter(option => 
            option.value === 'missing-library'
          );
        }
        
        // Default fallback - return all options
        return this.tokenScanOptions;
      },
    },
    methods: {
      getReferenceClass(ref) {
        if (!ref) return 'unknown-reference';
        
        if (ref.isTeamLibrary) return 'team-library-reference';
        if (ref.isLocalLibrary) return 'local-library-reference';
        if (ref.isMissingLibrary) return 'missing-library-reference';
        if (ref.isInactiveLibrary) return 'inactive-library-reference';
        return 'unlinked-reference';
      },
      getReferenceDisplayType(ref) {
        if (!ref) return 'Unknown';
        
        if (ref.isTeamLibrary) return 'Team Library';
        if (ref.isLocalLibrary) return 'Local Variables';
        if (ref.isMissingLibrary) {
          // For missing variables, show the variable name or value if available
          if (ref.currentValue && ref.currentValue.variableName) {
            return ref.currentValue.variableName;
          }
          return 'Missing Variable';
        }
        if (ref.isInactiveLibrary) return 'Inactive Library';
        return 'Unlinked Value';
      },
      handleScanScopeChange() {
        if (this.scanEntirePage) {
          this.successMessage = 'Scanning the entire page may take longer';
          this.showSuccessToast = true;
          setTimeout(() => {
            if (this.successMessage === 'Scanning the entire page may take longer') {
              this.showSuccessToast = false;
            }
          }, 3000);
        } else {
          this.stopWatching();
        }
        // Store the user's preference
        this.userPrefersScanEntirePage = this.scanEntirePage;
      },
      stopWatching() {
        this.isWatching = false;
        parent.postMessage({ 
          pluginMessage: { 
            type: 'stop-watching'
          }
        }, '*');
      },
      startScan(isRescan = false) {
        console.log(`Starting scan with type: ${this.selectedScanType}, source: ${this.selectedSourceType}`);
        console.log('Selected frame IDs:', this.selectedFrameIds);
        
        // Clear any previous results if not a rescan
        if (!isRescan) {
          this.groupedReferences = {};
          this.expandedGroups = new Set();
          this.scanComplete = false;
          
          // Reset variable type filters for missing library scans
          this.selectedVariableTypes = [];
          this.showVariableTypeFilters = false;
        }
        
        // Set scanning state
        this.isScanning = true;
        this.scanProgress = 0;
        
        // Reset animation classes and scroll state
        const tokenTypeSection = document.querySelector('.token-type-section');
        const resultsSection = document.querySelector('.results-section');
        
        if (tokenTypeSection) {
          tokenTypeSection.classList.remove('selected');
        }
        
        if (resultsSection) {
          resultsSection.classList.remove('scan-complete');
          resultsSection.classList.remove('scroll-target');
        }

        // Determine the scan type based on our two-level selection
        let effectiveScanType;
        
        if (this.selectedSourceType === 'raw-values') {
          // For raw values, use the specific token type
          effectiveScanType = this.selectedScanType;
          console.log('Starting raw values scan for:', effectiveScanType);
        } else if (this.selectedScanType) {
          // If a specific token type is selected for a library source, use the combined value
          effectiveScanType = this.selectedScanType;
          console.log('Starting library scan with specific token type:', effectiveScanType);
        } else {
          // If only source is selected, use that to scan for all token types of that source
          effectiveScanType = this.selectedSourceType;
          console.log('Starting library scan for all tokens of type:', effectiveScanType);
        }
        
        // Save the last scanned type for comparison
        this.lastScannedType = this.selectedScanType;
        
        // Generate a descriptive message for the scan type
        let scanDescription = 'tokens';
        
        if (this.selectedSourceType === 'raw-values') {
          const tokenOption = this.filteredTokenOptions.find(option => option.value === this.selectedScanType);
          if (tokenOption) {
            scanDescription = tokenOption.label.toLowerCase();
          }
        } else {
          scanDescription = this.getSourceTypeLabel(this.selectedSourceType) + ' variables';
          
          // If a specific token type is also selected, make it more specific
          if (this.selectedScanType) {
            // Extract the token part from the combined scan type (e.g., 'team-library-typography' -> 'typography')
            const tokenPart = this.selectedScanType.split('-').slice(2).join('-');
            const tokenOption = this.filteredTokenOptions.find(option => option.value === this.selectedScanType);
            if (tokenOption) {
              scanDescription = tokenOption.label.toLowerCase() + ' ' + scanDescription;
            }
          }
        }
        
        // Show a toast with scanning message
        this.showSuccessToast = true;
        this.successMessage = `Scanning for ${scanDescription}...`;

        // Get the selected IDs if scanning selected frames
        const scanEntirePage = this.scanEntirePage;
        
        // Create a safely serializable message object
        const messageData = {
          type: 'scan-for-tokens',
          scanType: effectiveScanType,
          scanEntirePage: scanEntirePage,
          selectedFrameIds: scanEntirePage ? [] : (this.selectedFrameIds || []),
          ignoreHiddenLayers: this.ignoreHiddenLayers,
          isRescan,
          isLibraryVariableScan: this.selectedSourceType !== 'raw-values',
          // Include the source type for backend processing
          sourceType: this.selectedSourceType,
          // If we have a specific token type with a library source, include the token type separately
          tokenType: this.selectedSourceType !== 'raw-values' && this.selectedScanType ? 
                     this.selectedScanType.split('-').slice(2).join('-') : null,
          // Include selected variable types for filtering if we're scanning for missing library variables
          variableTypes: this.selectedSourceType === 'missing-library' ? this.selectedVariableTypes : []
        };
        
        // Make sure all message data is serializable
        const safeMessageData = this.makeSerializable(messageData);
        
        // Log the message data for debugging
        console.log('Sending scan message:', JSON.stringify(safeMessageData));
        
        try {
          // Send scan request to the plugin code
          parent.postMessage({ 
            pluginMessage: safeMessageData
          }, '*');
        } catch (error) {
          console.error('Failed to send message:', error);
          this.showError('Failed to start scan: ' + error.message);
          this.isScanning = false;
        }
      },
      stopScan() {
        // Log stop request
        console.log('Stopping scan...');
        
        this.isScanning = false;
        this.scanComplete = true;
        
        try {
          parent.postMessage({
            pluginMessage: this.makeSerializable({
              type: 'stop-scan'
            }) 
          }, '*');
        } catch (error) {
          console.error('Failed to send stop message:', error);
        }
      },
      handleScanComplete(msg) {
        console.log('Scan complete - full message:', msg);
        
        // Update states
        this.isScanning = false;
        this.scanComplete = true;
        
        // Detailed logging for better debugging
        console.log('Message structure:', {
          type: msg.type,
          hasReferences: !!msg.references,
          refKeys: msg.references ? Object.keys(msg.references).length : 0,
          hasResults: !!msg.results,
          resultCount: msg.results ? (Array.isArray(msg.results) ? msg.results.length : 'not an array') : 0,
          scanType: msg.scanType,
          sourceType: msg.sourceType
        });
        
        // Special handling for missing library scans
        if (msg.type === 'scan-complete' && msg.scanType === 'missing-library') {
          console.log('Processing missing-library scan results');
          
          // Ensure we store missing library results even if they arrive in different format
          if (msg.results && Array.isArray(msg.results) && msg.results.length > 0) {
            // Store in libraryResults for missing library references
            this.libraryResults = this.libraryResults || {};
            this.libraryResults.missing = msg.results;
            
            console.log(`Stored ${msg.results.length} missing library references`);
            
            // Group the results and store them properly
            const grouped = this.groupByValue(msg.results);
            if (Object.keys(grouped).length > 0) {
              console.log(`Grouped ${msg.results.length} missing library results into ${Object.keys(grouped).length} groups`);
              this.groupedReferences = grouped;
            } else {
              console.warn('Failed to group missing library results');
            }
          }
        }
        
        // Group the results if they're in array form
        if (msg.results && Array.isArray(msg.results) && msg.results.length > 0) {
          console.log(`Processing ${msg.results.length} scan results as array`);
          
          // Try to group them directly rather than sending another message
          const grouped = this.groupByValue(msg.results);
          if (Object.keys(grouped).length > 0) {
            console.log(`Directly grouped ${msg.results.length} results into ${Object.keys(grouped).length} groups`);
            this.groupedReferences = grouped;
          } else {
            // Fallback to the original approach - send to plugin for grouping
            console.log('Falling back to plugin grouping');
            parent.postMessage({
              pluginMessage: {
                type: 'group-results',
                results: msg.results,
                scanType: msg.scanType
              }
            }, '*');
          }
        } else if (msg.references && typeof msg.references === 'object') {
          console.log(`Processing scan results as grouped references`);
          
          // Check if the references are in the expected format
          let validGroups = 0;
          let validRefs = 0;
          
          for (const key in msg.references) {
            const group = msg.references[key];
            if (group && (group.refs || Array.isArray(group))) {
              validGroups++;
              const refs = group.refs || group;
              if (Array.isArray(refs)) {
                validRefs += refs.length;
              }
            }
          }
          
          console.log(`References validation: ${validGroups} valid groups with ${validRefs} total references`);
          
          // Check if we have local library results
          if (msg.scanType === 'local-library') {
            // For local library scan, check if there are any groups with local library references
            let hasLocalLibraryRefs = false;
            
            Object.values(msg.references).forEach(group => {
              const refs = group.refs || (Array.isArray(group) ? group : []);
              if (refs.length > 0 && refs.some(ref => ref.isLocalLibrary)) {
                hasLocalLibraryRefs = true;
              }
            });
            
            console.log(`Local library scan has references: ${hasLocalLibraryRefs}`);
          }
          
          // Update the grouped references
          this.groupedReferences = msg.references;
          
          console.log('Updated groupedReferences:', {
            keys: Object.keys(this.groupedReferences).length,
            scanType: msg.scanType
          });
        } else {
          console.warn('No valid results found in message. Type:', msg.type);
          if (msg.type === 'scan-complete') {
            console.log('Scan complete message details:', { 
              hasReferences: !!msg.references,
              referencesLength: msg.references ? Object.keys(msg.references).length : 0,
              hasResults: !!msg.results,
              resultsLength: msg.results ? msg.results.length : 0
            });
          }
          
          // Don't reset groupedReferences if we completed a scan but didn't get new data
          // This way we keep existing results if the new scan didn't find anything
          if (!this.groupedReferences || Object.keys(this.groupedReferences).length === 0) {
            this.groupedReferences = {}; // Only reset if it was empty already
          }
        }
        
        // Set the scan type for filtering
        this.scanType = msg.scanType;
        this.isLibraryVariableScan = msg.isLibraryVariableScan === true;
        
        console.log('Scan data state:', {
          scanType: this.scanType,
          isLibraryVariableScan: this.isLibraryVariableScan,
          selectedSourceType: this.selectedSourceType,
          selectedScanType: this.selectedScanType,
          hasResults: this.hasResults
        });
        
        // Test the filtering logic
        const filteredCount = Object.keys(this.filteredResults).length;
        console.log(`After filtering: ${filteredCount} groups available to display`);
        
        if (this.isWatching) {
          this.successMessage = 'Scan complete! Watching for changes...';
        } else {
          this.successMessage = 'Scan complete!';
        }
        
        this.showSuccessToast = true;
        setTimeout(() => { this.showSuccessToast = false; }, 3000);
      },
      handleScanError(error) {
        this.isScanning = false;
        this.scanComplete = true;
        this.scanError = true;
        
        console.error('Scan error:', error);
        this.showError('Scan failed. Please try again.');
      },
      
      showError(message) {
        // Add error toast or notification
        console.error(message);
        // You can implement a toast notification here
      },

      switchTab(tab) {
        // Clean up previous tab state
        this.isScanning = false;
        this.scanProgress = 0;
        this.scanError = false;
        this.scanComplete = false;
        this.groupedReferences = {};
        
        this.activeTab = tab;
      },

      getProgressStatus() {
        if (this.scanError) {
          return 'Scan error';
        }
        if (!this.isScanning && this.scanProgress === 100) {
          return this.hasResults ? 'Scan complete' : 'No issues found';
        }
        if (this.isScanning) {
          return `Scanning... ${Math.round(this.scanProgress)}%`;
        }
        return 'Ready to scan';
      },
      
      getStartScanButtonTitle() {
        if (!this.hasSelection && !this.scanEntirePage) {
          return 'Select frames/components/sections or enable "Scan Entire Page"';
        }
        if (!this.selectedSourceType) {
          return 'Select a source type';
        }
        if (!this.selectedScanType) {
          return 'Select a token type';
        }
        return 'Start scanning';
      },
      
      updateSelection(msg) {
        console.log('Updating selection with:', msg);
        
        // Update selection state variables
        this.hasSelection = msg.hasSelection === true;
        this.selectedCount = msg.count || 0;
        this.hasInstances = msg.hasInstances === true;
        
        if (Array.isArray(msg.selectedFrameIds)) {
          this.selectedFrameIds = msg.selectedFrameIds;
        } else if (Array.isArray(msg.ids)) {
          this.selectedFrameIds = msg.ids;
        }
        
        console.log('Updated selection state:', {
          hasSelection: this.hasSelection,
          selectedCount: this.selectedCount,
          hasInstances: this.hasInstances,
          selectedFrameIds: this.selectedFrameIds.length
        });
      },
      
      handlePluginMessage(msg) {
        // If no message or not an object, ignore
        if (!msg || typeof msg !== 'object') return;
        
        // Get plugin message data
        const data = msg.pluginMessage || msg;
        
        // If not a valid message, ignore
        if (!data || !data.type) return;
        
        // Log message type for debugging
        console.log('Received message:', data.type);
        
        // Handle different message types
        switch (data.type) {
          case 'selection-update':
            // Direct handling instead of calling updateSelection
            console.log('Handling selection update directly:', data);
            this.hasSelection = data.hasSelection === true;
            this.selectedCount = data.count || 0;
            this.hasInstances = data.hasInstances === true;
            
            if (Array.isArray(data.selectedFrameIds)) {
              this.selectedFrameIds = data.selectedFrameIds;
            } else if (Array.isArray(data.ids)) {
              this.selectedFrameIds = data.ids;
            }
            break;
          case 'scan-started':
            console.log('Scan started:', data);
            this.isScanning = true;
            this.scanProgress = 0;
            this.scanType = data.scanType || this.scanType; // Preserve the scan type
            break;
          case 'scan-progress':
            this.handleScanProgress(data);
            break;
          case 'scan-complete':
            this.handleScanComplete(data);
            break;
          case 'missing-library-result':
            // Use our missing library result handler
            this.handleMissingLibraryResult(data);
            break;
          case 'team-library-result':
            // Use team library result handler
            this.handleTeamLibraryResult(data);
            break;
          case 'local-library-result':
            // Use local library result handler
            this.handleLocalLibraryResult(data);
            break;
          case 'raw-values-result':
            // Default handling for raw values
            this.groupedReferences = data.references || {};
            this.isScanning = false;
            this.scanComplete = true;
            break;
          case 'missing-references-result':
            // Special handling for missing library references
            if (data.scanType === 'missing-library' || 
                (data.references && Object.keys(data.references).some(key => key.startsWith('missing-library')))) {
              this.handleMissingLibraryResult(data);
            } else {
              // Original handling for other reference types
              this.handleScanComplete({
                type: 'scan-complete',
                references: data.references,
                scanType: data.scanType || 'unknown'
              });
            }
            break;
          case 'scan-error':
            this.isScanning = false;
            this.scanError = true;
            this.handleScanError(data);
            break;
          case 'nodes-selected':
            if (data.success) {
              this.successMessage = `Selected ${data.count} nodes`;
              this.showSuccessToast = true;
              setTimeout(() => { this.showSuccessToast = false; }, 2000);
            } else {
              this.errorMessage = data.error || 'Failed to select nodes';
              this.showErrorToast = true;
              setTimeout(() => { this.showErrorToast = false; }, 3000);
            }
            break;
          case 'error':
            this.errorMessage = data.message;
            this.showErrorToast = true;
            setTimeout(() => { this.showErrorToast = false; }, 3000);
            break;
          case 'watch-status':
            this.isWatching = data.isWatching;
            break;
          case 'scan-cancelled':
            this.isScanning = false;
            this.scanProgress = 0;
            this.successMessage = 'Scan cancelled';
            this.showSuccessToast = true;
            setTimeout(() => { this.showSuccessToast = false; }, 3000);
            break;
          case 'variable-scan-complete':
            this.isVariableScanning = false;
            this.variableScanComplete = true;
            
            if (data.variables && Array.isArray(data.variables)) {
              this.variables = data.variables;
              
              // Find unique collections
              this.variableCollections = [...new Set(
                this.variables
                  .filter(v => v.collectionId)
                  .map(v => v.collectionId)
              )];
              
              // Set success message
              this.variableSuccessMessage = 'Variable scan complete!';
              this.showVariableSuccessToast = true;
              setTimeout(() => { this.showVariableSuccessToast = false; }, 3000);
            }
            break;
          case 'variable-scan-progress':
            this.variableScanProgress = data.progress;
            break;
          case 'variable-scan-status':
            this.variableScanStatus = data.message;
            break;
          case 'variable-scan-cancelled':
            this.isVariableScanning = false;
            this.variableScanProgress = 0;
            this.variableSuccessMessage = 'Variable scan cancelled';
            this.showVariableSuccessToast = true;
            setTimeout(() => { this.showVariableSuccessToast = false; }, 3000);
            break;
          case 'resize':
            if (data.width && data.height) {
              const width = Number(data.width);
              const height = Number(data.height);
              
              if (!isNaN(width) && !isNaN(height)) {
                this.windowSize = { width, height };
              }
            }
            break;
          default:
            console.log(`Unhandled message type: ${data.type}`);
        }
      },
      handleMissingLibraryResult(msg) {
        console.log('Handling missing library result:', msg);
        
        if (!msg.references || typeof msg.references !== 'object') {
          console.warn('Invalid missing library references received');
          return;
        }
        
        // Process the references using our new method
        this.groupedReferences = this.processMissingLibraryVariables(msg.references);
        
        // Ensure we know it's a missing library scan
        this.scanType = 'missing-library';
        this.isLibraryVariableScan = true;
        
        // Update scan completion state
        this.isScanning = false;
        this.scanComplete = true;
        this.scanProgress = 100;
        
        // Process and store available variable types if they exist
        if (msg.availableTypes && Array.isArray(msg.availableTypes)) {
          this.availableVariableTypes = msg.availableTypes;
          console.log('Available variable types:', this.availableVariableTypes);
          
          // Only show variable type filters if there are results and available types
          if (Object.keys(this.groupedReferences).length > 0 && this.availableVariableTypes.length > 0) {
            this.showVariableTypeFilters = true;
          }
        } else {
          // Convert availableTypes from Set to Array if needed
          if (msg.availableTypes && typeof msg.availableTypes === 'object') {
            try {
              // Try to extract availableTypes if it's sent as a Set-like object
              this.availableVariableTypes = Array.from(msg.availableTypes);
              console.log('Converted available types:', this.availableVariableTypes);
              
              // Only show variable type filters if there are results and available types
              if (Object.keys(this.groupedReferences).length > 0 && this.availableVariableTypes.length > 0) {
                this.showVariableTypeFilters = true;
              }
            } catch (e) {
              console.warn('Could not convert availableTypes to array:', e);
              this.availableVariableTypes = [];
              this.showVariableTypeFilters = false;
            }
          } else {
            this.availableVariableTypes = [];
            this.showVariableTypeFilters = false;
          }
        }
        
        console.log(`Processed ${Object.keys(msg.references).length} missing library reference groups`);
        
        // Ensure the UI shows the results
        this.showSuccessToast = true;
        this.successMessage = 'Found missing library variables!';
        setTimeout(() => { this.showSuccessToast = false; }, 3000);
      },
      handleScanProgress(msg) {
        if (msg && typeof msg.progress === 'number') {
          this.scanProgress = Math.min(100, Math.max(0, msg.progress));
          this.isScanning = msg.isScanning !== false;
        }
      },
      selectScanType(value) {
        console.log(`Selected scan type: ${value}`);
        
        // Always set the selected value (no toggling)
        this.selectedScanType = value;
        
        // Add the selected class to the token type section for animation
        const tokenTypeSection = document.querySelector('.token-type-section');
        if (tokenTypeSection) {
          tokenTypeSection.classList.add('selected');
        }
        
        // Scroll to the scan buttons section after a short delay
        setTimeout(() => {
          const scanButtonsSection = document.querySelector('.scan-buttons');
          if (scanButtonsSection) {
            scanButtonsSection.classList.add('scroll-target');
            scanButtonsSection.scrollIntoView({ behavior: 'smooth' });
          }
        }, 300); // Short delay to allow the animation to start
      },
      getTotalResultsCount() {
        let count = 0;
        
        console.log('Counting results from:', this.groupedReferences);
        
        // Count references from all groups
        Object.keys(this.groupedReferences || {}).forEach(key => {
          const group = this.groupedReferences[key];
          
          // Handle new grouped structure with refs property
          if (group && group.refs && Array.isArray(group.refs)) {
            count += group.refs.length;
            console.log(`Group ${key}: Adding ${group.refs.length} references from group.refs`);
          } 
          // Handle legacy format where the group itself is an array
          else if (group && Array.isArray(group)) {
            count += group.length;
            console.log(`Group ${key}: Adding ${group.length} references from array group`);
          }
        });
        
        console.log(`Total results count: ${count}`);
        
        // Format the count with comma for thousands
        return count.toLocaleString();
      },
      
      // Add the formatValue function
      formatValue(value) {
        // Handle null, undefined, or empty values
        if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
          return 'None';
        }
        
        try {
          // Handle string values
          if (typeof value === 'string') {
            return value;
          }
          
          // Handle number values - these are often spacing, padding, radius
          if (typeof value === 'number') {
            // Format as pixel value for UI display
            return `${value}px`;
          }
          
          // Handle opacity values
          if (typeof value === 'number' && value >= 0 && value <= 1 && String(value).includes('.')) {
            // Format as percentage for opacity values
            return `${Math.round(value * 100)}%`;
          }
          
          // Handle boolean values
          if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
          }
          
          // Handle color values
          if (typeof value === 'object' && value !== null) {
            // Check if it's a color (has r, g, b properties)
            if ('r' in value && 'g' in value && 'b' in value) {
              const r = Math.round(value.r * 255);
              const g = Math.round(value.g * 255);
              const b = Math.round(value.b * 255);
              const a = value.a || 1;
              
              // For full opacity, just show RGB
              if (a === 1) {
                return `RGB(${r}, ${g}, ${b})`;
              }
              // For partial opacity, show RGBA
              return `RGBA(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
            }
            
            // Check for variable references
            if ('variableName' in value) {
              return value.variableName;
            }
            
            // Check for typography values
            if ('fontFamily' in value || 'fontSize' in value) {
              return this.formatTypographyValue(value);
            }
            
            // Handle other object values by serializing them
            return JSON.stringify(value);
          }
          
          // Default case - convert to string
          return String(value);
        } catch (err) {
          console.warn('Error formatting value:', err);
          return 'Error';
        }
      },
      
      formatTypographyValue(value) {
        if (typeof value === 'object') {
          // If it has the new structured format with formatted property
          if (value.formatted) {
            return value.formatted;
          }
          // Legacy format
          return `${value.fontFamily || 'Unknown'} ${value.fontWeight || 'Regular'} ${value.fontSize || '12'}px`;
        }
        return String(value);
      },
      debugResults() {
        console.log('=== DEBUG SCAN RESULTS ===');
        console.log('Selected source type:', this.selectedSourceType);
        console.log('Selected scan type:', this.selectedScanType);
        console.log('Has results:', this.hasResults);
        console.log('Grouped references:', this.groupedReferences);
        console.log('Show scan results:', this.showScanResults);
        console.log('Filtered results:', this.filteredResults);
        console.log('=== END DEBUG ===');
        
        // Create a detailed report
        const report = {
          scanType: this.selectedScanType,
          sourceType: this.selectedSourceType,
          groupedReferencesCount: Object.keys(this.groupedReferences).length,
          filteredResultsCount: Object.keys(this.filteredResults).length,
          showScanResults: this.showScanResults,
          scanComplete: this.scanComplete,
          isScanning: this.isScanning,
          hasResults: this.hasResults,
          localLibraryCount: 0,
          teamLibraryCount: 0,
          unlinkedCount: 0,
          missingLibraryCount: 0
        };
        
        // Count reference types
        for (const key in this.groupedReferences) {
          const group = this.groupedReferences[key];
          if (!group.refs || !Array.isArray(group.refs)) continue;
          
          group.refs.forEach(ref => {
            if (ref.isLocalLibrary) report.localLibraryCount++;
            if (ref.isTeamLibrary) report.teamLibraryCount++;
            if (ref.isUnlinked) report.unlinkedCount++;
            if (ref.isMissingLibrary) report.missingLibraryCount++;
          });
        }
        
        console.table(report);
      },
      
      // New function to debug variables in the document
      debugDocumentVariables() {
        // Clear any previous results
        this.isScanning = true;
        this.scanProgress = 0;
                
        console.log('Debugging document variables...');
        
        // Send message to plugin code
        parent.postMessage({ 
          pluginMessage: { 
            type: 'debug-document-variables'
          }
        }, '*');
      },
      
      // Add the missing groupByValue method that's used but not defined
      groupByValue(results) {
        console.log('groupByValue called with results:', results);
        
        // If results is undefined or not an array or empty, return empty object
        if (!results?.length) {
          console.log('Results is not a valid array or is empty, returning empty object');
          return {};
        }
        
        console.log(`Grouping ${results.length} results`);
        
        const grouped = {};
        
        // Ensure each result has required properties for display
        results = results.map(result => {
          // Create a copy to avoid mutating the original
          const copy = { ...result };
          
          // Ensure the result has a nodeId
          if (!copy.nodeId && copy.id) {
            copy.nodeId = copy.id;
          }
          
          // Ensure it has a name for display
          if (!copy.nodeName && copy.name) {
            copy.nodeName = copy.name;
          }
          
          // Make sure currentValue is populated
          if (copy.currentValue === undefined && copy.value !== undefined) {
            copy.currentValue = copy.value;
          }
          
          return copy;
        });
        
        // Group results by type and value
        results.forEach((result, index) => {
          if (!result || typeof result !== 'object') {
            console.log(`Skipping invalid result at index ${index}`);
            return;
          }
          
          let key = '';
          let property = result.property || '';
          let typeKey = result.type || '';
          let value = result.currentValue;
          
          // For backward compatibility, handle result formats
          if (value === undefined) {
            value = result.value;
          }
          
          // Handle null values
          if (value === null || value === undefined) {
            value = 'null';
          }
          
          // Create a meaningful key based on the result type
          if (typeKey === 'typography') {
            // Make sure we're extracting the right properties
            const family = result.family || (result.currentValue && result.currentValue.fontFamily) || 'Unknown';
            const style = result.style || (result.currentValue && result.currentValue.fontWeight) || 'Regular';
            const size = result.size || (result.currentValue && result.currentValue.fontSize) || '0';
            key = `${typeKey}:${family} ${style} ${size}`;
          } else if (typeKey === 'color' || typeKey === 'fill' || typeKey === 'stroke') {
            // For colors, use the hex or rgba value and include the type explicitly
            // This ensures fill and stroke colors are not grouped together even with the same color
            const colorValue = result.hex || result.rgba || (typeof value === 'object' ? JSON.stringify(value) : String(value));
            
            // Make type a more prominent part of the key to ensure separation between fill and stroke
            if (typeKey === 'fill') {
              // For fill types, ensure the type is clearly marked
              key = `fill-color:${colorValue}`;
            } else if (typeKey === 'stroke') {
              // For stroke types, ensure the type is clearly marked
              key = `stroke-color:${colorValue}`;
            } else {
              // Generic color handling
              key = `color:${colorValue}`;
            }
          } else if (typeKey === 'spacing-gap' || typeKey === 'gap' || typeKey === 'verticalGap' || typeKey === 'vertical-gap' || typeKey === 'horizontalGap') {
            // Normalize type for consistency
            typeKey = 'vertical-gap';
            const gapValue = typeof value === 'number' ? value : (value && value.value ? value.value : 0);
            key = `${typeKey}:${gapValue}`;
          } else if (typeKey === 'corner-radius' || typeKey === 'cornerRadius') {
            // Normalize type for consistency
            typeKey = 'corner-radius';
            const radiusValue = typeof value === 'number' ? value : (value && value.value ? value.value : 0);
            const cornerType = result.cornerType || result.property || 'all';
            key = `${typeKey}:${radiusValue}:${cornerType}`;
          } else if (['team-library', 'local-library', 'missing-library'].includes(typeKey)) {
            // For library variables, create a key based on variable name and property
            const variableName = result.variableName || (value && value.variableName) || 'Unknown';
            key = `${typeKey}:${variableName}:${property}`;
          } else {
            // Fallback for unknown types
            const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            key = `${typeKey}:${valueStr}`;
          }
          
          // Make sure the result has the correct type property
          result.type = typeKey;
          
          // Initialize array if key doesn't exist with a valid refs array
          if (!grouped[key]) {
            grouped[key] = { refs: [] };
          }
          
          // Ensure refs array exists (defensive programming)
          if (!grouped[key].refs) {
            grouped[key].refs = [];
          }
          
          // Add result to the array
          grouped[key].refs.push(result);
        });
        
        // Log groups and their sizes
        for (const [key, group] of Object.entries(grouped)) {
          const refCount = group?.refs?.length || 0;
          console.log(`Group ${key}: ${refCount} items`);
        }
        
        console.log('Grouped results by value:', {
          groupCount: Object.keys(grouped).length,
          totalRefs: Object.values(grouped).reduce((sum, group) => sum + (group?.refs?.length || 0), 0)
        });
        
        return grouped;
      },
      
      selectLibraryScanType(value) {
        // Always set the selected value (no toggling)
        this.selectedLibraryTokenScanType = value;
        
        console.log(`Selected library scan type: ${value}`);
      },
      openFeedbackForm() {
        window.open('https://t.maze.co/350274999', '_blank');
      },
      toggleHiddenFilter() {
        this.showHiddenOnly = !this.showHiddenOnly;
      },
      async loadVariables() {
        this.isLoadingVariables = true;
        try {
          // Send message to the plugin code to get variables
          parent.postMessage({
            pluginMessage: {
              type: 'get-variables'
            }
          }, '*');
        } catch (error) {
          console.error('Error loading variables:', error);
          this.showError('Failed to load variables');
        } finally {
          this.isLoadingVariables = false;
        }
      },
      handleVariablesResponse(data) {
        this.variables = data.variables || [];
        this.variableCollections = data.collections || [];
      },
      selectVariable(variableId) {
        if (!variableId) {
          console.warn('Cannot select variable: No variable ID provided');
          return;
        }
        
        // Set the selected variable ID for UI highlighting
        this.selectedVariableId = variableId;
        
        // Send a message to the plugin to select nodes using this variable
        parent.postMessage({
          pluginMessage: {
            type: 'select-variable-nodes',
            variableId: variableId
          }
        }, '*');
      },
      updateVariableFilters(filters) {
        this.variableFilters = {
          ...this.variableFilters,
          ...filters
        };
      },
      toggleVariableScanType(type) {
        // If 'all' is selected, deselect others
        if (type === 'all') {
          this.selectedVariableScanTypes = ['all'];
          return;
        }
        
        // If selecting something else while 'all' is selected, deselect 'all'
        if (this.selectedVariableScanTypes.includes('all')) {
          this.selectedVariableScanTypes = [type];
          return;
        }
        
        // Toggle the selected type
        if (this.selectedVariableScanTypes.includes(type)) {
          // Don't allow deselecting if it's the only one selected
          if (this.selectedVariableScanTypes.length > 1) {
            this.selectedVariableScanTypes = this.selectedVariableScanTypes.filter(t => t !== type);
          }
        } else {
          this.selectedVariableScanTypes.push(type);
        }
      },
      makeSerializable(obj, visited = new WeakMap()) {
        // Handle primitives and null
        if (obj === null || typeof obj !== 'object') {
          return obj;
        }
        
        // Handle circular references
        if (visited.has(obj)) {
          return '[Circular Reference]';
        }
        
        // Add object to visited map
        visited.set(obj, true);
        
        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.map(item => this.makeSerializable(item, visited));
        }
        
        // Handle Map objects
        if (obj instanceof Map) {
          return Object.fromEntries(
            Array.from(obj.entries()).map(([k, v]) => [
              typeof k === 'object' ? JSON.stringify(k) : k,
              this.makeSerializable(v, visited)
            ])
          );
        }
        
        // Handle Set objects
        if (obj instanceof Set) {
          return [...obj].map(item => this.makeSerializable(item, visited));
        }
        
        // Handle Date objects
        if (obj instanceof Date) {
          return obj.toISOString();
        }
        
        // Handle regular objects
        const result = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            try {
              // Skip functions, DOM nodes, and symbols
              if (typeof obj[key] === 'function' || 
                  typeof obj[key] === 'symbol' ||
                  (typeof obj[key] === 'object' && obj[key] !== null && obj[key].nodeType)) {
                continue;
              }
              
              // Recursively make properties serializable
              result[key] = this.makeSerializable(obj[key], visited);
            } catch (err) {
              // If we can't serialize this property, exclude it
              console.warn(`Couldn't serialize property ${key}:`, err);
              result[key] = `[Unserializable: ${typeof obj[key]}]`;
            }
          }
        }
        return result;
      },
      startVariableScan() {
        if (this.isVariableScanning) return;
        
        this.isVariableScanning = true;
        this.variableScanProgress = 0;
        this.linkedVariables = [];
        
        try {
          const message = this.makeSerializable({
            type: 'scan-variables',
            scanTypes: this.selectedVariableScanTypes,
            ignoreHiddenLayers: this.ignoreHiddenLayers
          });
          
          parent.postMessage({
            pluginMessage: message
          }, '*');
        } catch (error) {
          console.error('Failed to start variable scan:', error);
          this.isVariableScanning = false;
          this.showError('Failed to start variable scan: ' + error.message);
        }
      },
      stopVariableScan() {
        if (!this.isVariableScanning) return;
        
        try {
          parent.postMessage({
            pluginMessage: this.makeSerializable({
              type: 'stop-variable-scan'
            })
          }, '*');
          
          this.isVariableScanning = false;
        } catch (error) {
          console.error('Failed to stop variable scan:', error);
        }
      },
      handleVariableScanProgress(progress) {
        this.variableScanProgress = progress;
      },
      handleVariableScanComplete(variables) {
        this.isVariableScanning = false;
        this.variableScanProgress = 100;
        this.linkedVariables = variables;
        this.showVariableScanResults = true;
        this.showRescanVariablesButton = true;
        
        // Extract collections from variables
        const collections = new Map();
        for (const variable of variables) {
          if (variable.collection) {
            if (!collections.has(variable.collection.id)) {
              collections.set(variable.collection.id, {
                id: variable.collection.id,
                name: variable.collection.name,
                remote: variable.collection.remote,
                variables: []
              });
            }
            collections.get(variable.collection.id).variables.push(variable);
          }
        }
        
        this.variableCollections = Array.from(collections.values());
      },
      handleVariableScanError(message) {
        this.isVariableScanning = false;
        this.errorMessage = message || 'Failed to scan variables';
        this.showErrorToast = true;
        
        // Auto-hide toast after delay
        setTimeout(() => {
          if (this.errorMessage === message) {
            this.showErrorToast = false;
          }
        }, 3000);
      },
      handleVariableUnlinked(data) {
        if (!data) return;
        
        const { variableId, unlinkedCount } = data;
        
        // Show success message
        this.successMessage = `Unlinked variable from ${unlinkedCount} instances`;
        this.showSuccessToast = true;
        
        // Remove variable from list or update counts
        this.linkedVariables = this.linkedVariables.filter(v => v.id !== variableId);
        
        // Auto-hide toast after delay
        setTimeout(() => {
          if (this.successMessage === `Unlinked variable from ${unlinkedCount} instances`) {
            this.showSuccessToast = false;
          }
        }, 3000);
      },
      // Get progress bar color for variable scan
      getProgressBarColor(type) {
        if (type === 'variables') {
          if (this.variableScanError) {
            return 'var(--figma-color-bg-danger)';
          }
          if (!this.isVariableScanning && this.variableScanProgress === 100) {
            return 'var(--figma-color-bg-success)';
          }
          if (this.isVariableScanning) {
            return 'var(--figma-color-bg-brand)';
          }
          return 'var(--figma-color-bg-disabled)';
        }
        
        // For type 'default' or any other type, use the standard logic
        if (this.scanError) {
          return 'var(--figma-color-bg-danger)';
        }
        if (!this.isScanning && this.scanProgress === 100) {
          return 'var(--figma-color-bg-success)';
        }
        if (this.isScanning) {
          return 'var(--figma-color-bg-brand)';
        }
        return 'var(--figma-color-bg-disabled)';
      },
      // Get variable scan progress status
      getVariableProgressStatus() {
        if (!this.canStartVariableScan) return 'Select variable types to scan';
        if (this.isVariableScanning) return `Scanning... ${this.variableScanProgress}%`;
        if (!this.isVariableScanning && this.variableScanProgress === 100) {
          if (this.linkedVariables.length === 0) return 'No issues found';
          return `Found ${this.linkedVariables.length} variables`;
        }
        return 'Ready to scan';
      },
      // Format variable type for display
      formatVariableType(type) {
        switch (type) {
          case 'COLOR': return 'Color';
          case 'FLOAT': return 'Number';
          case 'INTEGER': return 'Number';
          case 'BOOLEAN': return 'Boolean';
          case 'STRING': return 'Text';
          default: return type;
        }
      },
      // Format variable value for display
      formatVariableValue(value, type) {
        if (value === undefined || value === null) {
          return 'N/A';
        }
        
        // Normalize type to uppercase
        const normalizedType = (type || '').toUpperCase();
        
        // Format based on type
        if (normalizedType === 'COLOR') {
          // Handle color values
          if (typeof value === 'object' && value !== null) {
            // Handle rgba object
            if ('r' in value && 'g' in value && 'b' in value) {
              const r = Math.round((value.r || 0) * 255);
              const g = Math.round((value.g || 0) * 255);
              const b = Math.round((value.b || 0) * 255);
              const a = value.a !== undefined ? value.a : 1;
              return `RGBA(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
            }
            // Handle HSL object
            else if ('h' in value && 's' in value && 'l' in value) {
              return `HSL(${value.h}, ${value.s}%, ${value.l}%)`;
            }
            // Handle unknown object format
            return JSON.stringify(value);
          }
          // Handle string values (like hex)
          else if (typeof value === 'string') {
            return value;
          }
        }
        else if (normalizedType === 'FLOAT' || normalizedType === 'NUMBER' || normalizedType === 'INTEGER') {
          // Format number with up to 2 decimal places
          const num = parseFloat(value);
          return isNaN(num) ? value.toString() : num.toFixed(2);
        }
        else if (normalizedType === 'BOOLEAN') {
          // Format boolean values
          return value ? 'True' : 'False';
        }
        else if (normalizedType === 'STRING') {
          // Format string values (truncate if too long)
          const str = value.toString();
          return str.length > 50 ? str.substring(0, 47) + '...' : str;
        }
        
        // Default to string representation for unknown types
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      },
      // Select all variables in a group
      selectAllVariablesInGroup(variables) {
        if (!variables?.length) {
          console.warn('Cannot select variables: No valid variables array provided');
          return;
        }
        
        // Extract all variable IDs
        const variableIds = variables
          .filter(v => v && v.id) // Filter out invalid variables
          .map(v => v.id);
        
        if (!variableIds?.length) {
          console.warn('No valid variable IDs found in the group');
          return;
        }
        
        // Send a message to the plugin to select nodes using these variables
        parent.postMessage({
          pluginMessage: {
            type: 'select-variable-group-nodes',
            variableIds: variableIds
          }
        }, '*');
      },
      // Unlink a specific variable from all its usages
      unlinkVariable(variableId) {
        if (!variableId) return;
        
        const variable = this.linkedVariables.find(v => v.id === variableId);
        if (!variable) return;
        
        // Confirm with user
        const confirmMessage = `Unlink variable "${variable.name}" from ${variable.usages?.length || 0} instances?`;
        
        if (confirm(confirmMessage)) {
          try {
            parent.postMessage({
              pluginMessage: this.makeSerializable({
                type: 'unlink-variable',
                variableId
              })
            }, '*');
          } catch (error) {
            console.error('Failed to unlink variable:', error);
            this.showError('Failed to unlink variable');
          }
        }
      },
      setPaddingFilter(type) {
        this.paddingFilterType = type;
      },
      setRadiusFilter(type) {
        this.radiusFilterType = type;
      },
      setGapFilter(type) {
        this.gapFilterType = type;
      },
      // Add layout filter method
      setLayoutFilter(type) {
        this.layoutFilterType = type;
      },
      // Add effects filter method  
      setEffectsFilter(type) {
        this.effectsFilterType = type;
      },
      // Add toggleGroup method
      toggleGroup(groupKey) {
        if (this.expandedGroups.has(groupKey)) {
          this.expandedGroups.delete(groupKey);
        } else {
          this.expandedGroups.add(groupKey);
        }
      },
      
      // Add isGroupExpanded method
      isGroupExpanded(groupKey) {
        return this.expandedGroups.has(groupKey);
      },
      
      // Add selectGroup method
      async selectGroup(refs, event) {
        console.log('Selecting group with refs:', refs);
        
        // Prevent event bubbling
        if (event) {
          event.stopPropagation();
        }
        
        // Check for null, undefined, empty array, or invalid refs object using optional chaining
        if (!refs || (!refs?.length && !refs?.refs?.length)) {
          console.warn('No valid references provided to selectGroup method');
          return;
        }
        
        // Handle both array and object with refs property
        const refsArray = Array.isArray(refs) ? refs : (refs.refs || []);
        
        if (!refsArray?.length) {
          console.warn('No references to select after processing');
          return;
        }
        
        // Extract only valid nodeIds
        const nodeIds = refsArray
          .filter(ref => ref && ref.nodeId) // Filter out invalid refs
          .map(ref => ref.nodeId);
        
        if (!nodeIds?.length) {
          console.warn('No valid node IDs found in references');
          return;
        }
        
        console.log(`Sending ${nodeIds.length} node IDs for selection`);
        
        // Send message to plugin for node selection
        parent.postMessage({
          pluginMessage: {
            type: 'select-group',
            nodeIds: nodeIds
          }
        }, '*');
      },
      
      // Add selectNode method
      selectNode(nodeId, event) {
        // Prevent event propagation if provided
        if (event) {
          event.stopPropagation();
        }
        
        // Check for null/undefined nodeId
        if (!nodeId) {
          console.warn('Cannot select node: No node ID provided');
          return;
        }
        
        // Send node ID to plugin
        parent.postMessage({
          pluginMessage: {
            type: 'select-node',
            nodeId: nodeId
          }
        }, '*');
      },
      
      // Add a new method to process debug results
      processMissingLibraryVariables(variables) {
        // Add null check for variables
        if (!variables || typeof variables !== 'object') {
          console.warn('processMissingLibraryVariables received invalid variables:', variables);
          return {};
        }

        const processedGroups = {};
        
        for (const [groupKey, refs] of Object.entries(variables)) {
          if (!refs || !refs.length) continue;
          
          // Process the first reference to extract common information
          const firstRef = refs[0];
          if (!firstRef) continue; // Skip if first reference is null/undefined
            
          const libraryName = firstRef.libraryName || 'Missing Library';
          
          // Extract variable type information
          const variableType = firstRef.variableType || 
                             (firstRef.currentValue && firstRef.currentValue.variableType) || 
                             'UNKNOWN';
          
          // Map variable type to more user-friendly format
          let typeLabel = 'Unknown';
          switch (variableType) {
            case 'COLOR':
              typeLabel = 'Color';
              break;
            case 'FLOAT':
              typeLabel = 'Number/Spacing';
              break;
            case 'STRING':
              typeLabel = 'Text/Typography';
              break;
            case 'BOOLEAN':
              typeLabel = 'Boolean';
              break;
            default:
              typeLabel = variableType || 'Unknown';
          }
          
          // Create a processed group
          processedGroups[groupKey] = {
            refs: refs,
            count: refs.length,
            expanded: false, // Start collapsed
            libraryName,
            variableType,
            typeLabel,
            variableName: firstRef.currentValue?.variableName || 'Unknown Variable',
            // Common properties for UI display
            isVisible: refs.some(ref => ref.isVisible),
            allHidden: !refs.some(ref => ref.isVisible),
            // Add any other properties needed for UI
          };
        }
        
        return processedGroups;
      },
      
      // Select source type (first level filter)
      selectSourceType(value) {
        console.log(`Selected source type: ${value}`);
        
        // Always set the selected value (no toggling)
        this.selectedSourceType = value;
        
        // Reset scan type when changing source type
        this.selectedScanType = null;
        
        // Reset animation classes
        const tokenTypeSection = document.querySelector('.token-type-section');
        const resultsSection = document.querySelector('.results-section');
        
        if (tokenTypeSection) {
          tokenTypeSection.classList.remove('selected');
        }
        
        if (resultsSection) {
          resultsSection.classList.remove('scan-complete');
          resultsSection.classList.remove('scroll-target');
        }
        
        // Scroll back to the top of the plugin container
        setTimeout(() => {
          const pluginContainer = document.querySelector('.plugin-container');
          if (pluginContainer) {
            pluginContainer.scrollTop = 0;
          }
        }, 100);
      },
      
      // Get readable label for source type
      getSourceTypeLabel(sourceType) {
        switch (sourceType) {
          case 'team-library': return 'team library';
          case 'local-library': return 'local variables';
          case 'missing-library': return 'missing variables';
          case 'raw-values': return 'unlinked';
          default: return sourceType;
        }
      },
      // Helper method to validate groups based on scan type
      isGroupValidForScan(key, refs) {
        // Always check for valid refs
        if (!refs || !Array.isArray(refs) || refs.length === 0) {
          console.log(`Group invalid - no refs: key=${key}`);
          return false;
        }
        
        const firstRef = refs[0];
        if (!firstRef) {
          console.log(`Group invalid - first ref is null: key=${key}`);
          return false;
        }
        
        // DEBUGGING: For now, consider all groups with valid refs as valid
        console.log(`DEBUG: Force-allowing group: ${key} with ${refs.length} refs`);
        return true;
        
        // The rest of the method is temporarily disabled for debugging
        /* Original validation code
        // If no scan type is set, consider all groups valid
        if (!this.selectedScanType) {
          console.log(`Group valid - no scan type selected: key=${key}`);
          return true;
        }
        
        const refType = firstRef.type || '';
        
        // Extract type from key if available
        const keyParts = key.split(':');
        const keyType = keyParts[0] || '';
        
        // For consistency, use the extracted type if both are available
        const effectiveType = keyType || refType;
        
        console.log(`Validating group: key=${key}, refType=${refType}, keyType=${keyType}, scanType=${this.selectedScanType}, sourceType=${this.selectedSourceType}`);
        
        // For raw values, match the exact type
        if (this.selectedSourceType === 'raw-values') {
          // Check if type matches any of the expected types (with normalization)
          const normalizedScanType = this.selectedScanType.replace(/spacing-/g, '').replace(/Padding/g, '-padding').replace(/Gap/g, '-gap');
          const normalizedRefType = effectiveType.replace(/spacing-/g, '').replace(/Padding/g, '-padding').replace(/Gap/g, '-gap');
          
          let isMatch = normalizedRefType === normalizedScanType;
          
          // Add specific handling for fill, stroke, and color types
          if (!isMatch) {
            // For fill scan type, match fill references
            if (this.selectedScanType === 'fill' && normalizedRefType === 'fill') {
              isMatch = true;
            }
            
            // For stroke scan type, match stroke references
            if (this.selectedScanType === 'stroke' && normalizedRefType === 'stroke') {
              isMatch = true;
            }
            
            // For color scan type, match both fill and stroke
            if (this.selectedScanType === 'color' && (normalizedRefType === 'fill' || normalizedRefType === 'stroke')) {
              isMatch = true;
            }
          }
          
          console.log(`Raw values validation - normalizedScanType: ${normalizedScanType}, normalizedRefType: ${normalizedRefType}, isMatch: ${isMatch}`);
          if (!isMatch) {
            console.log(`Group invalid - type mismatch: key=${key}, type=${effectiveType}, expected=${this.selectedScanType}`);
          }
          return isMatch;
        }
        
        // For library variables, check library type
        if (['team-library', 'local-library', 'missing-library'].includes(this.selectedSourceType)) {
          // Check if the reference has the correct library type flag
          const isCorrectLibraryType = 
            (this.selectedSourceType === 'team-library' && firstRef.isTeamLibrary) ||
            (this.selectedSourceType === 'local-library' && firstRef.isLocalLibrary) ||
            (this.selectedSourceType === 'missing-library' && firstRef.isMissingLibrary);
          
          // If no specific token type, just check library type
          if (!this.selectedScanType || this.selectedScanType === this.selectedSourceType) {
            return isCorrectLibraryType;
          }
          
          // If token type specified, match both library type and token type
          const tokenType = this.selectedScanType.split('-').pop() || '';
          const matchesTokenType = refType === tokenType || keyType === tokenType;
          
          console.log(`Library validation - isCorrectLibraryType: ${isCorrectLibraryType}, tokenType: ${tokenType}, matchesTokenType: ${matchesTokenType}`);
          return isCorrectLibraryType && matchesTokenType;
        }
        
        // Default: include the group
        return true;
        */
      },
      // Add the clearResults method
      clearResults() {
        console.log('Clearing previous scan results');
        this.groupedReferences = {};
        this.scanType = null;
        this.isTokenScan = false;
        this.isLibraryVariableScan = false;
        this.scanComplete = false;
        this.scanProgress = 0;
        this.selectedVariableTypes = [];
        this.showVariableTypeFilters = false;
      },
      // Add this method with the other selection methods

      // Toggle variable type filter selection
      toggleVariableType(value) {
        console.log(`Toggle variable type: ${value}`);
        
        // Initialize the array if it doesn't exist
        if (!this.selectedVariableTypes) {
          this.selectedVariableTypes = [];
        }
        
        // Find the index of the value in the array
        const index = this.selectedVariableTypes.indexOf(value);
        
        if (index === -1) {
          // Not selected, add it
          this.selectedVariableTypes.push(value);
        } else {
          // Already selected, remove it
          this.selectedVariableTypes.splice(index, 1);
        }
        
        console.log(`Selected variable types: ${this.selectedVariableTypes.join(', ')}`);
      },
      
      // New method for single-selection variable type filter
      selectVariableTypeFilter(value) {
        console.log(`Select variable type filter: ${value}`);
        
        // Set the selected filter to the chosen value
        this.selectedVariableTypeFilter = value;
        
        // For backward compatibility, update the selectedVariableTypes array
        if (value === 'all') {
          this.selectedVariableTypes = [];
        } else {
          this.selectedVariableTypes = [value];
        }
        
        console.log(`Selected variable type filter: ${this.selectedVariableTypeFilter}`);
      },
      // Add helper method to map variable types to categories
      mapTypeToCategory(type) {
        switch (type) {
          case 'COLOR': return 'color';
          case 'FLOAT': return 'number';
          case 'STRING': return 'string';
          case 'BOOLEAN': return 'boolean';
          default: return type.toLowerCase();
        }
      },
      showError(message) {
        this.errorMessage = message;
        this.showErrorToast = true;
      },
      
      getVariableTypeIcon(type) {
        // Use the imported function from icons.js
        return icons.getVariableTypeIcon(type);
      }
    },
    watch: {
      activeLibraryTokens(newVal) {
        this.hasLibraryResults = newVal.length > 0 || this.inactiveLibraryTokens.length > 0;
      },
      inactiveLibraryTokens(newVal) {
        this.hasLibraryResults = newVal.length > 0 || this.activeLibraryTokens.length > 0;
      },
      activeTab(newTab) {
        if (newTab === 'library-tokens') {
          this.loadVariables();
        }
      }
    },
    mounted() {
      console.log('Vue app mounted');
      
      // Set raw-values as the default source type
      this.selectedSourceType = 'raw-values';
      this.selectedScanType = null;
      
      // Ensure selectedVariableTypes is properly initialized
      if (!this.selectedVariableTypes) {
        this.selectedVariableTypes = [];
      }

      // Single message handler
      window.onmessage = (event) => {
        const msg = event.data.pluginMessage;
        if (msg) {
          this.handlePluginMessage(msg);
        }
      };

      // Request initial selection state
      parent.postMessage({ 
        pluginMessage: { 
          type: 'get-selected-frame-ids' 
        }
      }, '*');
    },
    created() {
      // Ensure we stay on the tokens tab
      this.activeTab = 'tokens';
      
      // Set raw-values as the default source type
      this.selectedSourceType = 'raw-values';
      
      // Make sure arrays are initialized
      this.selectedVariableTypes = this.selectedVariableTypes || [];
      this.linkedVariables = this.linkedVariables || [];
      this.selectedVariableScanTypes = this.selectedVariableScanTypes || ['all'];
      
      // Initialize the variable type filter to 'all' by default
      this.selectedVariableTypeFilter = 'all';
    }
  }).mount('#app');

  // Hide loading indicator
  document.getElementById('loading').style.display = 'none';
}

// Resize handling
let isResizing = false;
let initialWidth, initialHeight, initialX, initialY;

const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 900;

function initResizeHandle() {
  const resizeHandle = document.querySelector('.resize-handle');
  if (!resizeHandle) return;
  
  resizeHandle.addEventListener('mousedown', startResize);
}

function startResize(e) {
  isResizing = true;
  initialWidth = window.innerWidth;
  initialHeight = window.innerHeight;
  initialX = e.clientX;
  initialY = e.clientY;

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  e.preventDefault(); // Prevent text selection while resizing
}

function handleResize(e) {
  if (!isResizing) return;

  const deltaX = e.clientX - initialX;
  const deltaY = e.clientY - initialY;

  const newWidth = Math.min(Math.max(initialWidth + deltaX, MIN_WIDTH), MAX_WIDTH);
  const newHeight = Math.min(Math.max(initialHeight + deltaY, MIN_HEIGHT), MAX_HEIGHT);

  try {
    // Send resize message to plugin
    parent.postMessage({
      pluginMessage: {
        type: 'resize',
        width: newWidth,
        height: newHeight
      }
    }, '*');
  } catch (error) {
    console.error('Failed to send resize message:', error);
  }
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
}
