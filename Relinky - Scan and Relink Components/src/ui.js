// Import the CSS file so webpack can process it
import './styles.css';

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
        activeTab: 'tokens',
        selectedScanType: null,
        selectedSourceType: null, // New: Selected library source type
        scanEntirePage: false,
        isScanning: false,
        scanProgress: 0,
        scanError: false,
        scanComplete: false,
        groupedReferences: {},
        expandedGroups: new Set(),
        hasSelection: false,
        selectedCount: 0,
        hasInstances: false,
        isWatching: false,
        isLibraryVariableScan: false, // Whether the current scan is a library variable scan
        paddingFilterType: 'all', // Filter type for padding (all, top, bottom, left, right)
        radiusFilterType: 'all', // Filter type for corner radius (all, top-left, top-right, bottom-left, bottom-right)
        gapFilterType: 'all', // Filter type for gap (all, vertical, horizontal)
        tokenScanOptions: [
          {
            value: 'typography',
            label: 'Typography',
            description: 'Find text layers missing text style variables',
            icon: 'typography'
          },
          {
            value: 'vertical-gap',
            label: 'Vertical Gap',
            description: 'Find frames with unlinked vertical gap',
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
        showSuccessToast: false,
        successMessage: '',
        selectingNodeIds: new Set(), // Track which groups are being selected
        libraryResults: {},  // Separate results for library scan
        variableAnalysis: null,
        isAnalyzing: false,
        showSettings: false,
        ignoreHiddenLayers: false,
        icons: {
          'typography': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="type">
              <path d="M19.9567 8.71249V9.97212H14.9434V8.71249H19.9567ZM16.4045 6.39478H17.8909V15.6153C17.8909 16.0351 17.9518 16.35 18.0735 16.56C18.1995 16.7657 18.3591 16.9043 18.5522 16.9757C18.7495 17.0428 18.9574 17.0764 19.1757 17.0764C19.3395 17.0764 19.4738 17.068 19.5788 17.0512C19.6838 17.0302 19.7677 17.0134 19.8307 17.0009L20.133 18.3361C20.0323 18.3738 19.8916 18.4116 19.7111 18.4494C19.5305 18.4914 19.3017 18.5124 19.0246 18.5124C18.6047 18.5124 18.1932 18.4221 17.7901 18.2416C17.3912 18.061 17.0595 17.786 16.795 17.4165C16.5347 17.047 16.4045 16.581 16.4045 16.0183V6.39478Z M3.8667 6.87338V5.48779H13.5406V6.87338H9.48464V18.3864H7.9227V6.87338H3.8667Z" fill="currentColor"/>
            </g>
          </svg>`,
          
          'stroke': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="stroke">
              <path d="M17.1266 17.1267L6.87317 6.87329" stroke="currentColor" stroke-linecap="round"/>
              <rect x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="currentColor" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'spacing': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="Gap">
              <path d="M20.7651 3.39014H19C17.3431 3.39014 16 4.73328 16 6.39014V17.6096C16 19.2665 17.3431 20.6096 19 20.6096H20.7651" stroke="currentColor" stroke-linecap="round"/>
              <path d="M3.23486 3.39014H4.99998C6.65683 3.39014 7.99998 4.73328 7.99998 6.39014V17.6096C7.99998 19.2665 6.65683 20.6096 4.99998 20.6096H3.23486" stroke="currentColor" stroke-linecap="round"/>
              <path d="M12 6.92114V17.2227" stroke="currentColor" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'radius': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="corner">
              <path id="Vector 1" d="M2.62552 8.80389V6.99321C2.62552 4.78407 4.41638 2.99321 6.62552 2.99321H8.86661" stroke="white" stroke-linecap="round"/>
              <path id="Vector 3" d="M21.3745 15.1961L21.3745 17.0068C21.3745 19.2159 19.5836 21.0068 17.3745 21.0068L15.1334 21.0068" stroke="white" stroke-linecap="round"/>
              <path id="Vector 2" d="M15.5638 2.99321L17.3745 2.99321C19.5836 2.99321 21.3745 4.78407 21.3745 6.99321V9.23431" stroke="white" stroke-linecap="round"/>
              <path id="Vector 4" d="M8.4362 21.0068L6.62552 21.0068C4.41638 21.0068 2.62552 19.2159 2.62552 17.0068L2.62552 14.7657" stroke="white" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'radius-top-left': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="top-left">
              <path id="Vector 1" d="M4 19V10C4 6 7 3 11 3H20" stroke="white" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'radius-top-right': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="top-right">
              <path id="Vector 1" d="M4 3H13C17 3 20 6 20 10V19" stroke="white" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'radius-bottom-left': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="bottom-left">
              <path id="Vector 1" d="M20 3V12C20 16 17 19 13 19H4" stroke="white" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'radius-bottom-right': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="bottom-right">
              <path id="Vector 1" d="M4 3V12C4 16 7 19 11 19H20" stroke="white" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'vertical-padding': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="vertical">
              <path d="M20.7102 3.80981H3.34668" stroke="currentColor" stroke-linecap="round"/>
              <path d="M20.7102 20.3337H3.34668" stroke="currentColor" stroke-linecap="round"/>
              <rect x="7.87646" y="7.87646" width="8.24707" height="8.24707" rx="2.5" stroke="currentColor" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'horizontal-padding': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="horizontal">
              <path d="M3.76648 3.39014L3.76648 20.7537" stroke="currentColor" stroke-linecap="round"/>
              <path d="M20.2904 3.39014L20.2904 20.7537" stroke="currentColor" stroke-linecap="round"/>
              <rect x="7.87646" y="7.87646" width="8.24707" height="8.24707" rx="2.5" stroke="currentColor" stroke-linecap="round"/>
            </g>
          </svg>`,
          
          'fill': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="fill">
              <rect x="3.78979" y="3.78979" width="16.4204" height="16.4204" rx="2.5" stroke="currentColor" stroke-linecap="round"/>
              <rect x="5.51733" y="5.51733" width="12.9653" height="12.9653" rx="1" fill="currentColor"/>
            </g>
          </svg>`,
          'library': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="library">
              <path d="M17.1266 17.1267L6.87317 6.87329" stroke="currentColor" stroke-linecap="round"/>
              <rect x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="currentColor" stroke-linecap="round"/>
            </g>
          </svg>`,
          'variable': `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="variable">
              <path d="M17.1266 17.1267L6.87317 6.87329" stroke="currentColor" stroke-linecap="round"/>
              <rect x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="currentColor" stroke-linecap="round"/>
            </g>
          </svg>`
        },
        windowSize: {
          width: 400,
          height: 600
        },
        isResizing: false,
        selectedFrameIds: [],
        inactiveLibraryTokens: [],
        activeLibraryTokens: [],
        selectedTokenScanType: 'all',
        libraryTokenScanOptions: [
          {
            value: 'all',
            label: 'All Library Tokens',
            description: 'Find all tokens from inactive libraries',
            icon: 'tokens'
          },
          {
            value: 'colors',
            label: 'Color Tokens',
            description: 'Find color tokens from inactive libraries',
            icon: 'fill'
          },
          {
            value: 'typography',
            label: 'Typography Tokens',
            description: 'Find typography tokens from inactive libraries',
            icon: 'typography'
          },
          {
            value: 'spacing',
            label: 'Spacing Tokens',
            description: 'Find spacing tokens from inactive libraries',
            icon: 'spacing'
          }
        ],
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
        variableFilters: {
          type: 'all',
          collection: 'all',
          search: '',
          libraryType: 'all'  // Add new filter for library type
        },
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
      }
    },
    computed: {
      scanScope() {
        return this.scanEntirePage ? 'entire-page' : 'selected-frames';
      },
      canStartScan() {
        const hasSourceType = !!this.selectedSourceType;
        const hasScanType = !!this.selectedScanType;
        
        console.log('Can start scan?', {
          hasSourceType,
          hasScanType,
          isScanning: this.isScanning
        });
        
        // Only allow scan if both source type and scan type are selected
        // and we're not already scanning
        return hasSourceType && hasScanType && !this.isScanning;
      },
      hasResults() {
        const hasRefs = this.groupedReferences && 
                        typeof this.groupedReferences === 'object' && 
                        Object.keys(this.groupedReferences).length > 0;
        console.log('Has results?', {
          groupedReferences: this.groupedReferences,
          count: this.groupedReferences ? Object.keys(this.groupedReferences).length : 0,
          hasRefs
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
          activeTab: this.activeTab
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
        console.log('filteredResults computed property called, groupedReferences:', this.groupedReferences);
        
        if (!this.groupedReferences || Object.keys(this.groupedReferences).length === 0) {
          console.log('No grouped references, returning empty object');
          return {};
        }
        
        console.log('Raw groupedReferences keys:', Object.keys(this.groupedReferences));
        console.log('Raw groupedReferences first few values:', Object.entries(this.groupedReferences).slice(0, 2).map(([k, v]) => ({
          key: k,
          refs: v.refs ? v.refs.length : (Array.isArray(v) ? v.length : 'not array'),
          firstRef: v.refs ? v.refs[0] : (Array.isArray(v) ? v[0] : 'not available')
        })));
        
        let results = {};
        
        // DEBUGGING: Force display all groups first without validation
        Object.keys(this.groupedReferences).forEach(key => {
          // Make sure the group has a refs array
          const group = this.groupedReferences[key];
          if (group) {
            const refs = group.refs ? group.refs : (Array.isArray(group) ? group : []);
            
            if (refs.length > 0) {
              // Always include group for debugging
              results[key] = { refs };
              console.log(`Including group (debug): ${key}, refs: ${refs.length}`);
            }
          }
        });
        
        // If no results after our initial import, return empty to avoid further processing
        if (Object.keys(results).length === 0) {
          console.log('No valid results after initial import, returning empty');
          return {};
        }
        
        console.log('Filtered results count before visibility filter:', Object.keys(results).length);
        
        // Apply visibility filter
        if (this.showOnlyVisible) {
          let filteredResults = {};
          Object.keys(results).forEach(key => {
            const group = results[key];
            const filteredRefs = group.refs.filter(ref => ref.isVisible);
            if (filteredRefs.length > 0) {
              filteredResults[key] = { refs: filteredRefs };
            }
          });
          results = filteredResults;
        }
        
        // Apply hidden layer filter
        if (this.showHiddenOnly) {
          let filteredResults = {};
          Object.keys(results).forEach(key => {
            const group = results[key];
            const filteredRefs = group.refs.filter(ref => ref.isVisible === false);
            if (filteredRefs.length > 0) {
              filteredResults[key] = { refs: filteredRefs };
            }
          });
          results = filteredResults;
        }
        
        // Filter by scan type for fill and stroke colors to prevent duplicates
        if (this.selectedScanType === 'fill' || this.selectedScanType === 'stroke') {
          let filteredResults = {};
          Object.keys(results).forEach(key => {
            const group = results[key];
            // Only include refs that match the selected scan type
            const filteredRefs = group.refs.filter(ref => ref.type === this.selectedScanType);
            if (filteredRefs.length > 0) {
              filteredResults[key] = { refs: filteredRefs };
            }
          });
          results = filteredResults;
          console.log(`After ${this.selectedScanType} filtering: ${Object.keys(results).length} groups remain`);
        }
        
        // Apply padding filter
        if (this.paddingFilterType && this.paddingFilterType !== 'all' && 
            (this.selectedScanType === 'vertical-padding' || this.selectedScanType === 'horizontal-padding')) {
          let filteredResults = {};
          Object.keys(results).forEach(key => {
            const group = results[key];
            const filteredRefs = group.refs.filter(ref => 
              ref.paddingType === this.paddingFilterType || 
              (ref.property === 'paddingTop' && this.paddingFilterType === 'top') ||
              (ref.property === 'paddingBottom' && this.paddingFilterType === 'bottom') ||
              (ref.property === 'paddingLeft' && this.paddingFilterType === 'left') ||
              (ref.property === 'paddingRight' && this.paddingFilterType === 'right')
            );
            if (filteredRefs.length > 0) {
              filteredResults[key] = { refs: filteredRefs };
            }
          });
          results = filteredResults;
        }
        
        // Apply radius filter
        if (this.radiusFilterType && this.radiusFilterType !== 'all' && this.selectedScanType === 'corner-radius') {
          let filteredResults = {};
          Object.keys(results).forEach(key => {
            const group = results[key];
            const filteredRefs = group.refs.filter(ref => 
              ref.cornerType === this.radiusFilterType || 
              (ref.property === 'topLeftRadius' && this.radiusFilterType === 'top-left') ||
              (ref.property === 'topRightRadius' && this.radiusFilterType === 'top-right') ||
              (ref.property === 'bottomLeftRadius' && this.radiusFilterType === 'bottom-left') ||
              (ref.property === 'bottomRightRadius' && this.radiusFilterType === 'bottom-right')
            );
            if (filteredRefs.length > 0) {
              filteredResults[key] = { refs: filteredRefs };
            }
          });
          results = filteredResults;
        }
        
        // Apply gap filter
        if (this.gapFilterType && this.gapFilterType !== 'all' && this.selectedScanType === 'vertical-gap') {
          let filteredResults = {};
          Object.keys(results).forEach(key => {
            const group = results[key];
            const filteredRefs = group.refs.filter(ref => 
              (ref.type === 'verticalGap' && this.gapFilterType === 'vertical') ||
              (ref.type === 'horizontalGap' && this.gapFilterType === 'horizontal') ||
              (ref.gapType === this.gapFilterType)
            );
            if (filteredRefs.length > 0) {
              filteredResults[key] = { refs: filteredRefs };
            }
          });
          results = filteredResults;
        }
        
        console.log('Final filtered results:', Object.keys(results).length, 'groups');
        return results;
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
        return this.selectedVariableScanTypes.length > 0 && !this.isVariableScanning;
      },
      showVariableScanResults() {
        return this.linkedVariables.length > 0 && !this.isVariableScanning && this.variableScanComplete;
      },
      groupedVariables() {
        if (!this.linkedVariables || this.linkedVariables.length === 0) {
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
          
          groups[groupKey].variables.push(variable);
        }
        
        console.log(`Grouped into ${Object.keys(groups).length} groups`);
        return groups;
      },
      designTokenOptions() {
        // Filter for standard design token options (typography, spacing, padding, radius, colors)
        return this.tokenScanOptions.filter(option => 
          ['typography', 'vertical-gap', 'horizontal-padding', 'vertical-padding', 'corner-radius', 'fill', 'stroke'].includes(option.value)
        );
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
            icon: 'token'
          },
          {
            value: 'team-library',
            label: 'Team Library',
            description: 'Find elements using variables from shared team libraries',
            icon: 'team'
          },
          {
            value: 'local-library',
            label: 'Local Library',
            description: 'Find elements using variables defined in this document',
            icon: 'local'
          },
          {
            value: 'missing-library',
            label: 'Missing Library',
            description: 'Find elements using variables from inaccessible libraries',
            icon: 'missing'
          }
        ];
      },
      
      // Token options filtered based on selected source type
      filteredTokenOptions() {
        if (!this.selectedSourceType) return [];
        
        // All token types available for selection
        const allTokenTypes = [
          {
            value: 'typography',
            label: 'Typography',
            description: 'Find text styles, font properties and type settings',
            icon: 'typography'
          },
          {
            value: 'fill',
            label: 'Fill Colors',
            description: 'Find fill colors in shapes, frames and components',
            icon: 'fill'
          },
          {
            value: 'stroke',
            label: 'Stroke Colors',
            description: 'Find stroke/border colors in elements',
            icon: 'stroke'
          },
          {
            value: 'corner-radius',
            label: 'Corner Radius',
            description: 'Find border radius and corner smoothing',
            icon: 'radius'
          },
          {
            value: 'vertical-gap',
            label: 'Vertical Spacing',
            description: 'Find vertical auto-layout gap spacing',
            icon: 'spacing'
          },
          {
            value: 'horizontal-padding',
            label: 'Horizontal Padding',
            description: 'Find left and right padding in auto-layout',
            icon: 'spacing-horizontal'
          },
          {
            value: 'vertical-padding',
            label: 'Vertical Padding',
            description: 'Find top and bottom padding in auto-layout',
            icon: 'spacing-vertical'
          }
        ];
        
        // For raw values, return standard design tokens
        if (this.selectedSourceType === 'raw-values') {
          return allTokenTypes;
        }
        
        // For library source types, return all token types with the correct source prefix
        // This will use the source type as the scan type and the token type will be handled in the backend
        return allTokenTypes.map(tokenType => ({
          ...tokenType,
          value: `${this.selectedSourceType}-${tokenType.value}`,
          description: `Find ${tokenType.label.toLowerCase()} using ${this.getSourceTypeLabel(this.selectedSourceType)} variables`
        }));
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
        if (ref.isLocalLibrary) return 'Local Library';
        if (ref.isMissingLibrary) return 'Missing Library';
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
        // Reset error states
        this.scanError = false;
        this.isScanning = true;
        this.scanProgress = 0;
        
        // Clear any existing results if it's not a rescan
        if (!isRescan) {
          this.clearResults();
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
                     this.selectedScanType.split('-').slice(2).join('-') : null
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
        
        // Process the results to ensure padding types are identified
        if (msg.type === 'scan-complete') {
          if (msg.scanType === 'vertical-padding') {
            // For vertical padding, identify top vs bottom padding if not already set
            if (msg.results && Array.isArray(msg.results)) {
              msg.results.forEach(result => {
                // Check if result has paddingTop or paddingBottom property
                if (result.property === 'paddingTop') {
                  result.paddingType = 'top';
                } else if (result.property === 'paddingBottom') {
                  result.paddingType = 'bottom';
                } else {
                  // For backwards compatibility
                  result.paddingType = 'all';
                }
              });
            }
          } else if (msg.scanType === 'horizontal-padding') {
            // For horizontal padding, identify left vs right padding
            if (msg.results && Array.isArray(msg.results)) {
              msg.results.forEach(result => {
                // Check if result has paddingLeft or paddingRight property
                if (result.property === 'paddingLeft') {
                  result.paddingType = 'left';
                } else if (result.property === 'paddingRight') {
                  result.paddingType = 'right';
                } else {
                  // For backwards compatibility
                  result.paddingType = 'all';
                }
              });
            }
          } else if (msg.scanType === 'corner-radius') {
            // For corner radius, identify corner types
            if (msg.results && Array.isArray(msg.results)) {
              msg.results.forEach(result => {
                // Check the property to identify which corner it is
                if (result.property === 'topLeftRadius' || result.property === 'cornerRadius[0]') {
                  result.cornerType = 'top-left';
                } else if (result.property === 'topRightRadius' || result.property === 'cornerRadius[1]') {
                  result.cornerType = 'top-right';
                } else if (result.property === 'bottomRightRadius' || result.property === 'cornerRadius[2]') {
                  result.cornerType = 'bottom-right';
                } else if (result.property === 'bottomLeftRadius' || result.property === 'cornerRadius[3]') {
                  result.cornerType = 'bottom-left';
                } else if (result.property === 'cornerRadius') {
                  // All corners have the same radius
                  result.cornerType = 'all';
                } else {
                  // For backwards compatibility
                  result.cornerType = 'all';
                }
              });
            }
          }
        }
        
        // Check if the plugin has already grouped the references or if we need to process raw results
        if (msg.type === 'missing-references-result' && msg.references && Object.keys(msg.references).length > 0) {
          console.log('Using pre-grouped references from plugin:', msg.references);
          
          // Convert the grouped references to the format expected by the UI
          const formattedGroups = {};
          Object.entries(msg.references).forEach(([key, refs]) => {
            if (Array.isArray(refs) && refs.length > 0) {
              formattedGroups[key] = { refs };
            }
          });
          
          this.groupedReferences = formattedGroups;
          console.log('Set pre-grouped references:', this.groupedReferences);
        } else if ((msg.type === 'scan-complete' || msg.type === 'missing-references-result') && 
                   msg.results && Array.isArray(msg.results)) {
          // We have raw results from the scan, group them using our groupByValue method
          console.log('Processing raw scan results - count:', msg.results.length);
          console.log('First few results:', msg.results.slice(0, 3));
          
          const rawResults = msg.results;
          const groupedResults = this.groupByValue(rawResults);
          
          // Set the grouped references
          this.groupedReferences = groupedResults;
          console.log('Set manually grouped results - keys:', Object.keys(this.groupedReferences).length);
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
          this.groupedReferences = {}; // Reset to empty object
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
        
        console.log('showScanResults should be:', !this.isScanning && this.hasResults && this.scanComplete);
        
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
          return this.hasResults ? 'Scan complete' : 'Scan complete, no issues found';
        }
        if (this.isScanning) {
          return `Scanning... ${Math.round(this.scanProgress)}%`;
        }
        return 'Ready to scan';
      },
      
      handlePluginMessage(msg) {
        console.log('UI received message:', msg);
        
        // Handle scan progress
        if (msg.type === 'scan-progress') {
          this.handleScanProgress(msg);
        }
        
        // Track if we've already processed results in this scan cycle
        if (msg.type === 'missing-references-result') {
          console.log('Received scan results:', msg);
          this.hasProcessedResults = true;
          this.handleScanComplete(msg);
        }
        
        // Only process scan-complete if we haven't already processed results
        if (msg.type === 'scan-complete') {
          console.log('Received scan complete:', msg);
          if (!this.hasProcessedResults) {
            this.handleScanComplete(msg);
          } else {
            // Just update scan state without resetting results
            this.isScanning = false;
            this.scanComplete = true;
            this.successMessage = 'Scan complete!';
            this.showSuccessToast = true;
            setTimeout(() => { this.showSuccessToast = false; }, 3000);
            console.log('Skipping result processing for scan-complete as results were already processed');
          }
          // Reset the flag for next scan
          this.hasProcessedResults = false;
        }
        
        // Handle selection updates
        if (msg.type === 'selection-update' || msg.type === 'selected-frame-ids') {
          console.log('Selection update received:', msg);
          this.updateSelection(msg);
        }
        
        // Handle node selection confirmation
        if (msg.type === 'nodes-selected') {
          if (msg.success) {
            this.successMessage = `Selected ${msg.count} nodes`;
            this.showSuccessToast = true;
            setTimeout(() => { this.showSuccessToast = false; }, 2000);
          } else {
            this.errorMessage = msg.error || 'Failed to select nodes';
            this.showErrorToast = true;
            setTimeout(() => { this.showErrorToast = false; }, 3000);
          }
        }
        
        // Special case for error messages
        if (msg.type === 'error') {
          this.errorMessage = msg.message;
          this.showErrorToast = true;
          setTimeout(() => { this.showErrorToast = false; }, 3000);
        }
        
        // Handle watch status
        if (msg.type === 'watch-status') {
          this.isWatching = msg.isWatching;
        }
        
        // Handle watch status
        if (msg.type === 'scan-cancelled') {
          this.isScanning = false;
          this.scanProgress = 0;
          this.successMessage = 'Scan cancelled';
          this.showSuccessToast = true;
          setTimeout(() => { this.showSuccessToast = false; }, 3000);
        }
        
        // Handle variable scan completion
        if (msg.type === 'variable-scan-complete') {
          this.isVariableScanning = false;
          this.variableScanComplete = true;
          
          if (msg.variables && Array.isArray(msg.variables)) {
            this.variables = msg.variables;
            
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
        }
        
        // Handle variable scan progress
        if (msg.type === 'variable-scan-progress') {
          this.variableScanProgress = msg.progress;
        }
        
        // Handle variable scan status
        if (msg.type === 'variable-scan-status') {
          this.variableScanStatus = msg.message;
        }
        
        // Handle variable scan cancelled
        if (msg.type === 'variable-scan-cancelled') {
          this.isVariableScanning = false;
          this.variableScanProgress = 0;
          this.variableSuccessMessage = 'Variable scan cancelled';
          this.showVariableSuccessToast = true;
          setTimeout(() => { this.showVariableSuccessToast = false; }, 3000);
        }
      },
      async getSelectedFrameIds() {
        return new Promise((resolve) => {
          parent.postMessage({ 
            pluginMessage: { type: 'get-selected-frame-ids' }
          }, '*');

          const handler = (event) => {
            const msg = event.data.pluginMessage;
            if (msg.type === 'selected-frame-ids') {
              window.removeEventListener('message', handler);
              resolve(msg.ids);
            }
          };
          window.addEventListener('message', handler);
        });
      },
      async selectGroup(refs, groupId) {
        console.log('Selecting group with refs:', refs);
        
        if (!refs || (refs.length === 0 && !refs.refs)) {
          console.log('No references provided to selectGroup method');
          return;
        }
        
        // Handle both array and object with refs property
        const refsArray = Array.isArray(refs) ? refs : (refs.refs || []);
        
        if (refsArray.length === 0) {
          console.log('No references to select after processing');
          return;
        }
        
        // Track the selection state
        if (typeof groupId === 'string') {
          this.selectingNodeIds.add(groupId);
        } else {
          // Use the first node id if groupId is not provided
          this.selectingNodeIds.add(refsArray[0].nodeId);
        }
        
        try {
          // Get all node IDs from the references
          const nodeIds = refsArray.map(ref => ref.nodeId).filter(Boolean);
          
          if (nodeIds.length === 0) {
            console.warn('No valid node IDs found in references');
            return;
          }
          
          console.log('Selecting nodes with IDs:', nodeIds);
          
          // Send a message to the plugin to select these nodes
          parent.postMessage({
            pluginMessage: {
              type: 'select-nodes',
              nodeIds: nodeIds
            }
          }, '*');
        } catch (err) {
          console.error('Error selecting group:', err);
        } finally {
          // Clear selection state after a delay
          setTimeout(() => {
            if (typeof groupId === 'string') {
              this.selectingNodeIds.delete(groupId);
            } else if (refsArray[0]) {
              this.selectingNodeIds.delete(refsArray[0].nodeId);
            }
          }, 1000);
        }
      },
      formatValue(value) {
        if (value === null || value === undefined) {
          return 'N/A';
        }
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      },
      formatGapValue(value, ref) {
        if (ref.type === 'gap') {
          const direction = ref.isVertical ? 'Vertical' : 'Horizontal';
          return `${direction} Gap: ${value}px`;
        }
        return formatValue(value);
      },
      toggleGroup(groupKey) {
        if (this.expandedGroups.has(groupKey)) {
          this.expandedGroups.delete(groupKey);
        } else {
          this.expandedGroups.add(groupKey);
        }
      },
      isGroupExpanded(groupKey) {
        return this.expandedGroups.has(groupKey);
      },
      getPropertyName(key) {
        return key.split(':')[0];
      },
      toggleWatch() {
        if (!this.canWatch) return;
        
        this.isWatching = !this.isWatching;
        parent.postMessage({ 
          pluginMessage: { 
            type: this.isWatching ? 'start-watching' : 'stop-watching',
            scanType: this.selectedScanType,
            scanScope: this.scanScope,
            scanEntirePage: this.scanEntirePage
          }
        }, '*');
      },
      clearResults() {
        this.groupedReferences = {};
        this.expandedGroups.clear();
      },
      dismissToast() {
        this.showSuccessToast = false;
      },
      handleResize(msg) {
        if (msg.type === 'resize' && msg.width && msg.height) {
          const width = Number(msg.width);
          const height = Number(msg.height);
          
          if (!isNaN(width) && !isNaN(height)) {
            this.windowSize = { width, height };
          }
        }
      },
      updateProgress(newProgress) {
        const progress = Math.min(Math.max(0, Number(newProgress) || 0), 100);
        console.log(`Updating progress bar: ${progress}%`);
        this.scanProgress = progress;
      },
      isSelecting(id) {
        return this.selectingNodeIds.has(id);
      },
      async startLibraryScan() {
        this.isLibraryScanning = true;
        this.libraryScanProgress = 0;
        this.currentScanNode = null;
        this.scanSummary = null;
        this.isPaused = false;
        
        const selectedFrameIds = !this.scanEntirePage  // Use the same scanEntirePage state
          ? await this.getSelectedFrameIds()
          : undefined;
        
        parent.postMessage({ 
          pluginMessage: { 
            type: 'scan-for-tokens',
            scanType: 'inactive-tokens',
            scanScope: this.scanEntirePage ? 'entire-page' : 'selected-frames',
            selectedFrameIds
          }
        }, '*');
      },
      clearLibraryResults() {
        this.libraryResults = {};
      },
      async listVariables() {
        this.isAnalyzing = true;
        this.variableAnalysis = null;  // Reset previous results
        parent.postMessage({ 
          pluginMessage: { 
            type: 'list-variables'
          }
        }, '*');
      },
      openStripePayment() {
        window.open('https://buy.stripe.com/8wM7wb49NeFD5UYcMM', '_blank');
      },
      startResize(e) {
        this.isResizing = true;
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = this.windowSize.width;
        const startHeight = this.windowSize.height;
        
        const onMouseMove = (e) => {
          if (!this.isResizing) return;
          
          const newWidth = startWidth + (e.clientX - startX);
          const newHeight = startHeight + (e.clientY - startY);
          
          // Set minimum sizes
          const width = Math.max(300, newWidth);
          const height = Math.max(400, newHeight);
          
          this.windowSize = { width, height };
          
          // Send resize message to plugin
          parent.postMessage({ 
            pluginMessage: { 
              type: 'resize', 
              width,
              height
            }
          }, '*');
        };
        
        const onMouseUp = () => {
          this.isResizing = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
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
      getStyleData(key) {
        try {
          // Extract the JSON data from the textStyleId string
          const styleMatch = key.match(/textStyleId:({.*?})/);
          if (!styleMatch) return this.getDefaultStyle();
          
          const styleData = JSON.parse(styleMatch[1]);
          
          // Clean up the font family name
          styleData.fontFamily = styleData.fontFamily.split(' ')[0];
          
          return styleData;
        } catch (err) {
          console.warn('Error parsing style data:', err);
          return this.getDefaultStyle();
        }
      },
      getDefaultStyle() {
        return {
          fontFamily: 'Unknown',
          fontWeight: 'Regular',
          fontSize: 14
        };
      },
      async scanLibraryTokens() {
        this.isLibraryScanning = true;
        this.libraryScanProgress = 0;
        this.currentScanNode = null;
        this.scanSummary = null;
        this.isPaused = false;
        this.inactiveLibraryTokens = [];
        this.activeLibraryTokens = [];
        parent.postMessage({ 
          pluginMessage: { 
            type: 'scan-library-tokens',
            scanType: this.selectedLibraryTokenScanType
          }
        }, '*');
      },
      async activateLibrary(libraryName) {
        parent.postMessage({ 
          pluginMessage: { 
            type: 'activate-library',
            libraryName 
          }
        }, '*');
      },
      stopLibraryScan() {
        console.log('Requesting scan stop...');
        parent.postMessage({ 
          pluginMessage: { type: 'stop-library-scan' }
        }, '*');
      },
      formatTokenType(type) {
        switch (type.toLowerCase()) {
          case 'color':
            return 'Color';
          case 'float':
            return 'Number';
          case 'string':
            return 'Text';
          default:
            return type;
        }
      },
      pauseLibraryScan() {
        console.log('Requesting scan pause...');
        this.isPaused = true;
        parent.postMessage({ 
          pluginMessage: { type: 'pause-library-scan' }
        }, '*');
      },
      resumeLibraryScan() {
        console.log('Requesting scan resume...');
        this.isPaused = false;
        parent.postMessage({ 
          pluginMessage: { type: 'resume-library-scan' }
        }, '*');
      },
      getUniqueLibraries(tokens) {
        return [...new Set(tokens.map(token => token.libraryName))];
      },
      getTokensByLibrary(tokens, libraryName) {
        return tokens.filter(token => token.libraryName === libraryName);
      },
      showTokenUsages(token) {
        const nodeIds = token.usages.map(usage => usage.nodeId);
        parent.postMessage({ 
          pluginMessage: { 
            type: 'select-nodes',
            nodeIds
          }
        }, '*');
      },
      toggleUsageDetails(variableId) {
        this.isUsageExpanded = { ...this.isUsageExpanded, [variableId]: !this.isUsageExpanded[variableId] };
      },
      isUsageExpanded(variableId) {
        return this.isUsageExpanded[variableId] || false;
      },
      selectNode(nodeId) {
        if (!nodeId) return;
        
        try {
          parent.postMessage({
            pluginMessage: this.makeSerializable({
              type: 'select-node',
              nodeId
            })
          }, '*');
        } catch (error) {
          console.error('Failed to send node selection message:', error);
        }
      },
      switchTab(tab) {
        this.activeTab = tab;
      },
      getProgressWidth() {
        // Always return a percentage, even if 0
        return `${Math.max(0, Math.min(100, this.scanProgress))}%`;
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
      handleScanCardKeydown(e) {
        if (e.key === 'ArrowRight') {
          this.selectNextCard();
        } else if (e.key === 'ArrowLeft') {
          this.selectPreviousCard();
        } else if (e.key === 'Enter') {
          this.selectCurrentCard();
        }
      },
      selectNextCard() {
        const currentIndex = this.tokenScanOptions.findIndex(option => option.value === this.selectedScanType);
        const nextIndex = (currentIndex + 1) % this.tokenScanOptions.length;
        this.selectedScanType = this.tokenScanOptions[nextIndex].value;
      },
      selectPreviousCard() {
        const currentIndex = this.tokenScanOptions.findIndex(option => option.value === this.selectedScanType);
        const prevIndex = (currentIndex - 1 + this.tokenScanOptions.length) % this.tokenScanOptions.length;
        this.selectedScanType = this.tokenScanOptions[prevIndex].value;
      },
      selectCurrentCard() {
        this.selectedScanType = this.selectedScanType;
      },
      handleLibraryScanCardKeydown(e) {
        if (e.key === 'ArrowRight') {
          this.selectNextLibraryCard();
        } else if (e.key === 'ArrowLeft') {
          this.selectPreviousLibraryCard();
        } else if (e.key === 'Enter') {
          this.selectCurrentLibraryCard();
        }
      },
      selectNextLibraryCard() {
        const currentIndex = this.libraryTokenScanOptions.findIndex(option => option.value === this.selectedLibraryTokenScanType);
        const nextIndex = (currentIndex + 1) % this.libraryTokenScanOptions.length;
        this.selectedLibraryTokenScanType = this.libraryTokenScanOptions[nextIndex].value;
      },
      selectPreviousLibraryCard() {
        const currentIndex = this.libraryTokenScanOptions.findIndex(option => option.value === this.selectedLibraryTokenScanType);
        const prevIndex = (currentIndex - 1 + this.libraryTokenScanOptions.length) % this.libraryTokenScanOptions.length;
        this.selectedLibraryTokenScanType = this.libraryTokenScanOptions[prevIndex].value;
      },
      selectCurrentLibraryCard() {
        this.selectedLibraryTokenScanType = this.selectedLibraryTokenScanType;
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
          else if (Array.isArray(group)) {
            count += group.length;
            console.log(`Group ${key}: Adding ${group.length} references from array group`);
          }
        });
        
        console.log(`Total results count: ${count}`);
        
        // Format the count with comma for thousands
        return count.toLocaleString();
      },
      formatTypographyValue(value) {
        if (typeof value === 'object') {
          return `${value.fontFamily} ${value.fontWeight} ${value.fontSize}px`;
        }
        return String(value);
      },
      debugResults() {
        console.log('Debugging results:', this.groupedReferences);
        
        // Format results for easier reading
        Object.entries(this.groupedReferences).forEach(([key, group]) => {
          console.log(`Group: ${key}`, {
            refs: group.refs,
            type: group.refs[0]?.type,
            property: group.refs[0]?.property,
          });
        });
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
        // Check if results is valid
        if (!results || !Array.isArray(results) || results.length === 0) {
          console.log('Invalid or empty results, returning empty object');
          return {};
        }
        
        // Group results by their values
        const grouped = {};
        
        results.forEach((result, index) => {
          if (!result || typeof result !== 'object') {
            console.warn(`Skipping invalid result at index ${index}:`, result);
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
              key = `fill-color:${colorValue}:${result.nodeId || ''}`;
            } else if (typeKey === 'stroke') {
              // For stroke types, ensure the type is clearly marked
              key = `stroke-color:${colorValue}:${result.nodeId || ''}`;
            } else {
              // Generic color handling
              key = `color:${colorValue}`;
            }
          } else if (typeKey === 'spacing-h-padding' || typeKey === 'horizontal-padding' || typeKey === 'horizontalPadding') {
            // Normalize type for consistency
            typeKey = 'horizontal-padding';
            const paddingValue = typeof value === 'number' ? value : (value && value.value ? value.value : 0);
            const paddingType = result.paddingType || result.property || 'all';
            key = `${typeKey}:${paddingValue}:${paddingType}`;
          } else if (typeKey === 'spacing-v-padding' || typeKey === 'vertical-padding' || typeKey === 'verticalPadding') {
            // Normalize type for consistency
            typeKey = 'vertical-padding';
            const paddingValue = typeof value === 'number' ? value : (value && value.value ? value.value : 0);
            const paddingType = result.paddingType || result.property || 'all';
            key = `${typeKey}:${paddingValue}:${paddingType}`;
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
          
          // Initialize array if key doesn't exist
          if (!grouped[key]) {
            grouped[key] = { refs: [] };
          }
          
          // Add result to the array
          grouped[key].refs.push(result);
        });
        
        console.log('Grouped results by value:', grouped);
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
        if (!variableId) return;
        
        try {
          parent.postMessage({
            pluginMessage: this.makeSerializable({
              type: 'select-variable-nodes',
              variableId
            })
          }, '*');
        } catch (error) {
          console.error('Failed to select variable nodes:', error);
        }
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
        if (this.showVariableScanResults) {
          if (this.linkedVariables.length === 0) return 'No variables found';
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
        if (!variables || variables.length === 0) return;
        
        const variableIds = variables.map(v => v.id);
        
        try {
          // Request selection
          parent.postMessage({
            pluginMessage: this.makeSerializable({
              type: 'select-variable-group-nodes',
              variableIds
            })
          }, '*');
        } catch (error) {
          console.error('Failed to select variables:', error);
        }
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
      // Add a new method to process debug results
      processMissingLibraryVariables(variables) {
        if (!variables || !Array.isArray(variables) || variables.length === 0) {
          console.log('No variables found in processMissingLibraryVariables');
          return;
        }

        console.log(`Processing ${variables.length} variables for display`);
        
        // Format variables for display
        const formattedVariables = variables.map(variable => {
          // Create a proper variable object that matches the structure expected by the UI
          return {
            id: variable.variableId || variable.nodeId || 'id-' + Math.random().toString(36).substr(2, 9),
            nodeId: variable.nodeId,
            nodeName: variable.nodeName || 'Unknown Node',
            type: variable.type || variable.resolvedType || 'UNKNOWN',
            name: variable.variableName || variable.name || 'Unnamed Variable',
            isTeamLibrary: variable.isTeamLibrary || false,
            isLocalLibrary: variable.isLocalLibrary || false,
            isMissingLibrary: variable.isMissingLibrary || false,
            key: variable.variableKey || variable.key,
            value: variable.currentValue || variable.value || null,
            collection: {
              id: variable.libraryId || variable.key?.split(':')[0] || 'missing-library',
              name: variable.libraryName || 'Missing Library'
            }
          };
        });
        
        console.log('Formatted variables:', formattedVariables.slice(0, 3));
        
        // Set variables in UI state
        this.linkedVariables = formattedVariables;
        this.showVariableScanResults = true;
        this.variableScanComplete = true;
        this.showRescanVariablesButton = true;
        
        // Extract collections for display
        const collections = new Map();
        
        // Group variables by library type and collection
        for (const variable of formattedVariables) {
          // Determine collection type based on library flags
          let collectionType = 'unknown';
          if (variable.isTeamLibrary) collectionType = 'team-library';
          else if (variable.isLocalLibrary) collectionType = 'local-library';
          else if (variable.isMissingLibrary) collectionType = 'missing-library';
          
          // Use the collection ID or create one based on library type
          const collectionId = `${collectionType}-${variable.collection?.id || 'unknown'}`;
          
          if (!collections.has(collectionId)) {
            collections.set(collectionId, {
              id: collectionId,
              name: variable.collection?.name || 
                    (variable.isTeamLibrary ? 'Team Library' : 
                    variable.isLocalLibrary ? 'Local Library' : 
                    variable.isMissingLibrary ? 'Missing Library' : 'Unknown Library'),
              type: variable.type,
              libraryType: collectionType,
              remote: variable.isTeamLibrary || variable.isMissingLibrary,
              variables: []
            });
          }
          
          // Add variable to its collection
          collections.get(collectionId).variables.push(variable);
        }
        
        this.variableCollections = Array.from(collections.values());
        console.log(`Organized into ${this.variableCollections.length} collections:`, 
                   this.variableCollections.map(c => c.name));
        
        // Switch to the variables tab to show results
        this.activeTab = 'library-tokens';
      },
      
      // Select source type (first level filter)
      selectSourceType(value) {
        console.log(`Selected source type: ${value}`);
        
        // Always set the selected value (no toggling)
        this.selectedSourceType = value;
        
        // Reset scan type when changing source type
        this.selectedScanType = null;
      },
      
      // Get readable label for source type
      getSourceTypeLabel(sourceType) {
        switch (sourceType) {
          case 'team-library': return 'team library';
          case 'local-library': return 'local library';
          case 'missing-library': return 'missing library';
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
