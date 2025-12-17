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
      toggleTypeSelection(current, type) {
        const set = new Set(current || []);
        if (set.has(type)) {
          set.delete(type);
        } else {
          set.add(type);
        }
        return Array.from(set);
      },
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
        // Tabs
        activeTab: 'unlinked-values',

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
        actualProgress: 0,
        progressAnimationId: null,
        lastAnimationTimestamp: null,
        animationDuration: 300,
        scanStartTime: null,
        // Basic plugin state
        selectedScanType: null, // Currently selected token scan type
        selectedSourceType: 'raw-values', // Source type for scanning (raw, team-library, local-library)
        selectedFrameIds: [], // List of selected frame IDs, empty means scan entire page
        // Add back scan settings state
        showSettings: false,
        scanEntirePage: false,
        skipInstances: false,
        // Initialize groupedReferences as an empty object
        groupedReferences: {},
        // Initialize expandedGroups as a new Set
        expandedGroups: new Set(),
        windowSize: {
          width: 400,
          height: 600
        },
        isResizing: false,

        isPaused: false,
        currentScanNode: null,
        scanSummary: null,

        lastScannedType: null, // Add this to track the last scan type
        showHiddenOnly: false,
        selectedVariableTypes: [], // Array to store selected variable types for filtering
        isLibraryVariableScan: false,
        selectedLibraryFilterTypes: [],
        
        // Initialize all filter state variables
        paddingFilterType: 'all', // For vertical/horizontal padding
        radiusFilterType: 'all',  // For corner radius
        gapFilterType: 'all',     // For spacing gaps
        layoutFilterType: 'all',  // For layout properties
        effectsFilterType: 'all', // For effects properties
        
        // For variable type filtering
        selectedVariableTypeFilter: 'all',
        showVariableTypeFilters: false,
        availableVariableTypes: [],

        // Select components tab state
        componentScanMatch: 'default', // 'default' | 'modified'
        componentScanScope: 'page', // 'page' | 'file'
        isComponentScanning: false,
        componentScanProgress: 0,
        componentScanResult: null,

        // Add tokenScanOptions array
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
            description: 'Find frames with unlinked gap spacing',
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
            label: 'Layout',
            description: 'Find frames with unlinked layout properties',
            icon: 'layout'
          },
          {
            value: 'opacity',
            label: 'Opacity',
            description: 'Find layers with unlinked opacity',
            icon: 'opacity'
          },
          {
            value: 'effects',
            label: 'Effects',
            description: 'Find layers with unlinked effects',
            icon: 'effects'
          }
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
        const isLinkedLibrary = this.selectedSourceType === 'linked-library';
        
        console.log('Can start scan?', {
          hasSourceType,
          hasScanType,
          isLinkedLibrary,
          isScanning: this.isScanning
        });
        
        // Special case for linked-library: allow scanning without selecting a token type
        if (isLinkedLibrary) {
          return hasSourceType && !this.isScanning;
        }
        
        // For other scan types, require both source type and scan type
        return hasSourceType && hasScanType && !this.isScanning;
      },
      hasResults() {
        // Ensure groupedReferences exists and is an object
        if (!this.groupedReferences || typeof this.groupedReferences !== 'object') {
          return false;
        }
        
        const hasRefs = Object.keys(this.groupedReferences).length > 0;
        
        console.log('Has results?', {
          groupedReferences: this.groupedReferences,
          count: Object.keys(this.groupedReferences).length,
          hasRefs,
          scanType: this.scanType,
          selectedSourceType: this.selectedSourceType
        });
        
        return hasRefs;
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
        
        // Temporarily force show if we have any results
        const forceShow = hasGroupedRefs || hasFilteredResults;
        
        console.log('Show scan results?', {
          isScanning: this.isScanning,
          hasResults: this.hasResults,
          scanComplete: this.scanComplete,
          shouldShow,
          hasGroupedRefs,
          hasFilteredResults,
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
          groupCount: this.groupedReferences ? Object.keys(this.groupedReferences).length : 0,
          scanType: this.scanType,
          selectedSourceType: this.selectedSourceType,
          isLibraryVariableScan: this.isLibraryVariableScan
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
              
              // Apply hidden filter if enabled
              if (this.showHiddenOnly) {
                const filteredHiddenRefs = refs.filter(ref => {
                  // Include only hidden nodes
                  return ref.isHidden === true || !ref.isVisible;
                });
                
                // Skip empty groups after filtering
                if (filteredHiddenRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredHiddenRefs;
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
              
              // Apply corner radius filters
              if (this.selectedScanType === 'corner-radius' && this.radiusFilterType !== 'all') {
                const filteredRadiusRefs = refs.filter(ref => {
                  // Skip if not a radius reference
                  if (ref.type !== 'corner-radius' && ref.type !== 'cornerRadius') return false;
                  
                  // Get the corner type from the reference
                  const cornerType = ref.cornerType || ref.property || 'all';
                  
                  // Match the specific corner
                  return cornerType === this.radiusFilterType;
                });
                
                // Skip empty groups after filtering
                if (filteredRadiusRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredRadiusRefs;
              }
              
              // Apply padding filters
              if (this.selectedScanType === 'vertical-padding' && this.paddingFilterType !== 'all') {
                const filteredPaddingRefs = refs.filter(ref => {
                  // Skip if not a padding reference
                  if (ref.type !== 'vertical-padding' && ref.type !== 'verticalPadding') return false;
                  
                  // Get padding direction (top/bottom)
                  const paddingType = ref.paddingType || ref.property || 'all';
                  
                  // Match the specific padding direction
                  return paddingType === this.paddingFilterType;
                });
                
                // Skip empty groups after filtering
                if (filteredPaddingRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredPaddingRefs;
              }
              
              // Apply horizontal padding filters
              if (this.selectedScanType === 'horizontal-padding' && this.paddingFilterType !== 'all') {
                const filteredPaddingRefs = refs.filter(ref => {
                  // Skip if not a padding reference
                  if (ref.type !== 'horizontal-padding' && ref.type !== 'horizontalPadding') return false;
                  
                  // Get padding direction (left/right)
                  const paddingType = ref.paddingType || ref.property || 'all';
                  
                  // Match the specific padding direction
                  return paddingType === this.paddingFilterType;
                });
                
                // Skip empty groups after filtering
                if (filteredPaddingRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredPaddingRefs;
              }
              
              // Apply gap filters
              if (this.selectedScanType === 'gap' && this.gapFilterType !== 'all') {
                const filteredGapRefs = refs.filter(ref => {
                  // Skip if not a gap reference
                  if (ref.type !== 'gap') return false;
                  
                  // Get gap direction (horizontal/vertical)
                  const gapType = ref.gapType || 'all';
                  
                  // Match the specific gap direction
                  return gapType === this.gapFilterType;
                });
                
                // Skip empty groups after filtering
                if (filteredGapRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredGapRefs;
              }
              
              // Apply variable type filters for deleted variables
              if (this.scanType === 'deleted-variables' && this.selectedVariableTypeFilter !== 'all') {
                console.log('Applying variable type filter:', this.selectedVariableTypeFilter);
                const filteredVariableRefs = refs.filter(ref => {
                  // Get the variable category from the reference
                  const variableCategory = ref.variableCategory || ref.variableType || 
                                          (ref.currentValue && ref.currentValue.variableType) || 'other';
                  console.log(`Checking ref category: ${variableCategory} against filter: ${this.selectedVariableTypeFilter}`);
                  return variableCategory === this.selectedVariableTypeFilter;
                });
                
                // Skip empty groups after filtering
                if (filteredVariableRefs.length === 0) continue;
                
                // Use filtered refs
                refs = filteredVariableRefs;
              }
              
              if (
                this.isLibraryVariableScan &&
                this.scanType === 'linked-library' &&
                Array.isArray(this.selectedLibraryFilterTypes) &&
                this.selectedLibraryFilterTypes.length > 0
              ) {
                const filteredByType = refs.filter(ref => {
                  const category = this.getLinkedLibraryTokenCategory(ref);
                  return category ? this.selectedLibraryFilterTypes.includes(category) : false;
                });

                if (filteredByType.length === 0) {
                  continue;
                }

                refs = filteredByType;
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
      linkedLibraryFilterOptions() {
        if (!this.isLibraryVariableScan || this.scanType !== 'linked-library') {
          return [];
        }

        const baseOptions = [
          { value: 'typography', label: 'Typography', description: 'Text tokens', icon: 'typography' },
          { value: 'gap', label: 'Gap', description: 'Auto-layout gaps', icon: 'gap' },
          { value: 'horizontal-padding', label: 'H Padding', description: 'Horizontal padding tokens', icon: 'horizontal-padding' },
          { value: 'vertical-padding', label: 'V Padding', description: 'Vertical padding tokens', icon: 'vertical-padding' },
          { value: 'corner-radius', label: 'Radius', description: 'Corner radius tokens', icon: 'radius' },
          { value: 'fill', label: 'Fill Colors', description: 'Fill color tokens', icon: 'fill' },
          { value: 'stroke', label: 'Stroke Colors', description: 'Stroke color tokens', icon: 'stroke' },
          { value: 'layout', label: 'Layout', description: 'Layout + dimension tokens', icon: 'layout' },
          { value: 'opacity', label: 'Opacity', description: 'Opacity tokens', icon: 'opacity' },
          { value: 'effects', label: 'Effects', description: 'Shadow & blur tokens', icon: 'effects' },
        ];

        const counts = {};

        Object.values(this.groupedReferences || {}).forEach(group => {
          const refs = Array.isArray(group) ? group : group?.refs;
          if (!Array.isArray(refs)) {
            return;
          }

          refs.forEach(ref => {
            const category = this.getLinkedLibraryTokenCategory(ref);
            if (!category) {
              return;
            }
            counts[category] = (counts[category] || 0) + 1;
          });
        });

        return baseOptions.map(option => ({
          ...option,
          count: counts[option.value] || 0,
        }));
      },

      designTokenOptions() {
        // Filter for standard design token options (typography, spacing, padding, radius, colors)
        const options = this.tokenScanOptions.filter(option => 
          ['typography', 'gap', 'horizontal-padding', 'vertical-padding', 'corner-radius', 'fill', 'stroke', 'layout'].includes(option.value)
        );
        console.log('Design token options:', options.map(o => o.value));
        return options;
      },
      
      // Source type options (missing library, deleted variables, raw values)
      librarySourceOptions() {
        return [
          {
            value: 'raw-values',
            label: 'Raw Values',
            description: 'Find unlinked design tokens that need to be connected to variables',
            icon: 'raw-value'
          },
          {
            value: 'linked-library',
            label: 'Linked Tokens',
            description: 'Identify tokens currently linked from external libraries (variables + styles)',
            icon: 'team-lib'
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
        

        
        // For deleted-variables source, no additional token type selection needed
        if (this.selectedSourceType === 'linked-library') {
          return [];
        }
        
        // Default fallback - return all options
        return this.tokenScanOptions;
      },
      // Add instruction state computed properties
      showSelectionInstruction() {
        // Show if user hasn't selected anything AND hasn't enabled scan entire page
        // Remove the selectedSourceType condition to show this instruction more broadly
        return !this.hasSelection && !this.scanEntirePage;
      },
      showVariableTypeInstruction() {
        // Show if user has selected a source type that requires variable type selection
        // but hasn't selected a variable type yet
        return this.selectedSourceType === 'raw-values' && !this.selectedScanType;
      },
    },
    methods: {
      refreshPlugin() {
        // Soft reset without reloading the iframe to avoid sandbox warnings
        // Reset core state
        this.isScanning = false;
        this.scanError = false;
        this.scanComplete = false;
        this.scanProgress = 0;
        this.actualProgress = 0;
        this.lastScannedType = null;
        this.successMessage = '';
        this.errorMessage = '';
        this.showSuccessToast = false;
        this.showErrorToast = false;
        
        // Selection and scope
        this.hasSelection = false;
        this.selectedCount = 0;
        this.selectedFrameIds = [];
        this.scanEntirePage = false;
        this.skipInstances = false;
        
        // Filters and options
        this.selectedSourceType = 'raw-values';
        this.selectedScanType = null;
        this.selectedVariableTypes = [];
        this.selectedVariableTypeFilter = 'all';
        this.availableVariableTypes = [];
        this.showVariableTypeFilters = false;
        this.paddingFilterType = 'all';
        this.radiusFilterType = 'all';
        this.gapFilterType = 'all';
        this.layoutFilterType = 'all';
        this.effectsFilterType = 'all';
        this.showHiddenOnly = false;
        
        // Results and UI collections
        this.groupedReferences = {};
        this.expandedGroups = new Set();
        this.selectedLibraryFilterTypes = [];
        
        // Reset UI affordances
        this.showSettings = false;
        const tokenTypeSection = document.querySelector('.token-type-section');
        const resultsSection = document.querySelector('.results-section');
        if (tokenTypeSection) tokenTypeSection.classList.remove('selected');
        if (resultsSection) {
          resultsSection.classList.remove('scan-complete');
          resultsSection.classList.remove('scroll-target');
        }
        const pluginContainer = document.querySelector('.plugin-container');
        if (pluginContainer) pluginContainer.scrollTop = 0;
        
        // Ask plugin for current selection again
        try {
          parent.postMessage({ pluginMessage: { type: 'get-selected-frame-ids' } }, '*');
        } catch (e) {
          console.warn('Failed to request selection after refresh:', e);
        }
      },
      getLibraryDisplayName(ref) {
        if (!ref) {
          return '';
        }

        const disallowedSegment = /(token|variable|mode|kind|key|collection|libraryid|tokenid)/i;

        const extractName = (value) => {
          if (!value) {
            return '';
          }

          if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
              return '';
            }

            const patterns = [
              /"libraryName"\s*[:=]\s*"([^"]+)"/i,
              /"tokenLibraryName"\s*[:=]\s*"([^"]+)"/i,
              /"library"\s*[:=]\s*"([^"]+)"/i,
              /libraryName\s*[:=]\s*([^,"\)\}\]]+)/i,
            ];

            for (const pattern of patterns) {
              const match = trimmed.match(pattern);
              if (match && match[1]) {
                const candidate = match[1].trim().replace(/[)\]}]+$/, '');
                if (candidate && !disallowedSegment.test(candidate)) {
                  return candidate;
                }
              }
            }

            const quotedSegments = trimmed
              .split('"')
              .filter((_, index) => index % 2 === 1)
              .map(segment => segment.trim())
              .filter(Boolean);

            for (let i = quotedSegments.length - 1; i >= 0; i -= 1) {
              const segment = quotedSegments[i];
              if (!segment || disallowedSegment.test(segment) || segment.includes(':')) {
                continue;
              }
              return segment;
            }

            const colonIndex = trimmed.lastIndexOf(':');
            if (colonIndex !== -1 && colonIndex + 1 < trimmed.length) {
              const afterColon = trimmed.slice(colonIndex + 1).replace(/["\)\(\{\}]/g, '').trim();
              if (afterColon && !disallowedSegment.test(afterColon)) {
                return afterColon;
              }
            }

            const parenSegments = trimmed
              .split(/[\(\)]/)
              .map(part => part.trim())
              .filter(Boolean);

            for (let i = parenSegments.length - 1; i >= 0; i -= 1) {
              const segment = parenSegments[i];
              if (!segment || disallowedSegment.test(segment) || segment.includes(':')) {
                continue;
              }
              return segment;
            }

            return '';
          }

          if (typeof value === 'object') {
            if (value && typeof value.name === 'string' && value.name.trim()) {
              return value.name.trim();
            }

            if (value && typeof value.title === 'string' && value.title.trim()) {
              return value.title.trim();
            }
          }

          return '';
        };

        const candidates = [
          extractName(ref.libraryName),
          extractName(ref.currentValue?.libraryName),
          extractName(ref.currentValue?.library),
          extractName(ref.library),
          extractName(ref.currentValue?.libraryInfo),
        ].filter(name => name && name.length > 0);

        return candidates[0] || '';
      },
      getLinkedLibraryTokenCategory(ref) {
        if (!ref || ref.type !== 'linked-library') {
          return null;
        }

        const property = (ref.property || '').toLowerCase();
        const tokenKind = (ref.currentValue?.tokenKind || '').toLowerCase();
        const variableCategory = (
          ref.variableCategory ||
          ref.variableType ||
          ref.currentValue?.variableType ||
          ''
        ).toLowerCase();

        const contains = (value) => property.includes(value);

        if (tokenKind === 'style') {
          if (contains('textstyle')) return 'typography';
          if (contains('fill')) return 'fill';
          if (contains('stroke')) return 'stroke';
          if (contains('effect')) return 'effects';
          if (contains('grid')) return 'layout';
        }

        if (variableCategory) {
          if (variableCategory.includes('typography')) return 'typography';
          if (variableCategory.includes('radius')) return 'corner-radius';
          if (variableCategory.includes('opacity')) return 'opacity';
          if (variableCategory.includes('effect')) return 'effects';
          if (variableCategory.includes('layout')) return 'layout';
          if (variableCategory.includes('color')) {
            if (contains('stroke')) return 'stroke';
            return 'fill';
          }
          if (variableCategory.includes('spacing')) {
            if (contains('horizontalpadding') || contains('paddingleft') || contains('paddingright')) {
              return 'horizontal-padding';
            }
            if (contains('verticalpadding') || contains('paddingtop') || contains('paddingbottom')) {
              return 'vertical-padding';
            }
            if (contains('gap') || contains('itemspacing')) {
              return 'gap';
            }
          }
        }

        if (contains('gap') || contains('itemspacing')) return 'gap';
        if (contains('horizontalpadding') || contains('paddingleft') || contains('paddingright')) return 'horizontal-padding';
        if (contains('verticalpadding') || contains('paddingtop') || contains('paddingbottom')) return 'vertical-padding';
        if (contains('corner') || contains('radius')) return 'corner-radius';
        if (contains('stroke')) return 'stroke';
        if (contains('fill') || contains('background')) return 'fill';
        if (contains('opacity')) return 'opacity';
        if (contains('effect') || contains('shadow') || contains('blur')) return 'effects';
        if (contains('layout') || contains('grid') || contains('width') || contains('height') || contains('auto')) return 'layout';
        if (contains('text') || contains('font')) return 'typography';

        return null;
      },
      getReferenceClass(ref) {
        if (!ref) return 'unknown-reference';
        
        if (ref.isMissingLibrary) return 'missing-library-reference';
        if (ref.isInactiveLibrary) return 'inactive-library-reference';
        if (ref.isTeamLibrary) return 'team-library-reference';
        if (ref.isLocalLibrary) return 'local-library-reference';
        if (ref.isUnlinked) return 'unlinked-reference';
        return 'unknown-reference';
      },
      getReferenceDisplayType(ref) {
        if (!ref) return 'Unknown';
        
        if (ref.type === 'linked-library') {
          const kind = ref?.currentValue?.tokenKind;
          if (kind === 'variable') return 'Linked Library Variable';
          if (kind === 'style') return 'Linked Library Style';
          return 'Linked Library Token';
        }

        if (ref.isMissingLibrary) {
          // For missing variables, show the token type label
          const variableType = ref.variableCategory || 
                             ref.variableType || 
                             (ref.currentValue && ref.currentValue.variableType) || 
                             'other';
          
          // Map variable type to user-friendly label
          switch(variableType.toLowerCase()) {
            case 'typography': return 'Typography Token';
            case 'color': return 'Color Token';
            case 'spacing': return 'Spacing Token';
            case 'radius': return 'Radius Token';
            case 'effect': return 'Effect Token';
            case 'layout': return 'Layout Token';
            case 'opacity': return 'Opacity Token';
            default: return 'Design Token';
          }
        }
        return 'Unlinked Value';
      },
      handleScanScopeChange() {
        if (this.scanEntirePage) {
          this.selectedFrameIds = [];
        }
        // Notify the plugin about the scan scope change
        parent.postMessage({ pluginMessage: {
          type: 'scan-scope-changed',
          scanEntirePage: this.scanEntirePage
        }}, '*');
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
          this.selectedLibraryFilterTypes = [];
          
          // Reset variable type filters for missing library scans
          this.selectedVariableTypes = [];
          this.showVariableTypeFilters = false;
        }
        
        // Set scanning state
        this.isScanning = true;
        this.scanProgress = 0;
        this.actualProgress = 0;
        this.lastAnimationTimestamp = null;
        
        // Track scan start time for minimum animation duration
        this.scanStartTime = Date.now();
        
        // Start smooth progress animation
        this.startProgressAnimation();
        
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
          scanDescription = this.getSourceTypeLabel(this.selectedSourceType);
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
          skipInstances: this.skipInstances,
          isRescan,
          isLibraryVariableScan: this.selectedSourceType !== 'raw-values',
          // Include the source type for backend processing
          sourceType: this.selectedSourceType,
          variableTypes: []
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
        
        // Stop progress animation
        this.stopProgressAnimation();
        
        this.isScanning = false;
        this.scanComplete = true;
        this.scanProgress = 100;
        
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
        
        // Set actual progress to 100% immediately
        this.actualProgress = 100;
        
        // Check if minimum animation duration has elapsed
        const now = Date.now();
        const elapsed = this.scanStartTime ? now - this.scanStartTime : 0;
        
        // Use a shorter minimum animation duration for a more responsive feel
        const minAnimationDuration = 300; // Reduced from typical 800ms
        const remainingTime = Math.max(0, minAnimationDuration - elapsed);
        
        // If we're already close to 100%, use a shorter animation
        const currentProgress = this.scanProgress || 0;
        const completionTimeMultiplier = currentProgress > 90 ? 0.5 : 1.0;
        const adjustedRemainingTime = Math.round(remainingTime * completionTimeMultiplier);
        
        // If minimum duration hasn't elapsed, delay completion
        if (adjustedRemainingTime > 0) {
          // Continue animation to 100% over remaining time, but 
          // only wait briefly if we're already close to completion
          setTimeout(() => {
            this.completeScan(msg);
          }, adjustedRemainingTime);
        } else {
          // Complete immediately if minimum duration has elapsed
          this.completeScan(msg);
        }
      },
      
      // Complete the scan with all UI updates
      completeScan(msg) {
        // Stop progress animation
        this.stopProgressAnimation();
        
        // Ensure progress is exactly 100% at the end
        this.scanProgress = 100;
        this.actualProgress = 100;
        
        // Update states
        this.isScanning = false;
        this.scanComplete = true;
        this.selectedLibraryFilterTypes = [];

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
        // Stop any in-flight scans and clear tab-specific UI state
        this.isScanning = false;
        this.scanProgress = 0;
        this.scanError = false;
        this.scanComplete = false;
        this.groupedReferences = {};
        this.expandedGroups = new Set();
        this.selectedLibraryFilterTypes = [];

        this.isComponentScanning = false;
        this.componentScanProgress = 0;
        this.componentScanResult = null;

        this.activeTab = tab;
      },

      startUnlinkedTokensScan() {
        // Uses the existing broken-variable-references backend.
        // This scan respects selection vs scanEntirePage, using selectedFrameIds already tracked.
        this.isScanning = true;
        this.scanProgress = 0;
        this.actualProgress = 0;
        this.scanStartTime = Date.now();
        this.startProgressAnimation();

        // Clear previous results
        this.groupedReferences = {};
        this.expandedGroups = new Set();
        this.scanComplete = false;
        this.selectedLibraryFilterTypes = [];

        try {
          parent.postMessage({
            pluginMessage: this.makeSerializable({
              type: 'scan-for-tokens',
              scanType: 'fill',
              scanEntirePage: this.scanEntirePage,
              selectedFrameIds: this.scanEntirePage ? [] : (this.selectedFrameIds || []),
              ignoreHiddenLayers: this.ignoreHiddenLayers,
              skipInstances: this.skipInstances,
              isRescan: false,
              isLibraryVariableScan: true,
              sourceType: 'missing-library',
              variableTypes: []
            })
          }, '*');
        } catch (error) {
          console.error('Failed to start unlinked token scan:', error);
          this.isScanning = false;
          this.showError('Failed to start scan');
        }
      },

      startComponentScan() {
        this.isComponentScanning = true;
        this.componentScanProgress = 0;
        this.componentScanResult = null;

        try {
          parent.postMessage({
            pluginMessage: this.makeSerializable({
              type: 'scan-similar-components',
              match: this.componentScanMatch,
              scope: this.componentScanScope
            })
          }, '*');
        } catch (error) {
          console.error('Failed to start component scan:', error);
          this.isComponentScanning = false;
          this.showError('Failed to start component scan');
        }
      },

      stopComponentScan() {
        this.isComponentScanning = false;
        try {
          parent.postMessage({
            pluginMessage: { type: 'stop-similar-components-scan' }
          }, '*');
        } catch (error) {
          console.warn('Failed to send stop component scan message:', error);
        }
      },

      clearComponentResults() {
        this.componentScanResult = null;
        this.componentScanProgress = 0;
        this.isComponentScanning = false;
      },

      selectComponentScanPage(pageId) {
        if (!this.componentScanResult || !Array.isArray(this.componentScanResult.pages)) {
          return;
        }

        const page = this.componentScanResult.pages.find(p => p.pageId === pageId);
        if (!page || !Array.isArray(page.nodeIds) || page.nodeIds.length === 0) {
          return;
        }

        parent.postMessage({
          pluginMessage: {
            type: 'select-similar-components',
            pageId,
            nodeIds: page.nodeIds
          }
        }, '*');
      },

      selectComponentScanAll() {
        if (!this.componentScanResult || !Array.isArray(this.componentScanResult.nodeIds) || this.componentScanResult.nodeIds.length === 0) {
          return;
        }

        parent.postMessage({
          pluginMessage: {
            type: 'select-similar-components',
            pageId: this.componentScanResult.pageId,
            nodeIds: this.componentScanResult.nodeIds
          }
        }, '*');
      },

      selectComponentScanNode(nodeId, event) {
        if (event) {
          event.stopPropagation();
        }

        if (!nodeId) {
          return;
        }

        parent.postMessage({
          pluginMessage: {
            type: 'select-node',
            nodeId
          }
        }, '*');
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

      getProgressBarColor(context = 'default') {
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
      
      getStartScanButtonTitle() {
        if (!this.hasSelection && !this.scanEntirePage) {
          return 'Select frames/components/sections or enable "Scan Entire Page"';
        }
        if (!this.selectedSourceType) {
          return 'Select a source type';
        }
        if (this.selectedSourceType === 'raw-values' && !this.selectedScanType) {
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
            this.actualProgress = 0;
            this.lastAnimationTimestamp = null;
            this.scanStartTime = Date.now();
            this.scanType = data.scanType || this.scanType; // Preserve the scan type
            this.startProgressAnimation();
            break;
          case 'clear-results':
            // Clear results upon plugin request
            this.clearResults();
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

          case 'raw-values-result':
            // Default handling for raw values
            this.groupedReferences = data.references || {};
            this.isScanning = false;
            this.scanComplete = true;
            break;
          case 'missing-references-result':
            // Handle missing references result
            this.handleScanComplete({
              type: 'scan-complete',
              references: data.references,
              scanType: data.scanType || 'unknown'
            });
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

          case 'similar-components-scan-started':
            this.isComponentScanning = true;
            this.componentScanProgress = 0;
            this.componentScanResult = null;
            break;
          case 'similar-components-scan-progress':
            if (typeof data.progress === 'number') {
              this.componentScanProgress = Math.min(100, Math.max(0, data.progress));
            }
            break;
          case 'similar-components-scan-complete':
            this.isComponentScanning = false;
            this.componentScanProgress = 100;
            this.componentScanResult = data.result || null;
            break;
          case 'similar-components-scan-error':
            this.isComponentScanning = false;
            this.componentScanProgress = 0;
            this.showError(data.message || 'Component scan failed');
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
        
        // The references are already grouped by the scanner, just use them directly
        this.groupedReferences = msg.references;
        
        // Ensure we know which scan type produced these
        this.scanType = msg.sourceType || 'deleted-variables';
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
        console.log('Grouped references structure:', this.groupedReferences);
        console.log('First group example:', Object.values(this.groupedReferences)[0]);
        
        // Ensure the UI shows the results
        this.showSuccessToast = true;
        this.successMessage = 'Found missing library variables!';
        setTimeout(() => { this.showSuccessToast = false; }, 3000);
      },
      handleScanProgress(msg) {
        if (!msg || typeof msg.progress !== 'number') {
          return;
        }

        // Clamp and store the latest reported progress
        const normalizedProgress = Math.min(100, Math.max(0, msg.progress));
        this.actualProgress = normalizedProgress;

        // Update scanning state based on message metadata
        const messageIndicatesScanning = msg.isScanning !== false;
        if (messageIndicatesScanning) {
          this.isScanning = true;
        } else {
          this.isScanning = false;
        }

        // Ensure the animation loop is running whenever we're scanning
        if (this.isScanning && !this.progressAnimationId) {
          this.lastAnimationTimestamp = null;
          this.startProgressAnimation();
        }

        // When scanning has stopped, snap to the reported progress and halt animation
        if (!this.isScanning) {
          this.scanProgress = normalizedProgress;
          this.stopProgressAnimation();
          return;
        }

        // Log progress updates for debugging visibility
        console.log(`Progress update: ${normalizedProgress}%`);

        // Avoid lingering below completion once we're effectively done
        if (normalizedProgress >= 99.5) {
          this.scanProgress = normalizedProgress;
        }
      },
      
      // Start smooth progress animation
      startProgressAnimation() {
        // Cancel any existing animation
        if (this.progressAnimationId) {
          cancelAnimationFrame(this.progressAnimationId);
        }
        
        // Initialize timing variables for better animation control
        this.progressAnimationId = null;
        this.lastAnimationTimestamp = null;
        this.animationDuration = 300; // Base animation duration in ms
        
        // Start the animation loop
        this.animateProgress();
      },
      
      // Smooth progress animation loop with predictable easing
      animateProgress() {
        if (!this.isScanning) {
          this.scanProgress = typeof this.actualProgress === 'number'
            ? this.actualProgress
            : this.scanProgress;
          this.stopProgressAnimation();
          return;
        }

        // Calculate elapsed time since last frame
        const now = Date.now();
        const elapsed = this.lastAnimationTimestamp === null
          ? this.animationDuration
          : Math.max(0, now - this.lastAnimationTimestamp);
        this.lastAnimationTimestamp = now;
        
        // Calculate target progress based on actual progress
        const targetProgress = typeof this.actualProgress === 'number'
          ? this.actualProgress
          : 0;
        
        // Calculate progress difference
        const progressDiff = targetProgress - this.scanProgress;
        
        // Determine the proportion of progress we should apply this frame
        const duration = this.animationDuration || 300;
        const easedRatio = duration === 0 ? 1 : Math.min(1, elapsed / duration);

        if (Math.abs(progressDiff) < 0.2) {
          this.scanProgress = targetProgress;
        } else {
          this.scanProgress += progressDiff * easedRatio;
        }

        // Ensure the visual progress stays within bounds
        this.scanProgress = Math.min(100, Math.max(0, this.scanProgress));
        
        // Continue animation if still scanning
        this.progressAnimationId = requestAnimationFrame(() => this.animateProgress());
      },
      
      // Stop progress animation
      stopProgressAnimation() {
        if (this.progressAnimationId) {
          cancelAnimationFrame(this.progressAnimationId);
          this.progressAnimationId = null;
        }
        this.lastAnimationTimestamp = null;
      },
      
      selectScanType(value) {
        console.log(`Selected scan type: ${value}`);
        
        // Always set the selected value (no toggling)
        // Clear previous results when switching scan type to avoid stale display
        this.clearResults();
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
          } else if (typeKey === 'linked-library') {
            const libraryDisplayName = typeof this.getLibraryDisplayName === 'function'
              ? this.getLibraryDisplayName(result)
              : (result.libraryName || (value && value.libraryName) || 'Library');
            const tokenLabel = result.currentValue?.tokenName || result.variableName || 'Unknown Token';
            key = `${typeKey}:${libraryDisplayName}:${tokenLabel}`;
          } else if (['team-library', 'local-library', 'deleted-variables'].includes(typeKey)) {
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

      selectAllResults(event) {
        if (event) {
          event.stopPropagation();
        }

        if (!this.filteredResults || typeof this.filteredResults !== 'object') {
          console.warn('No filtered results available for selectAllResults');
          return;
        }

        const aggregateRefs = [];

        Object.values(this.filteredResults).forEach(group => {
          if (!group) {
            return;
          }

          const refs = Array.isArray(group) ? group : group.refs;

          if (Array.isArray(refs) && refs.length > 0) {
            aggregateRefs.push(...refs);
          }
        });

        if (aggregateRefs.length === 0) {
          console.warn('No references to select in selectAllResults');
          return;
        }

        this.selectGroup(aggregateRefs, event);
      },
      isLinkedLibraryFilterSelected(value) {
        if (!Array.isArray(this.selectedLibraryFilterTypes)) {
          return false;
        }
        return this.selectedLibraryFilterTypes.includes(value);
      },
      toggleLinkedLibraryFilter(value, event, isDisabled = false) {
        if (isDisabled) {
          return;
        }

        if (event) {
          event.stopPropagation();
        }

        if (!value) {
          return;
        }

        if (!Array.isArray(this.selectedLibraryFilterTypes)) {
          this.selectedLibraryFilterTypes = [];
        }

        const existingIndex = this.selectedLibraryFilterTypes.indexOf(value);
        if (existingIndex >= 0) {
          this.selectedLibraryFilterTypes.splice(existingIndex, 1);
        } else {
          this.selectedLibraryFilterTypes.push(value);
        }
      },
      clearLinkedLibraryFilters(event) {
        if (event) {
          event.stopPropagation();
        }
        this.selectedLibraryFilterTypes = [];
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
        // Clear any existing results when switching source types
        this.clearResults();
        
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
          case 'linked-library': return 'linked library tokens';
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
        if (['team-library', 'local-library', 'deleted-variables'].includes(this.selectedSourceType)) {
          // Check if the reference has the correct library type flag
          const isCorrectLibraryType = 
            (this.selectedSourceType === 'team-library' && firstRef.isTeamLibrary) ||
            (this.selectedSourceType === 'local-library' && firstRef.isLocalLibrary) ||
            (this.selectedSourceType === 'deleted-variables' && firstRef.isMissingLibrary);
          
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
        this.selectedLibraryFilterTypes = [];
      },
      // Add this method with the other selection methods

      // Toggle variable type filter selection (single-select behavior)
      toggleVariableType(value) {
        console.log(`Toggle variable type (single-select): ${value}`);
        
        if (!Array.isArray(this.selectedVariableTypes)) {
          this.selectedVariableTypes = [];
        }
        
        const isAlreadyOnlySelection = this.selectedVariableTypes.length === 1 && this.selectedVariableTypes[0] === value;
        
        // If clicking the same selected value when it's the only one, clear selection; otherwise set as the only selection
        this.selectedVariableTypes = isAlreadyOnlySelection ? [] : [value];
        
        console.log(`Selected variable type: ${this.selectedVariableTypes.join(', ') || 'none'}`);
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
      },
      getRawVariableValue(ref) {
        if (!ref || !ref.currentValue) return 'No Value';
        
        // Handle different value types
        const value = ref.currentValue;
        
        // Handle color values
        if (value.r !== undefined && value.g !== undefined && value.b !== undefined) {
          const r = Math.round(value.r * 255);
          const g = Math.round(value.g * 255);
          const b = Math.round(value.b * 255);
          const a = value.a !== undefined ? value.a : 1;
          return a === 1 ? `RGB(${r}, ${g}, ${b})` : `RGBA(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
        }
        
        // Handle typography values
        if (value.fontFamily || value.fontSize || value.fontWeight) {
          const family = value.fontFamily || '';
          const size = value.fontSize ? `${value.fontSize}px` : '';
          const weight = value.fontWeight || '';
          return [family, weight, size].filter(Boolean).join(' ');
        }
        
        // Handle numeric values (spacing, radius, etc.)
        if (typeof value === 'number' || !isNaN(parseFloat(value))) {
          return `${value}px`;
        }
        
        // Handle opacity values
        if (typeof value === 'number' && value >= 0 && value <= 1) {
          return `${Math.round(value * 100)}%`;
        }
        
        // Default to string representation
        return String(value);
      },
      async unbindNodeVariable(ref) {
        if (!ref || !ref.nodeId) return;
        
        try {
          parent.postMessage({
            pluginMessage: {
              type: 'unbind-node-variable',
              nodeId: ref.nodeId,
              property: ref.property,
              currentValue: ref.currentValue
            }
          }, '*');
        } catch (error) {
          console.error('Failed to unlink variable:', error);
          this.showError('Failed to unlink variable: ' + error.message);
        }
      },
      
      async unbindNodeVariableGroup(refs) {
        if (!refs || !refs.length) return;
        
        try {
          parent.postMessage({
            pluginMessage: {
              type: 'unbind-node-variable-group',
              refs: refs.map(ref => ({
                nodeId: ref.nodeId,
                property: ref.property,
                currentValue: ref.currentValue
              }))
            }
          }, '*');
        } catch (error) {
          console.error('Failed to unlink group variables:', error);
          this.showError('Failed to unlink variables: ' + error.message);
        }
      },

      openStripePayment() {
        window.open('https://buy.stripe.com/8wM7wb49NeFD5UYcMM', '_blank');
      },
      
      // Add methods to dismiss toast notifications
      dismissToast() {
        this.showSuccessToast = false;
      },
      
      dismissErrorToast() {
        this.showErrorToast = false;
      },
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
      // Remove tab initialization
      
      // Set raw-values as the default source type
      this.selectedSourceType = 'raw-values';
      
      // Make sure arrays are initialized
      this.selectedVariableTypes = this.selectedVariableTypes || [];
      this.linkedVariables = this.linkedVariables || [];
      this.selectedVariableScanTypes = this.selectedVariableScanTypes || ['all'];
      
      // Initialize the variable type filter to 'all' by default
      this.selectedVariableTypeFilter = 'all';
    },
    
    beforeUnmount() {
      // Clean up animation frames to prevent memory leaks
      this.stopProgressAnimation();
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
