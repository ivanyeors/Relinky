# Relinky Development Guide

## General Development Guidelines
- "Unlinked Values" (Relink tab) and "Variables Unlinker" (Unlink tab) should always have separated development code
- Always create logs for all current and new features to track errors
- Always check the official documentation:
  - [Figma Plugin Documentation](https://www.figma.com/plugin-docs/)
  - [Figma Variables Documentation](https://www.figma.com/plugin-docs/working-with-variables/#get-variables)
  - [Figma UI Design Guidelines](https://www.figma.com/plugin-docs/ui-design-guidelines/)
  - [Vue.js Documentation](https://vuejs.org/api/)
  - [TypeScript Documentation](https://www.typescriptlang.org/docs/)
  - [Tailwind CSS Documentation](https://tailwindcss.com/docs/installation)
  - [HTML Documentation](https://www.w3schools.com/html/html_intro.asp)

## Style Consistency Guide
- Follow the same color palette for all components
- Follow the same font family for all text
- Follow the same padding for all sections (--spacing-xxs: 2px)
- Follow the same spacing between all components (4px)
- Use the same border radius for all components (6px)

----------

## Plugin Architecture

### Core Structure
- ✓ Tab-based navigation between "Relink" and "Unlink" features
- ✓ Shared components and utilities in common/ directory
- ✓ Feature-specific code in relink/ and unlink/ directories
- ✓ CSS for UI rendering
- ✓ TypeScript for type safety

### State Management
- ✓ Document state for watching changes
- ✓ Scan state for progress tracking
- ✓ Results management and grouping

## UI Components and Behavior

### Common UI Elements

#### Scan Settings Section
- ✓ Title & Watch Changes button → Scan Settings dropdown → Selection status
- ✓ Watch Changes button toggles automatic rescanning on document changes
- ✓ Scan Entire Page toggle with performance warning

#### Progress Bar
- ✓ Always visible during scanning operations
- ✓ Shows scan progress percentage
- ✓ Displays scanning status text inside progress bar:
  - ✓ Scanning: "Scanning..."
  - ✓ Ready to scan: "Ready to scan"
  - ✓ Scan complete: "Scan complete"
  - ✓ Scan complete no results: "Scan complete, no issues found"
  - ✓ Scan error: "Scan error"
- ✓ Progress bar state colors:
  - ✓ Scanning: Blue 
  - ✓ Ready to scan: Gray
  - ✓ Scan complete: Green
  - ✓ Scan error: Red

### Relink Tab (Unlinked Values)

#### Scan Criteria Section
- ✓ Title → Scan Selection card buttons
- ✓ Card buttons structure:
  - ✓ Icon on the left
  - ✓ Text title on the right
  - ✓ Title and description on the same line
  - ✓ Title above description
  - ✓ Title in bold
  - ✓ Description smaller than title

#### Results Section

##### Gap Scan Results
- ✓ Grouped by gap size
- ✓ Each gap result has a dropdown button to reveal grouped result details
- ✓ Grouped result details show:
  - ✓ Gap size
- ✓ Each group has a selection button to select all instances

##### Horizontal/Vertical Scan Results
- ✓ Grouped by horizontal/vertical
- ✓ Each result has a dropdown button to reveal grouped result details
- ✓ Grouped result details show:
  - ✓ Horizontal/Vertical size
- ✓ Each group has a selection button to select all instances

##### Color Fill/Color Stroke Scan Results
- ✓ Grouped by color fill/color stroke
- ✓ Each result shows title, description, and button
- ✓ Title and description on the same line
- ✓ Title above description in bold
- ✓ Description smaller than title
- ✓ Button on the right
- ✓ Each group has a selection button to select all instances

##### Typography Scan Results
- ✓ Grouped results title header shows:
  - ✓ Font family
  - ✓ Font size
  - ✓ Font weight
- ✓ Each result has a dropdown button to reveal grouped result details
- ✓ Grouped result details show:
  - ✓ Font family
  - ✓ Font size
  - ✓ Font weight
  - ✓ Font style
  - ✓ Font color
  - ✓ Background color
  - ✓ Text color
- ✓ Each group has a selection button to select all instances

### Unlink Tab (Variables Unlinker)

#### Feature Description
The Variables Unlinker scans for linked variables of all types (color, typography, spacing, etc.) and allows users to unlink them to their raw values, converting variable references to static values.

#### Scan Criteria Section
- ✓ Title → Variable Types Selection cards
- ✓ Variable Type Selection cards:
  - ✓ Icon on the left
  - ✓ Text title on the right
  - ✓ Each card represents a variable type (Color, Typography, Spacing, etc.)
  - ✓ Cards show selection state (selected/unselected)
  - ✓ Multiple selection allowed

#### Results Section

##### Linked Variables Scan Results
- ✓ Grouped by variable type
- ✓ Each group shows:
  - ✓ Variable type name
  - ✓ Total variables count
  - ✓ Collapsible group header

- ✓ Each variable in the group shows:
  - ✓ Variable name
  - ✓ Library source
  - ✓ Usage count
  - ✓ Preview based on variable type:
    - ✓ Color: Color swatch
    - ✓ Typography: Font preview
    - ✓ Number: Value with unit

- ✓ Each variable has:
  - ✓ Dropdown to show usage details
  - ✓ Unlink button to convert to raw value
  - ✓ Select all instances button

- ✓ Usage details show:
  - ✓ Node name
  - ✓ Property name (e.g., "fill", "text", "spacing")
  - ✓ Select instance button
  - ✓ Individual unlink option

- ✓ Group actions:
  - ✓ Select all variables by type
  - ✓ Unlink all variables in group

## Interaction States
Apply these states consistently across all interactive elements:
- ✓ Active state: Blue
- ✓ Hover state: Light Blue
- ✓ Focus state: Blue outline
- ✓ Disabled state: Gray
- ✓ Error state: Red
- ✓ Success state: Green
- ✓ Loading state: Loading spinner with dark blue color
  - ✓ Spinner style should always be consistent

## Error Handling
- ✓ Show clear error messages for:
  - ✓ Failed variable unlinking
  - ✓ Network connectivity issues
  - ✓ API limitations
  - ✓ Permission issues
- ✓ Provide retry options where applicable
- ✓ Cache results to prevent data loss

## Performance Considerations
- ✓ Implement debounce for document change watching (1000ms)
- ✓ Use pagination for large result sets
- ✓ Lazy load variable previews
- ✓ Cache variable collection results
- ✓ Batch process unlinking operations
- ✓ Progressive loading of usage details


---------------


## Future Development Roadmap

### Pro vs Free Version Features
- ✓ Free Version limitations:
  - ✓ Basic variable scanning
  - ✓ Limited selection options
  - ✓ Basic grouping features
  - ✓ Standard export options
- ✗ Pro Version features:
  - ✗ Advanced variable scanning
  - ✗ Comprehensive selection tools
  - ✗ Advanced grouping options
  - ✗ Premium export formats
  - ✗ Batch processing capabilities
  - ✗ Advanced filtering options

### Enhanced Variable Scanning Features
- ⧖ Scan for linked tokens from inactive libraries:
  - ✓ Identify all tokens linked to inactive libraries
  - ✓ Show activation status for each library
  - ⧖ Provide quick activation options
  - ✓ Group results by library source

- ✗ Similar Variable Token Scanning:
  - ✗ Group variables with similar properties
  - ✗ Compare variable values across different libraries
  - ✗ Identify potential consolidation opportunities
  - ✗ Show usage statistics for similar variables

- ✗ Typography Grouping Improvements:
  - ✓ Group by font settings regardless of content
  - ✓ Match by:
    - ✓ Font family
    - ✓ Font weight
    - ✓ Font size
    - ✓ Line height
    - ✓ Letter spacing
  - ✓ Ignore text content differences
  - ✓ Show group statistics

### Padding Controls Enhancement
- ✓ Horizontal Padding:
  - ✓ Separate left/right padding controls
  - ✓ Individual padding value display
  - ✓ Toggle for unified/separate control
  - ✓ Preview of padding changes

- ✓ Vertical Padding:
  - ✓ Separate top/bottom padding controls
  - ✓ Individual padding value display
  - ✓ Toggle for unified/separate control
  - ✓ Preview of padding changes

### Variable Reference Scanner
- ✓ Select and scan specific variables:
  - ✓ Show all elements linked to selected variable
  - ✓ Display usage context
  - ✓ Group by component/frame
  - ✓ Show inheritance chain
  - ✓ Provide direct selection tools

### Terminology Standardization
- ✓ Update "instance" terminology:
  - ✓ Use consistent naming across UI
  - ✓ Clear distinction between instances and components
  - ✓ Update all related documentation
  - ✓ Review and update error messages

### Feedback System
- ✗ Implement JIRA integration:
  - ✗ Direct feedback form in plugin
  - ✗ Bug report template
  - ✗ Feature request template
  - ✗ User experience feedback
  - ✗ Automatic issue creation in JIRA
  - ✗ Feedback status tracking



