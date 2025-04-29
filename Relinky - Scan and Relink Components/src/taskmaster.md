Task 2: Define New Feature Requirements
Subtask 2.1: Create user stories for document-wide scanning feature
  - As a designer, I want to scan my entire document for variable tokens so I can identify all linked variables at once
  - As a designer, I want to see all variables organized by type so I can focus on specific categories
  - As a team lead, I want to identify all variables from inactive libraries so I can ensure design consistency
  - As a designer, I want to scan documents in the background so I can continue working while scanning happens
  - As a designer working with large files, I want the ability to cancel and resume scans to manage performance
  - As a user, I want to filter scan results by variable collection to focus on specific design systems

  Development instructions:
  - Create a DocumentVariableScanner class/module with asynchronous scanning capabilities
  - Implement a background worker pattern using Web Workers to prevent UI blocking
  - Develop a VariableCollector that uses figma.variables.getLocalVariables() and figma.variables.getVariableCollectionsByDocument()
  - Create typed interfaces for all variable types (ColorVariable, TextVariable, etc.)
  - Implement library detection logic using figma.getLibraries() and figma.getLocalVariables()
  - Build a cancellation token system with abort controllers to support interrupting scans
  - Design a progress tracking system with callback functions for UI updates
  - Develop a filtering module with support for multiple filter criteria combinations

Subtask 2.2: Create user stories for selection-based scanning feature
  - As a designer, I want to scan only selected elements for linked variables to focus on specific areas
  - As a designer, I want to expand the scan to include parent frames/components of my selection
  - As a designer, I want to see which variables are used in my selection compared to the entire document
  - As a designer, I want to scan nested components within my selection to find all variable references
  - As a designer, I want to be notified if my selection contains mixed variable types to make informed decisions
  - As a user, I want to quickly select all elements using a specific variable to modify them together

  Development instructions:
  - Implement a SelectionManager class to track and manipulate the current selection
  - Create a SelectionVariableScanner that extends the DocumentVariableScanner with selection-specific logic
  - Develop selectionToNodeArray() utility to convert figma.currentPage.selection to a processable array
  - Build traverseSelection() function with customizable depth parameters to handle nested components
  - Implement a compareSelectionWithDocument() function returning shared and unique variables
  - Create a SelectionExpander module with methods to include parent frames/components
  - Develop a TypeAnalyzer class to identify and notify about mixed variable types in selection
  - Implement findNodesUsingVariable() function to locate and select all instances of a specific variable

Subtask 2.3: Define criteria for grouping similar values and tokens
  - Group variables by type (color, typography, number, boolean, etc.)
  - Group variables by collection (design system source)
  - Group variables by library source (local vs remote libraries)
  - Group color variables by color value similarity (within defined tolerance)
  - Group typography variables by font family, size, and weight similarities
  - Group numeric variables by value range and unit
  - Create special grouping for similar but slightly different values (potential standardization)
  - Allow custom grouping based on user-defined criteria
  - Track usage count for prioritizing frequently used variables

  Development instructions:
  - Create a VariableGrouper module with pluggable grouping strategies
  - Implement TypeGroupingStrategy class using variable.resolvedType for basic type grouping
  - Build CollectionGroupingStrategy using variable.variableCollectionId for collection-based grouping
  - Develop LibrarySourceGroupingStrategy using figma.getLibraries() and variable metadata
  - Implement ColorSimilarityGroupingStrategy with RGB/HSL comparison algorithms and configurable tolerance
  - Create TypographySimilarityGroupingStrategy comparing fontName, fontSize, and fontWeight properties
  - Build NumericRangeGroupingStrategy with unit detection and configurable range buckets
  - Develop SimilarityDetector with fuzzy matching algorithms for identifying near-identical values
  - Create UserConfigurableGroupingStrategy that stores and applies custom user grouping preferences
  - Implement UsageTracker to count variable occurrences across the document

Subtask 2.4: Outline performance requirements for scanning large documents
  - Support documents with 5000+ nodes without UI freezing
  - Complete document scan in under 30 seconds for 1000-node documents
  - Provide incremental progress updates every 500ms
  - Allow background scanning with minimal performance impact
  - Support scan cancellation within 1 second of request
  - Implement progressive loading for large result sets (50+ items at a time)
  - Cache scan results for 5 minutes to avoid redundant scans
  - Memory usage should not exceed 100MB for standard documents
  - Handle timeouts gracefully with partial results and resume options
  - Support pagination for displaying large result sets

  Development instructions:
  - Implement a chunkedProcessing() function that processes nodes in batches of 100-200 at a time
  - Create a ProgressReporter class with throttled UI updates (using requestAnimationFrame)
  - Build performance profiling utilities to measure and optimize scan operations
  - Implement DocumentScanner using Web Workers to prevent main thread blocking
  - Create an AbortController-based cancellation system that responds within 1 second
  - Develop a VirtualizedResultsRenderer to efficiently display large result sets
  - Implement a ResultsCache using localStorage/IndexedDB with expiration and invalidation logic
  - Create a MemoryMonitor utility to prevent excessive memory consumption
  - Build a TimeoutManager with configurable thresholds and automatic pausing
  - Implement a ResultsPaginator with optimized data structure for fast page access

Subtask 2.5: Define UI requirements for displaying grouped scan results
  - Display variable type icons for quick visual identification
  - Show count of each variable type in group headers
  - Provide collapsible groups for organizing large result sets
  - Display color swatches for color variables
  - Show typography previews for text variables
  - Show numeric value and unit for dimension variables
  - Display library source information with status indicator
  - Provide quick-action buttons for common operations (select, unlink)
  - Support hierarchical display of nested variable references
  - Include sorting options (alphabetical, usage count, type)
  - Provide filtering controls for narrowing displayed results
  - Support search functionality for finding specific variables
  - Include batch selection controls for multiple operations
  - Show selected state clearly for all interactive elements
  - Display error states for problematic variables

  Development instructions:
  - Create a VariableIconMapper for mapping variable types to SVG icons
  - Implement a GroupHeaderComponent with type count and collapsible UI behavior
  - Develop a CollapsibleGroupContainer with efficient render/collapse state management
  - Create type-specific preview components: ColorSwatch, TypographyPreview, NumericValueDisplay
  - Implement a LibraryStatusIndicator component with active/inactive state visualization
  - Build ActionButtonGroup component with standardized select/unlink operations
  - Create a NestedVariableTree component for hierarchical variable reference display
  - Implement SortController with multiple sort strategies (alphabetical, usage, type)
  - Develop FilterBar component with support for multiple simultaneous filters
  - Create a SearchBox component with real-time filtering capabilities
  - Implement BatchSelectionControls with select all/none and range selection
  - Build a SelectionStateManager to track and visualize selected items
  - Create an ErrorStateDisplay component for showing variable resolution issues

Subtask 2.6: Establish success criteria for new features
  - Successfully scan and identify 100% of variable references in test documents
  - Group variables with 95% accuracy based on defined criteria
  - Achieve under 2-second response time for selection-based scanning
  - Support scanning of all Figma variable types (color, number, string, boolean, instance swap)
  - Unlink variables while preserving original values with 100% accuracy
  - Support batch operations on up to 100 variables simultaneously
  - Maintain UI responsiveness during all operations
  - Achieve 95% user satisfaction rate in usability testing
  - Reduce scan time by 40% compared to previous implementation
  - Zero crashes on documents with 10,000+ nodes
  - Successfully handle all error cases with user-friendly messages
  - Support all Figma platform versions released in the past 12 months

  Development instructions:
  - Create a TestDocumentGenerator with various variable configurations for automated testing
  - Implement VariableScannerTester to validate reference detection accuracy
  - Build PerformanceBenchmarker to measure and optimize scanning response times
  - Create handlers for all Figma variable types: VariableColor, VariableNumber, VariableString, VariableBoolean, VariableInstanceSwap
  - Implement UnlinkStrategy classes for each variable type that preserve original values
  - Develop a BatchProcessor with optimized memory usage for handling large operations
  - Create a UIResponsivenessMonitor to detect and prevent thread blocking
  - Build TestFeedbackCollector for gathering and analyzing usability metrics
  - Implement PerformanceComparator to benchmark against previous implementations
  - Create a StressTestRunner for validating stability with extremely large documents
  - Develop a comprehensive ErrorHandler system with user-friendly message mappings
  - Build a VersionCompatibilityTester to validate plugin across different Figma versions


Phase 2: Core Functionality Development
Task 3: Implement Enhanced Variable Collection System
Subtask 3.1: Create interfaces for enhanced token grouping
  - Define VariableToken interface with comprehensive type information
  - Create VariableGroup interface for organizing related variables
  - Define TokenMetadata interface with usage and source information
  - Create LibrarySource interface with activation status
  - Define VariableReference interface for tracking usage instances
  - Create SimilarityGroup interface for clustering similar variables
  - Define GroupingCriteria interface for customizable organization
  - Create interfaces for specific variable types (ColorVariable, TypographyVariable, etc.)

  Development instructions:
  - Create a types/ directory for all TypeScript interfaces
  - Define VariableToken interface extending Figma's Variable type with additional properties
  - Implement VariableGroup<T extends VariableToken> as a generic interface for type-safe grouping
  - Create TokenMetadata interface with properties: usageCount, nodeReferences, librarySource, lastModified
  - Build LibrarySource interface with properties: id, name, isActive, version, lastUpdated
  - Implement VariableReference interface to track where variables are used: nodeId, propertyPath, valueMode
  - Create SimilarityGroup<T> interface with properties: primaryToken, similarTokens, similarityMetric, matchThreshold
  - Define GroupingCriteria interface with configurable sorting and filtering options
  - Implement specialized interfaces: ColorVariable (RGB/HSL values), TypographyVariable (font properties), NumberVariable (value/unit), BooleanVariable, StringVariable
  - Add proper JSDoc comments to all interfaces for IDE tooltip support
  - Create a central types.ts barrel file exporting all interfaces

Subtask 3.2: Implement getDocumentVariables function to retrieve all document variables
  - Create function to retrieve local and library variables
  - Add support for cached retrieval to improve performance
  - Include metadata about variable collections and libraries
  - Handle paginated retrieval for documents with many variables
  - Add parameter options for filtering by collection or type
  - Track retrieval time and optimize for large variable sets
  - Include error handling for API limitations

  Development instructions:
  - Create a variables/documentVariables.ts module with async getDocumentVariables() function
  - Implement caching with cache-key generation based on document ID + timestamp
  - Use Promise.all to parallelize local and library variable retrieval
  - Utilize figma.variables.getLocalVariables() and figma.variables.getVariableCollectionsByDocument()
  - Create getVariableCollections() helper that handles collection metadata retrieval
  - Implement getLibraryVariables() function to retrieve variables from external libraries
  - Build pagination logic with configurable batch size (default 1000 items)
  - Add optional parameters: collectionId, variableType, includeLibraryVariables
  - Create performance tracking with startTime/endTime measurements
  - Implement rate limiting detection and retry logic with exponential backoff
  - Add detailed error handling for common API errors with descriptive messages
  - Create a VariableCollectionMap data structure for quick variable lookup by collection

Subtask 3.3: Create functions to categorize variables by type (color, number, boolean, etc.)
  - Implement type detection and classification logic
  - Create separate processing functions for each variable type
  - Develop specialized handlers for complex variable types (gradients, images)
  - Build category mapping system for custom grouping
  - Create functions to extract type-specific values for comparison
  - Implement validators for each variable type
  - Design type conversion system for value comparisons

  Development instructions:
  - Create a variables/categorization.ts module with categorizeVariables() function
  - Implement getVariableType() function using variable.resolvedType with fallback to value inspection
  - Create specialized processor functions: processColorVariable(), processTypographyVariable(), etc.
  - Build handlers for complex types: processGradientVariable(), processImageVariable() 
  - Develop a CategoryMapper class with pluggable mapping strategies
  - Create value extraction functions: extractColorValue(), extractTypographyValue(), extractNumberValue()
  - Implement validation functions: isValidColorVariable(), isValidNumberVariable(), etc.
  - Build type conversion utilities: convertToRGB(), convertToHSL(), normalizeNumber()
  - Create comparator functions to determine similarity: compareColors(), compareTypography(), etc.
  - Implement a TypeRegistry for registering custom variable type handlers
  - Add a memoization system for frequently accessed variable types

Subtask 3.4: Implement library detection and grouping logic
  - Create functions to identify variable library sources
  - Implement detection for missing or inactive libraries
  - Add methods to group variables by library source
  - Create library activation status checking
  - Implement quick library activation options
  - Add library metadata extraction for version tracking
  - Design cached library detection to improve performance
  - Create library dependency mapping for complex documents

  Development instructions:
  - Create a libraries/libraryManager.ts module
  - Implement getVariableLibraries() function that uses figma.getLibraries()
  - Create detectInactiveLibraries() function that compares used libraries with available ones
  - Build groupVariablesByLibrary() function with library source as the grouping key
  - Implement checkLibraryActivation() function to determine if a library is currently active
  - Create activateLibrary() utility to programmatically enable a library if permissions allow
  - Build extractLibraryMetadata() to pull version, lastModified, and other metadata
  - Implement library cache with configurable TTL (Time To Live) of 5 minutes
  - Create a LibraryDependencyGraph class to map relationships between libraries
  - Add functions to identify orphaned variables from deleted libraries
  - Implement library health checks to detect deprecated or updated libraries
  - Build user notification system for library status changes

Subtask 3.5: Add usage counting mechanism to track variable references
  - Implement reference counting across document nodes
  - Create data structure to track usage by node type
  - Add functionality to identify most/least used variables
  - Implement usage tracking by component instance
  - Design usage history for tracking changes over time
  - Add methods to detect orphaned variables
  - Create usage visualization data preparation
  - Implement statistical analysis for usage patterns

  Development instructions:
  - Create a usage/usageTracker.ts module with trackVariableUsage() function
  - Implement countVariableReferences() that traverses the document and counts occurrences
  - Build a UsageMap data structure with nodeId → variableId → propertyPath mapping
  - Create getMostUsedVariables() and getLeastUsedVariables() utility functions
  - Implement trackComponentInstanceUsage() for detailed component-level analysis
  - Build UsageHistory class with append(), getHistory(), and compareSnapshots() methods
  - Create detectOrphanedVariables() to find variables not referenced in the document
  - Implement prepareUsageVisualizationData() to generate data for charts/graphs
  - Build a UsageStatistics class with methods for calculating mean, median, max usage
  - Create a usage indexer for efficient variable reference lookup
  - Implement node type categorization for usage reports (usage by frame, component, text, etc.)
  - Build a real-time usage tracking system that updates with document changes

Subtask 3.6: Create helper functions for accessing variable metadata efficiently
  - Design caching system for frequently accessed metadata
  - Create utility functions for common variable operations
  - Implement metadata extraction with error handling
  - Add methods for metadata comparison and validation
  - Create type conversion utilities for consistent handling
  - Implement search functionality within metadata
  - Design serialization methods for efficient storage
  - Add debugging utilities for metadata inspection

  Development instructions:
  - Create a utils/variableMetadata.ts module with core metadata utilities
  - Implement MetadataCache using a LRU (Least Recently Used) cache policy
  - Create standardized utility functions: getVariableName(), getVariableCollection(), getVariableMode()
  - Build extractMetadata() function with comprehensive error handling and timeouts
  - Implement compareMetadata() for detecting differences between variable metadata
  - Create validateMetadata() to ensure metadata integrity and completeness
  - Build type conversion utilities: toColorFormat(), toNumberFormat(), toStringFormat()
  - Implement searchMetadata() with support for fuzzy matching and filters
  - Create serialize() and deserialize() functions for efficient JSON storage
  - Build debugging utilities: inspectMetadata(), logMetadataIssues(), exportMetadataReport()
  - Implement batch processing functions for handling multiple variables efficiently
  - Create a MetadataWatcher to track changes and update cached values automatically


Task 4: Develop Document-Wide Scanning Feature
Subtask 4.1: Create scanEntireDocument function skeleton with progress reporting
  - Implement function structure with proper TypeScript typing
  - Add progress callback parameter for UI updates
  - Create cancellation token support for user interruption
  - Design modular structure for maintainability
  - Add logging hooks for error tracking
  - Implement options parameter for scan configuration
  - Create result formatter for consistent output
  - Add performance metrics collection

  Development instructions:
  - Create a scanning/documentScanner.ts module with async scanEntireDocument() function
  - Define comprehensive interface for scan options: ScanOptions { variableTypes, includeLibraries, maxDepth, etc. }
  - Implement ProgressCallback type: (progress: number, status: string, stage: ScanStage) => void
  - Create AbortController integration for cancellation support
  - Add structured logging with LogLevel enum (DEBUG, INFO, WARNING, ERROR)
  - Implement ScanResult interface with typed collections for different variable categories
  - Create performance hooks using performance.now() at key points in the process
  - Build result formatter functions that standardize output for UI consumption
  - Implement error handling with custom ScanError class extending Error

Subtask 4.2: Implement document traversal algorithm with node filtering
  - Create efficient node traversal with depth control
  - Implement node type filtering to focus on relevant elements
  - Add support for handling nested component instances
  - Design memory-efficient traversal for large documents
  - Create progressive traversal with yield points
  - Implement node caching to avoid redundant processing
  - Add special handling for groups and frames
  - Create optimized traversal paths based on node hierarchy

  Development instructions:
  - Create a traversal/nodeTraversal.ts module with traverseDocument() function
  - Implement breadth-first traversal with configurable maxDepth parameter
  - Create NodeFilter interface with isNodeEligible() method for filtering by type, property
  - Develop ComponentInstanceTraverser to handle nested component traversal
  - Implement memory-efficient callback-based traversal rather than building large arrays
  - Create checkpointable traversal with saveTraversalState() and resumeTraversalState() methods
  - Build NodeCache class with LRU eviction policy to avoid redundant processing
  - Implement specialized handlers: processGroup(), processFrame(), processComponent()
  - Create smart traversal that prioritizes visible nodes and skips hidden/zero-opacity elements
  - Develop HierarchyOptimizer class that calculates optimal traversal paths based on document structure

Subtask 4.3: Add variable binding detection for each supported property
  - Implement color variable detection for fills and strokes
  - Create text variable detection for typography properties
  - Add number variable detection for sizing and spacing
  - Implement boolean variable detection for visibility
  - Create instance swap variable detection
  - Add detection for variables in effects (shadows, blurs)
  - Implement grid and layout variable detection
  - Create composite variable detection for complex properties

  Development instructions:
  - Create a detection/variableDetector.ts module with detect() function for each variable type
  - Implement detectColorVariables() using node.fillStyleId and node.strokeStyleId properties
  - Create detectTypographyVariables() examining text nodes for variable bindings
  - Build detectNumberVariables() checking size, position, and spacing properties
  - Implement detectBooleanVariables() examining visibility and other toggle properties
  - Create detectInstanceSwapVariables() for component set variant handling
  - Implement detectEffectVariables() for shadow, blur, and other effect properties
  - Build detectGridVariables() for layout grid settings
  - Create detectCompositeVariables() for properties combining multiple variable types
  - Implement a VariableDetectionRegistry for plugin extensibility with custom detectors

Subtask 4.4: Implement token grouping by type, collection, and library
  - Create hierarchical grouping system with multiple criteria
  - Implement sorting within grouped results
  - Add metadata enrichment for grouped tokens
  - Design collapsible group data structure
  - Implement group statistics calculation
  - Create visualization data for grouped results
  - Add search indexing within groups
  - Implement custom grouping based on user preferences

  Development instructions:
  - Create a grouping/tokenGrouper.ts module with groupTokens() function
  - Implement a GroupingStrategy interface and specific strategies (TypeGrouper, LibraryGrouper, etc.)
  - Build a GroupedTokenResult class with hierarchical storage of grouped results
  - Create GroupSorter class with pluggable SortStrategy implementations
  - Implement TokenMetadataEnricher adding usage statistics and context information
  - Create CollapsibleGroupStructure with expanded/collapsed state management
  - Build GroupStatisticsCalculator to compute usage, frequency, and value distribution stats
  - Implement VisualizationDataPreparer for generating chart and graph ready data
  - Create SearchIndexer with fast group content search capabilities
  - Develop UserDefinedGrouper reading from persistent grouping preferences


Subtask 4.7: Add filtering options to narrow scan by variable types
  - Implement type-based filtering controls
  - Create collection-based filtering options
  - Add library-based filtering capability
  - Design combined filtering with multiple criteria
  - Implement filter persistence between sessions
  - Create preset filters for common scenarios
  - Add dynamic filter suggestions based on document content
  - Implement filter performance optimization

  Development instructions:
  - Create a filters/scanFilters.ts module with ScanFilter interface
  - Implement TypeFilter that limits scanning to specific variable types
  - Build CollectionFilter that restricts scope to specific variable collections
  - Create LibraryFilter allowing filtering by source library properties
  - Implement CompoundFilter for combining multiple filters with AND/OR operators
  - Build FilterStorage for persisting user filters in plugin settings
  - Create PresetFilter factory with standard filtering combinations
  - Implement FilterSuggestionEngine analyzing document to recommend useful filters
  - Build FilterOptimizer to arrange filter execution order for maximum efficiency
  - Develop CachedFilterResults to store and quickly retrieve previous filter results

Task 5: Implement Selection-Based Scanning
Subtask 5.1: Create scanSelection function that accepts node selection
  - Design function signature with proper typing
  - Implement selection validation and error handling
  - Add support for multi-node selection
  - Create performance optimization for small selections
  - Implement result formatting specific to selection context
  - Add comparison with document-wide results
  - Create selection metadata extraction
  - Design modular structure for reusability

  Development instructions:
  - Create a scanning/selectionScanner.ts module with async scanSelection() function
  - Define SelectionScanOptions interface extending base ScanOptions with selection-specific params
  - Implement selectionToNodes() utility to convert figma.currentPage.selection to a normalized array
  - Create SelectionValidator class with validate() method to catch invalid selections early
  - Build SmallSelectionOptimizer with fast path for selections under 10 nodes
  - Implement SelectionResultFormatter customizing output format for selection context
  - Create SelectionComparator to diff selection results against document-wide results
  - Build SelectionMetadataExtractor for gathering selection statistics and properties
  - Develop modular scan stages that can be reused for both selection and document scanning

Subtask 5.2: Add scope detection (selection, parent frame, group, page)
  - Implement automatic scope detection based on selection
  - Create scope expansion options (parent, group, page)
  - Add user-configurable scope settings
  - Design scope visualization data preparation
  - Implement scope boundary calculation
  - Create scope-aware traversal optimization
  - Add scope metadata for result contextualization
  - Implement scope hierarchy navigation

  Development instructions:
  - Create a selection/scopeDetector.ts module with detectScope() function
  - Implement getDefaultScope() using selection characteristics to determine optimal scope
  - Build expandScope() with options: SELECTION, PARENT, GROUP, PAGE, COMPONENT
  - Create ScopeSettings class for storing user preferences on scope handling
  - Implement prepareScopeVisualization() generating data for UI representation of scope
  - Build ScopeBoundary class calculating geometric bounds of the current scope
  - Create optimizeTraversalForScope() function tailoring traversal to scope specifics
  - Implement ScopeMetadata for annotating results with scope context information
  - Develop navigateScopeHierarchy() for traversing up/down through scope levels
  - Build intelligent scope suggestion based on selection size and distribution

Subtask 5.3: Implement recursive scanning within specified scope
  - Design efficient recursive traversal for selection scope
  - Create depth limiting options for controlled recursion
  - Implement special handling for nested component instances
  - Add detection for variables crossing scope boundaries
  - Create progress tracking specific to scope size
  - Implement memory optimization for deep recursion
  - Add early termination options for large scopes
  - Design result aggregation from recursive operations

  Development instructions:
  - Create a scanning/recursiveScanner.ts module with recursiveScan() function
  - Implement efficientRecursiveTraversal() with stack-based rather than call-stack recursion
  - Build RecursionConfig with depth limiting options (maxDepth, skipNestedInstances)
  - Create NestedComponentHandler for traversing component instances without duplication
  - Implement detectCrossBoundaryVariables() finding variables that link across scope boundaries
  - Build ScopeBasedProgressTracker scaled to the specific size of selected scope
  - Create MemoryEfficientRecursion class with incremental processing and cleanup
  - Implement EarlyTerminationStrategy with heuristics for when to stop large scope scans
  - Develop RecursiveResultAggregator merging results from multiple recursive operations
  - Build automatic depth suggestion based on selection complexity

Subtask 5.4: Add logic to compare selection values with document-wide values
  - Create differential analysis between selection and document
  - Implement unique/shared variable identification
  - Add statistical comparison of usage patterns
  - Design visualization data for comparison results
  - Create filtering based on comparison criteria
  - Implement sorting by relevance to selection
  - Add highlighted differences in result display
  - Create summary statistics for quick comparison

  Development instructions:
  - Create a comparison/selectionComparison.ts module with compareWithDocument() function
  - Implement DifferentialAnalyzer generating detailed differences between scopes
  - Build VariableSetComparator with findUnique() and findShared() methods
  - Create UsagePatternAnalyzer comparing frequency and distribution statistics
  - Implement ComparisonDataVisualizer generating charts and visual comparison data
  - Build ComparisonFilter for filtering results based on difference criteria
  - Create RelevanceSorter prioritizing results by selection-specific importance
  - Implement DifferenceHighlighter marking significant differences for UI display
  - Develop ComparisonSummary generating quick overview statistics
  - Build real-time comparison updating when selection or document changes

Subtask 5.5: Implement special handling for mixed selection types
  - Create type detection for heterogeneous selections
  - Implement grouped processing by node type
  - Add specialized variable detection for each type
  - Design result organization for mixed selections
  - Create type-specific filtering options
  - Implement priority handling for significant types
  - Add warnings for incompatible selection combinations
  - Design user guidance for mixed selection scanning

  Development instructions:
  - Create a selection/mixedSelectionHandler.ts module with processMixedSelection() function
  - Implement SelectionTypeDetector identifying the composition of heterogeneous selections
  - Build TypeBasedProcessor grouping and processing nodes by their Figma node type
  - Create specialized detectors: TextVariableDetector, ShapeVariableDetector, FrameVariableDetector
  - Implement MixedResultOrganizer structuring results for intuitive mixed-type presentation
  - Build TypeSpecificFilterFactory generating relevant filters for each detected type
  - Create PriorityTypeHandler emphasizing the most relevant node types in mixed selections
  - Implement SelectionWarningSystem detecting and reporting problematic combinations
  - Develop UserGuidanceGenerator providing context-specific recommendations
  - Build automatic selection correction suggestions when suboptimal combinations detected

Subtask 5.6: Create selection boundary detection for partial frame scanning
  - Implement geometric boundary calculation
  - Create efficient spatial indexing for large selections
  - Add containment analysis for partial selections
  - Design data structure for boundary representation
  - Implement optimized traversal using boundary information
  - Create boundary visualization data preparation
  - Add boundary expansion options for context
  - Implement boundary-based filtering of results

  Development instructions:
  - Create a geometry/boundaryDetector.ts module with calculateSelectionBounds() function
  - Implement Rect class with efficient geometric operations for boundary calculations
  - Build SpatialIndex using quadtree/rtree for efficient spatial queries with large selections
  - Create ContainmentAnalyzer determining how selection relates to parent containers
  - Implement BoundaryRepresentation optimized for fast containment tests
  - Build BoundaryAwareTraversal using spatial information to optimize node visiting
  - Create BoundaryVisualizer generating data for UI representation of selection bounds
  - Implement BoundaryExpander with configurable margin/padding for contextual selection
  - Build BoundaryFilter for limiting results to specific geometric regions
  - Develop smart boundary calculation handling rotated, nested and complex node selections

Subtask 5.7: Add progress reporting specific to selection size
  - Create size-aware progress calculation
  - Implement detailed progress stages for complex selections
  - Add time estimation based on selection complexity
  - Design progress UI data preparation
  - Implement cancellation support for selection scans
  - Create granular progress for multi-stage operations
  - Add performance data collection during scanning
  - Implement adaptive progress resolution based on selection size

  Development instructions:
  - Create a progress/selectionProgress.ts module with SelectionProgressTracker class
  - Implement calculateProgressWeight() scaling progress reporting to selection size
  - Build MultiStageProgress dividing complex operations into named stages with substeps
  - Create SelectionTimeEstimator using selection characteristics to predict completion time
  - Implement ProgressDataFormatter generating standardized data for UI consumption
  - Build CancellableSelectionScanner with interrupt points for responsive cancellation
  - Create GranularProgressReporter with detailed substep reporting for complex operations
  - Implement PerformanceCollector gathering metrics during scanning for optimization
  - Build AdaptiveProgressResolution adjusting reporting frequency based on selection size
  - Develop visual progress representations customized for selection context

Task 6: Build Token Grouping System
Subtask 6.1: Implement ValueGroup and TokenValue interfaces
  - Create comprehensive interfaces aligned with user stories from Task 2.3
  - Include properties for metadata tracking from Subtask 3.1
  - Add methods for group manipulation and organization
  - Implement serialization support for caching
  - Add type safety with TypeScript generics
  - Include versioning for forward compatibility
  - Create helper methods for common operations

  Development instructions:
  - Create a types/tokenGrouping.ts file for interface definitions
  - Define TokenValue interface with id, name, type, value, metadata, sourceId properties
  - Implement ValueGroup<T extends TokenValue> with items, metadata, groupMetrics properties
  - Create GroupMetadata interface with usageStats, lastUpdated, sourceInfo properties
  - Build methods for group operations: addItem(), removeItem(), mergeGroup(), splitGroup()
  - Implement Serializable interface with toJSON() and fromJSON() methods
  - Create TypeScriptGenerics with T extends TokenValue for proper type narrowing
  - Add SchemaVersion property with migration utilities for backward compatibility
  - Build TokenValueFactory with createColor(), createTypography(), createNumber() methods
  - Implement helper utilities: findInGroup(), sortGroup(), filterGroup(), mapGroup()
  - Create comprehensive JSDoc documentation for all interfaces and types

Subtask 6.2: Create groupByType function to organize tokens by variable type
  - Implement logic based on type criteria from Task 2.3
  - Support nested type grouping for complex types
  - Add sorting options within type groups
  - Create display metadata for each type group
  - Implement filtering within type groups
  - Add count tracking for group statistics
  - Create type-specific comparison functions

  Development instructions:
  - Create a grouping/typeGrouper.ts module with groupByType() function
  - Implement getTypeCategory() function that normalizes Figma variable types
  - Build support for nested grouping with subtypes (e.g., color → gradient → linear/radial)
  - Create TypeGroupSorter with multiple sort strategies (alphabetical, usage, etc.)
  - Implement TypeGroupMetadata with display info, icon, descriptions for each type
  - Build FilterableTypeGroup with type-specific filtering capabilities
  - Create TypeGroupStatistics tracking count, usage metrics, and distribution analysis
  - Implement comparison functions for each type: compareColors(), compareTypography(), etc.
  - Build TypeGroupRegistry for registering custom type handlers
  - Create visualization data preparation for type-based grouping display
  - Implement intelligent type detection for ambiguous variable types

Subtask 6.3: Create groupByCollection function to organize by variable collection
  - Implement collection detection and identification
  - Create collection metadata extraction and enrichment
  - Add sorting options within collection groups
  - Design nested grouping with collection and type
  - Implement collection statistics calculation
  - Create visualization data for collection groups
  - Add collection comparison functionality
  - Implement collection relationship mapping

  Development instructions:
  - Create a grouping/collectionGrouper.ts module with groupByCollection() function
  - Implement CollectionDetector with getVariableCollection() and getParentCollection() methods
  - Build CollectionMetadataEnricher adding name, description, and usage information
  - Create CollectionSorter with multiple sort options (name, size, usage)
  - Implement NestedCollectionGrouper supporting collection→type hierarchical grouping
  - Build CollectionStatistics calculating usage metrics, item distribution, etc.
  - Create CollectionVisualizationPreparer generating data for UI visualization
  - Implement CollectionComparator for finding similarities and differences between collections
  - Build CollectionRelationshipMapper creating graph of collection dependencies
  - Develop collection identity resolution for matching collections across documents
  - Create smart collection grouping based on naming patterns (Design System 1.0, etc.)

Subtask 6.4: Create groupByLibrary function to organize by source library
  - Implement library source detection and tracking
  - Create library status indication (active/inactive)
  - Add sorting by library relevance and usage
  - Design nested grouping with library and collection
  - Implement library metadata enrichment
  - Create visualization data for library grouping
  - Add quick actions for library management
  - Implement library dependency tracking

  Development instructions:
  - Create a grouping/libraryGrouper.ts module with groupByLibrary() function
  - Implement LibrarySourceDetector identifying origin libraries for variables
  - Build LibraryStatusIndicator with active/inactive/unavailable status detection
  - Create LibraryRelevanceSorter prioritizing by usage count and importance
  - Implement NestedLibraryGrouper supporting library→collection→type hierarchy
  - Build LibraryMetadataEnricher adding version, last updated, author information
  - Create LibraryVisualizationPreparer generating data for UI presentation
  - Implement QuickActionGenerator for common library operations (activate, update)
  - Build LibraryDependencyTracker mapping relationships between libraries
  - Develop orphaned variable detection for libraries no longer available
  - Create LibraryVersionResolver to handle variables from different library versions

Subtask 6.5: Implement usage-based grouping to highlight frequently used tokens
  - Create frequency analysis for variable usage
  - Implement tiered grouping by usage count
  - Add trend detection for usage patterns
  - Design visualization data for usage distribution
  - Create sorting options based on frequency
  - Implement filtering by usage thresholds
  - Add usage context information
  - Create statistical summary for usage groups

  Development instructions:
  - Create a grouping/usageGrouper.ts module with groupByUsage() function
  - Implement UsageFrequencyAnalyzer calculating detailed usage metrics
  - Build TieredUsageGrouper with configurable tiers (high/medium/low usage)
  - Create TrendDetector analyzing usage patterns over time from history data
  - Implement UsageDistributionVisualizer generating charts and heatmaps
  - Build FrequencySorter with multiple frequency-based sorting strategies
  - Create UsageThresholdFilter for filtering by minimum/maximum usage counts
  - Implement UsageContextCollector gathering where and how variables are used
  - Build UsageStatisticsSummarizer generating statistical reports on usage
  - Develop real-time usage tracking for updating groups as document changes
  - Create usage prediction for suggesting which variables are likely to be used next

Subtask 6.6: Add sorting capabilities within groups (alphabetical, usage, etc.)
  - Implement multiple sorting criteria and algorithms
  - Create custom sort function generator
  - Add persistent sort preferences
  - Design visual indicators for sort direction
  - Implement performance optimization for large group sorting
  - Create compound sorting with multiple keys
  - Add sorting preview generation
  - Implement sort state persistence

  Development instructions:
  - Create a sorting/groupSorter.ts module with sortGroup() function
  - Implement SortStrategy interface with multiple implementations (Alphabetical, Usage, Type)
  - Build SortFunctionGenerator creating optimal sort functions for specific criteria
  - Create SortPreferenceManager persisting and retrieving user sort preferences
  - Implement SortDirectionIndicator generating data for UI sort indicators
  - Build OptimizedSorter with performance-focused algorithms for large datasets
  - Create CompoundSorter supporting multiple sort keys with priority levels
  - Implement SortPreviewGenerator showing quick preview of sort results
  - Build SortStateManager maintaining sort state across plugin sessions
  - Develop smart sorting detecting and suggesting optimal sort for current context
  - Create hybrid sorting combining multiple strategies based on group content

Subtask 6.7: Create functions to merge and split groups based on user preferences
  - Implement flexible group manipulation operations
  - Create criteria-based automatic grouping
  - Add manual group management capabilities
  - Design history tracking for group operations
  - Implement undo/redo for grouping changes
  - Create group metadata preservation during operations
  - Add validation for group operations
  - Implement efficiency optimization for large groups

  Development instructions:
  - Create a grouping/groupManager.ts module with mergeGroups() and splitGroup() functions
  - Implement GroupManipulator class with detailed operations for restructuring groups
  - Build AutomaticGrouper using configurable criteria for smart grouping suggestions
  - Create ManualGroupingTools for user-controlled group management
  - Implement GroupOperationHistory tracking changes with timestamp and user info
  - Build UndoableGroupOperation with undo() and redo() capabilities
  - Create MetadataPreserver maintaining group metadata through structural changes
  - Implement GroupOperationValidator ensuring operations maintain data integrity
  - Build LargeGroupOptimizer with specialized algorithms for efficient large group handling
  - Develop group operation suggestion system based on content analysis
  - Create visual grouping preview generator to show operation results before applying

Task 7: Develop Batch Unlinking Functionality
Subtask 7.1: Create batchUnlinkVariables function to handle multiple variables
  - Implement function signature with proper typing
  - Create batched operation handling for efficiency
  - Add progress reporting for batch operations
  - Design error handling for partial failures
  - Implement transaction support for atomicity
  - Create result aggregation and statistics
  - Add performance optimization for large batches
  - Implement priority handling for critical variables

  Development instructions:
  - Create an unlinking/batchUnlinker.ts module with async batchUnlinkVariables() function
  - Define BatchUnlinkOptions interface with strategy, transaction, priority settings
  - Implement BatchProcessor with chunk processing (100 nodes at a time) for performance
  - Create ProgressReporter with stage, percentage, and ETA information
  - Build PartialFailureHandler continuing operation despite individual unlink failures
  - Implement TransactionManager creating atomic operations that can be rolled back
  - Create ResultAggregator collecting success/failure statistics from individual operations
  - Build PerformanceOptimizer with node sorting and grouping for maximum efficiency
  - Implement PriorityQueue handling critical variables first and less important ones later
  - Develop batch operation preparation with preflight checks and validation
  - Create operation splitting for handling extremely large batches

Subtask 7.2: Implement unlinking strategies (remove binding, preserve value)
  - Create configurable unlinking strategies
  - Implement value preservation during unlinking
  - Add specialized handlers for each variable type
  - Design strategy selection UI data preparation
  - Implement fallback strategies for error cases
  - Create strategy recommendation system
  - Add strategy impact preview
  - Implement strategy performance optimization

  Development instructions:
  - Create a strategies/unlinkStrategies.ts module with UnlinkStrategy interface
  - Implement PreserveValueStrategy that maintains visual appearance while removing bindings
  - Build RemoveBindingStrategy with options for default value behavior
  - Create type-specific handlers: ColorUnlinker, TypographyUnlinker, NumberUnlinker
  - Implement StrategyUIDataGenerator creating data for strategy selection UI
  - Build FallbackStrategyResolver providing alternatives when primary strategy fails
  - Create StrategyRecommender analyzing variables to suggest optimal unlinking approach
  - Implement StrategyPreviewGenerator showing before/after for strategy application
  - Build StrategyPerformanceProfiles optimizing execution based on variable characteristics
  - Develop strategy composition allowing multiple strategies for different variable types
  - Create custom strategy builder for advanced user flexibility

Subtask 7.3: Add node update functionality to apply changes to document
  - Create efficient node updating mechanism
  - Implement batched updates for performance
  - Add validation before applying changes
  - Design change logging for debugging
  - Implement retry mechanism for failed updates
  - Create update sequence optimization
  - Add before/after state tracking
  - Implement selective update for partial operations

  Development instructions:
  - Create a document/nodeUpdater.ts module with updateNodes() function
  - Implement efficientNodeUpdate() minimizing document reflow operations
  - Build BatchedUpdater applying changes in optimal batches (25-50 nodes at a time)
  - Create UpdateValidator ensuring changes won't corrupt document state
  - Implement ChangeLogger recording all modifications for debugging and auditing
  - Build RetryManager with exponential backoff for handling transient failures
  - Create UpdateSequencer determining optimal order for applying changes
  - Implement StateTracker recording before/after states for each modified node
  - Build SelectiveUpdater supporting partial application of a larger change set
  - Develop change diffing to minimize the number of properties that need updating
  - Create smart batching grouping similar nodes for efficient updates

Subtask 7.4: Implement progress tracking for batch operations
  - Create detailed multi-stage progress reporting
  - Implement time estimation based on batch size
  - Add cancellation support for long-running operations
  - Design progress visualization data preparation
  - Implement granular progress for complex operations
  - Create failure counting during progress
  - Add performance metrics collection
  - Implement adaptive progress resolution

  Development instructions:
  - Create a progress/batchProgress.ts module with BatchProgressTracker class
  - Implement MultiStageProgress dividing operation into preparation, execution, verification stages
  - Build TimeEstimator using batch size and node complexity for accurate predictions
  - Create CancellableOperation with checkpoints for responsive interruption
  - Implement ProgressVisualizationDataGenerator for UI consumption
  - Build GranularProgressReporter with substep tracking for complex operations
  - Create FailureCounter tracking and categorizing errors during batch processing
  - Implement PerformanceMetricsCollector gathering timing data at each stage
  - Build AdaptiveProgressResolution adjusting detail level based on operation size
  - Develop progress persistence for resuming operations after plugin restart
  - Create progress summary generation for operation completion report

Subtask 7.5: Create error handling for failed unlinking attempts
  - Implement comprehensive error detection
  - Create readable error messages for users
  - Add recovery suggestions for common errors
  - Design error aggregation for batch reporting
  - Implement partial success handling
  - Create error logging for debugging
  - Add retry options for recoverable errors
  - Implement graceful degradation for critical failures

  Development instructions:
  - Create an errors/unlinkErrorHandler.ts module with handleUnlinkError() function
  - Implement ErrorDetector with specific checks for common unlink failure patterns
  - Build UserFriendlyErrorFormatter creating clear, actionable error messages
  - Create RecoverySuggestionGenerator providing guidance for resolving common issues
  - Implement ErrorAggregator categorizing and summarizing errors for batch operations
  - Build PartialSuccessHandler continuing operation despite individual failures
  - Create ErrorLogger with detailed context information for debugging
  - Implement RetryStrategy determining which operations can be safely retried
  - Build GracefulDegradation providing alternative approaches when optimal path fails
  - Develop error categorization system (user fixable, system issues, permissions, etc.)
  - Create error frequency analysis to detect patterns in failures

Subtask 7.7: Implement result reporting with success/failure counts
  - Create comprehensive result data structure
  - Implement statistical summary generation
  - Add detailed success/failure breakdown
  - Design visualization data for result reporting
  - Implement filtering options for results
  - Create exportable report generation
  - Add persistent result storage
  - Implement result comparison with previous operations

  Development instructions:
  - Create a reporting/batchResults.ts module with BatchOperationResult class
  - Implement ResultStatistics with detailed success/failure/partial counts
  - Build DetailedResultBreakdown listing results for individual nodes and variables
  - Create VisualizationDataGenerator for charts and visual result representation
  - Implement ResultFilter for focusing on specific result categories
  - Build ReportGenerator creating detailed operation summaries in multiple formats
  - Create ResultStorage persisting operation results between plugin sessions
  - Implement ResultComparator showing differences from previous operations
  - Build result categorization by node type, variable type, and error category
  - Develop result search capability for finding specific nodes or variables
  - Create action suggestion based on operation results

Phase 4: Integration and Performance Optimization
Task 11: Connect New Features to UI
Subtask 11.1: Wire scanEntireDocument function to document scanning UI
Subtask 11.2: Connect scanSelection function to selection scanning UI
Subtask 11.3: Link batchUnlinkVariables to batch operation controls
Subtask 11.4: Implement state management for scan results
Subtask 11.5: Add message handlers for plugin-UI communication
Subtask 11.6: Create event listeners for selection changes
Subtask 11.7: Implement data persistence for scan results between sessions

Task 12: Optimize Performance
Subtask 12.1: Implement virtual scrolling for large result sets
Subtask 12.2: Add result pagination to limit memory usage
Subtask 12.3: Optimize node traversal algorithms for large documents
Subtask 12.4: Add lazy loading for node previews and thumbnails

Task 13: Enhance Error Handling
Subtask 13.1: Add detailed error reporting for failed operations
Subtask 13.2: Implement fallback strategies for unsupported scenarios
Subtask 13.3: Create user-friendly error messages and recovery suggestions
Subtask 13.4: Add logging system for tracking issues
Subtask 13.5: Create automatic retry for temporary failures

