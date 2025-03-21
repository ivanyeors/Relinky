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
          }
        }
      }
    },
    data() {
      return {
        activeTab: 'tokens',
        selectedScanType: null, // Remove default 'vertical-gap' value
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
              <path d="M3.34302 20.8875V10.1124C3.34302 6.24643 6.47703 3.11243 10.343 3.11243H22.4347" stroke="currentColor"/>
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
          search: ''
        },
        isLoadingVariables: false,
        selectedVariableId: null,
        variableScanOptions: [
          {
            value: 'color',
            label: 'Color Variables',
            description: 'Find color variables used in the design',
            icon: 'fill'
          },
          {
            value: 'number',
            label: 'Number Variables',
            description: 'Find number variables (spacing, size, etc.)',
            icon: 'spacing'
          },
          {
            value: 'string',
            label: 'Text Variables',
            description: 'Find text/string variables in the design',
            icon: 'typography'
          },
          {
            value: 'boolean',
            label: 'Boolean Variables',
            description: 'Find boolean/toggle variables',
            icon: 'variable'
          }
        ],
        selectedVariableScanTypes: [], // Allow multiple selections
        isVariableScanning: false,
        variableScanProgress: 0,
        variableScanError: false,
        variableScanComplete: false,
        linkedVariables: [], // All linked variables found
        showRescanVariablesButton: false,
        lastScannedVariableTypes: [],
      }
    },
    computed: {
      scanScope() {
        return this.scanEntirePage ? 'entire-page' : 'selected-frames';
      },
      canStartScan() {
        return (this.hasSelection || this.scanEntirePage) && this.selectedScanType !== null;
      },
      hasResults() {
        const hasRefs = Object.keys(this.groupedReferences).length > 0;
        console.log('Has results?', {
          groupedReferences: this.groupedReferences,
          count: Object.keys(this.groupedReferences).length,
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
        const shouldShow = !this.isScanning && this.hasResults && this.scanComplete;
        console.log('Show scan results?', {
          isScanning: this.isScanning,
          hasResults: this.hasResults,
          scanComplete: this.scanComplete,
          shouldShow
        });
        return shouldShow;
      },
      showStopButton() {
        return this.isScanning && !this.scanComplete;
      },
      showRescanButton() {
        // Only show rescan if we have results AND the scan type hasn't changed
        return this.hasResults && this.selectedScanType === this.lastScannedType;
      },
      filteredResults() {
        if (!this.showHiddenOnly) {
          return this.groupedByValue;
        }
        
        // Filter to show only groups with hidden layers
        const filtered = {};
        for (const [key, group] of Object.entries(this.groupedByValue)) {
          const hiddenRefs = group.refs.filter(ref => !ref.isVisible);
          if (hiddenRefs.length > 0) {
            filtered[key] = {
              ...group,
              refs: hiddenRefs
            };
          }
        }
        return filtered;
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
        return this.selectedVariableScanTypes.length > 0 && (this.hasSelection || this.scanEntirePage);
      },
      showVariableScanResults() {
        return this.linkedVariables.length > 0 && !this.isVariableScanning && this.variableScanComplete;
      },
      groupedVariables() {
        if (!this.linkedVariables.length) return {};
        
        const groups = {};
        
        // Apply filters directly instead of using filteredVariables to avoid circular reference
        this.linkedVariables.forEach(variable => {
          // Only include inactive library variables and exclude unlinked raw values
          if (!variable.isInactiveLibrary || variable.isUnlinked) {
            return;
          }
          
          // Apply filters directly
          // Filter by type
          if (this.variableFilters.type !== 'all' && 
              variable.type !== this.variableFilters.type) {
            return;
          }
          
          // Filter by collection
          if (this.variableFilters.collection !== 'all' && 
              variable.collectionId !== this.variableFilters.collection) {
            return;
          }
          
          // Filter by search
          if (this.variableFilters.search) {
            const searchLower = this.variableFilters.search.toLowerCase();
            if (!variable.name.toLowerCase().includes(searchLower)) {
              return;
            }
          }
          
          // Create unique key for each collection+type combination
          const groupKey = `${variable.collectionId || 'none'}_${variable.type}`;
          
          if (!groups[groupKey]) {
            groups[groupKey] = {
              collectionId: variable.collectionId,
              collectionName: variable.collectionName || 'No Collection',
              type: variable.type,
              variables: []
            };
          }
          
          groups[groupKey].variables.push(variable);
        });
        
        return groups;
      }
    },
    methods: {
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
        if (this.isScanning) return;
        
        // Reset states
        this.isScanning = true;
        this.scanProgress = 0;
        this.scanError = false;
        this.scanComplete = false;
        
        if (!isRescan) {
          this.clearResults();
        }
        
        // Get current selection
        const selectedFrameIds = !this.scanEntirePage ? [...this.selectedFrameIds] : [];
        
        console.log('Starting scan:', {
          scanType: this.selectedScanType,
          scanEntirePage: this.scanEntirePage,
          selectedFrameIds,
          hasSelection: this.hasSelection
        });
        
        parent.postMessage({
          pluginMessage: {
            type: 'scan-for-tokens',
            scanType: this.selectedScanType,
            scanEntirePage: this.scanEntirePage,
            selectedFrameIds
          }
        }, '*');
        // Update lastScannedType
        this.lastScannedType = this.selectedScanType;
      },
      stopScan() {
        // Log stop request
        console.log('Stopping scan...');
        
        this.isScanning = false;
        this.scanComplete = true;
        
        parent.postMessage({
          pluginMessage: {
            type: 'stop-scan'
          } 
        }, '*');
      },
      handleScanComplete(msg) {
        // Log scan completion
        console.log('Scan complete:', msg);
        
        // Update states
        this.isScanning = false;
        this.scanComplete = true;
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
        if (!msg) return;
        
        console.log('Received message:', msg.type, msg);
        
        switch (msg.type) {
          case 'missing-references-result':
            this.isScanning = false;
            this.scanComplete = true;
            this.scanProgress = 100;
            if (msg.references) {
              this.groupedReferences = msg.references;
              console.log('Scan complete with results:', {
                references: msg.references,
                groupCount: Object.keys(msg.references).length
              });
            }
            break;
            
          case 'scan-progress':
            this.scanProgress = msg.progress;
            this.isScanning = msg.isScanning ?? true;
            break;
            
          case 'selection-updated':
            this.updateSelection(msg);
            break;
            
          case 'init-icons':
            this.icons = msg.icons;
            break;
            
          case 'variables-response':
            this.handleVariablesResponse(msg.data);
            break;
            
          case 'variable-scan-progress':
            this.handleVariableScanProgress(msg.progress);
            break;
            
          case 'variable-scan-results':
            this.handleVariableScanResults(msg.data);
            break;
            
          case 'variable-unlinked':
            this.handleVariableUnlinked(msg.data);
            break;
            
          // Remove duplicate handlers
          default:
            console.log('Unhandled message type:', msg.type);
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
        this.selectingNodeIds.add(groupId);
        const nodeIds = refs.map(ref => ref.nodeId);
        parent.postMessage({ 
          pluginMessage: { 
            type: 'select-group',
            nodeIds
          }
        }, '*');
        
        setTimeout(() => {
          this.selectingNodeIds.delete(groupId);
        }, 500);
      },
      formatValue(value) {
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
        this.hasSelection = msg.hasSelection;
        this.selectedCount = msg.count;
        if (msg.selectedFrameIds) {
          this.selectedFrameIds = msg.selectedFrameIds;
        }
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
        parent.postMessage({
          pluginMessage: { 
            type: 'select-node', 
            nodeId
          }
        }, '*');
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
        if (!this.selectedScanType) {
          return 'Select what to scan for';
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
        // Toggle selection if clicking the same card
        if (this.selectedScanType === value) {
          this.selectedScanType = null;
        } else {
          this.selectedScanType = value;
        }
        // Reset lastScannedType if selecting a different type
        if (this.lastScannedType !== value) {
          this.lastScannedType = null;
        }
      },
      getTotalResultsCount() {
        return Object.values(this.groupedByValue).reduce((sum, group) => sum + group.refs.length, 0);
      },
      formatTypographyValue(value) {
        if (typeof value === 'object') {
          return `${value.fontFamily} ${value.fontWeight} ${value.fontSize}px`;
        }
        return String(value);
      },
      debugResults() {
        console.log('Current state:', {
          isScanning: this.isScanning,
          hasResults: this.hasResults,
          groupedReferences: this.groupedReferences,
          groupedByValue: this.groupedByValue
        });
      },
      selectLibraryScanType(value) {
        // Toggle selection if clicking the same card
        if (this.selectedLibraryTokenScanType === value) {
          this.selectedLibraryTokenScanType = null;
        } else {
          this.selectedLibraryTokenScanType = value;
        }
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
        this.selectedVariableId = variableId;
        // Send message to highlight variable usages
        parent.postMessage({
          pluginMessage: {
            type: 'highlight-variable-usages',
            variableId
          }
        }, '*');
      },
      updateVariableFilters(filters) {
        this.variableFilters = {
          ...this.variableFilters,
          ...filters
        };
      },
      toggleVariableScanType(value) {
        const index = this.selectedVariableScanTypes.indexOf(value);
        if (index === -1) {
          // Add to selection
          this.selectedVariableScanTypes.push(value);
        } else {
          // Remove from selection
          this.selectedVariableScanTypes.splice(index, 1);
        }
      },
      makeSerializable(obj) {
        // Handle primitives and null
        if (obj === null || typeof obj !== 'object') {
          return obj;
        }
        
        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.map(item => this.makeSerializable(item));
        }
        
        // Handle objects
        const result = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // Skip functions and DOM nodes
            if (typeof obj[key] === 'function' || 
                (typeof obj[key] === 'object' && obj[key] !== null && obj[key].nodeType)) {
              continue;
            }
            result[key] = this.makeSerializable(obj[key]);
          }
        }
        return result;
      },
      startVariableScan() {
        if (this.isVariableScanning) return;
        if (this.selectedVariableScanTypes.length === 0) return;
        
        // Reset states
        this.isVariableScanning = true;
        this.variableScanProgress = 0;
        this.variableScanError = false;
        this.variableScanComplete = false;
        
        // Get current selection - Make sure to create simple string array
        // Create a plain array of strings to prevent DataCloneError
        const selectedFrameIds = !this.scanEntirePage ? 
          this.selectedFrameIds.map(id => String(id)) : [];
        
        console.log('Starting variable scan:', {
          variableTypes: this.selectedVariableScanTypes,
          scanEntirePage: this.scanEntirePage,
          selectedFrameIds
        });
        
        try {
          // Send message to plugin code - ensure all data is serializable
          const variableTypes = this.selectedVariableScanTypes.map(type => String(type));
          
          // Create a completely serializable message
          const message = this.makeSerializable({
            type: 'scan-variables',
            variableTypes: variableTypes,
            scanEntirePage: this.scanEntirePage,
            selectedFrameIds: selectedFrameIds
          });
          
          parent.postMessage({
            pluginMessage: message
          }, '*');
          
          // Update lastScannedVariableTypes - also convert to simple strings
          this.lastScannedVariableTypes = variableTypes;
          this.showRescanVariablesButton = true;
        } catch (error) {
          // Handle the DataCloneError or any other error
          console.error("Error starting variable scan:", error);
          this.isVariableScanning = false;
          this.variableScanError = true;
          
          // Show user-friendly error message
          this.successMessage = "Failed to start scan due to a data error. Please try again.";
          this.showSuccessToast = true;
          setTimeout(() => {
            this.showSuccessToast = false;
          }, 3000);
        }
      },
      stopVariableScan() {
        console.log('Stopping variable scan...');
        
        this.isVariableScanning = false;
        
        parent.postMessage({
          pluginMessage: {
            type: 'stop-variable-scan'
          } 
        }, '*');
      },
      handleVariableScanProgress(progress) {
        this.variableScanProgress = Math.min(100, Math.max(0, progress));
      },
      handleVariableScanResults(results) {
        this.linkedVariables = results.variables || [];
        this.isVariableScanning = false;
        this.variableScanComplete = true;
        this.variableScanProgress = 100;
        
        console.log('Variable scan complete:', {
          variablesFound: this.linkedVariables.length
        });
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
        if (this.variableScanError) {
          return 'Scan error';
        }
        if (!this.isVariableScanning && this.variableScanProgress === 100) {
          return this.linkedVariables.length ? 'Scan complete' : 'Scan complete, no variables found';
        }
        if (this.isVariableScanning) {
          return `Scanning... ${Math.round(this.variableScanProgress)}%`;
        }
        return 'Ready to scan';
      },
      // Format variable type for display
      formatVariableType(type) {
        if (!type) return 'Unknown';
        
        switch (type.toLowerCase()) {
          case 'color':
            return 'Color';
          case 'float':
          case 'number':
            return 'Number';
          case 'string':
            return 'Text';
          case 'boolean':
            return 'Boolean';
          default:
            return type;
        }
      },
      // Format variable value for display
      formatVariableValue(value, type) {
        if (value === undefined || value === null) return 'No value';
        
        switch (type) {
          case 'color':
            return `RGB(${Math.round(value.r * 255)}, ${Math.round(value.g * 255)}, ${Math.round(value.b * 255)})`;
          case 'boolean':
            return value ? 'True' : 'False';
          case 'number':
          case 'float':
            return Number(value).toFixed(2);
          default:
            return String(value);
        }
      },
      // Select all variables in a group
      selectAllVariablesInGroup(variables) {
        if (!variables || !variables.length) return;
        
        const nodeIds = variables.flatMap(variable => 
          (variable.usages || []).map(usage => usage.nodeId)
        );
        
        if (nodeIds.length) {
          parent.postMessage({ 
            pluginMessage: { 
              type: 'select-group',
              nodeIds
            }
          }, '*');
        }
      },
      // Unlink a specific variable from all its usages
      unlinkVariable(variableId) {
        if (!variableId) return;
        
        const variable = this.linkedVariables.find(v => v.id === variableId);
        if (!variable) return;
        
        // Confirm with user
        const confirmMessage = `Unlink variable "${variable.name}" from ${variable.usages?.length || 0} instances?`;
        if (!confirm(confirmMessage)) return;
        
        parent.postMessage({ 
          pluginMessage: { 
            type: 'unlink-variable',
            variableId
          }
        }, '*');
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
      
      // Remove any default selection
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

  // Send resize message to plugin
  parent.postMessage({
    pluginMessage: {
      type: 'resize',
      width: newWidth,
      height: newHeight
    }
  }, '*');
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
}
