Development Guide
- "Unlinked values" page and "Unlinked Tokens" page should always have seperated development codes
- Always create logs for all current and new features to track errors
- Always check https://www.figma.com/plugin-docs/ for all Figma plugin documentation
- Always check https://www.figma.com/plugin-docs/working-with-variables/#get-variables for all Figma variables documentation
- Always check https://www.figma.com/plugin-docs/ui-design-guidelines/ for all Figma UI design guidelines
- Always check https://vuejs.org/api/ for all Vue.js documentation
- Always check https://www.typescriptlang.org/docs/ for all TypeScript documentation
- Always check https://tailwindcss.com/docs/installation for all Tailwind CSS documentation
- Always check https://www.w3schools.com/html/html_intro.asp for all HTML documentation

Style consistency guide
- Follow the same color palette for all components
- Follow the same font family for all text
- Follow the same padding for all sections (--spacing-xxs (2px))
- Follow the same spacing inbetween all components (4px)
- Use the same border radius for all components (6px)

**Unlinked Values page**

UI, Component Style and Hierarchy guide
*Scan Settings section*
- Title & Watch Changes button → Scan Settings dropdown → Selection status

*Scan Criteria section*
- Title → Scan Selection card buttons
*Scan Criteria section card buttons*
- Icons should be on the left
- Text Title should be on the right
- Text title and description should be in the same line
- Text title is always above the description
- Text title is always bold
- Text description is always smaller than the title

*Scanning section*
Title → Progress Bar → Buttons
*Progress Bar*
- Always visible
- Always show the scan progress percentage
- Scanning status text should always be visible and shown inside the progress bar 
    Scan status:
    - Scanning: Scanning...
    - Ready to scan: Ready to scan
    - Scan complete: Scan complete
    - Scan complete no results: Scan complete, no issues found
    - Scan error: Scan error
- Progress bar state:
    - Scanning: Blue 
    - Ready to scan: Gray
    - Scan complete: Green
    - Scan error: Red

*Gap scan results*
- Grouped by gap size
- Each gap result always have a dropdown button to reveal the grouped result details
- Grouped result details always shows:
    - Gap size
- Each group results always have a selection button to select the result

*Horizontal / Vertical scan results*
- Grouped by horizontal / vertical
- Each horizontal / vertical result always have a dropdown button to reveal the grouped result details
- Grouped result details always shows:
    - Horizontal / Vertical size
- Each group results always have a selection button to select the result

*Result section*
*Color Fill / Color Stroke Scan Result*
- Grouped by color fill / color stroke
- Each color fill / color stroke result should have a title, description and a button
- Title and description should be in the same line
- Title is always above the description
- Title is always bold
- Description is always smaller than the title
- Button is always on the right
- Each group results always have a selection button to select the result

*Typography Scan Result*
- Grouped results Title header always shows:
    - Font family
    - Font size
    - Font weight
- Each grouped result always have a dropdown button to reveal the grouped result details
- Grouped result details always shows:
    - Font family
    - Font size
    - Font weight
    - Font style
    - Font color
    - Background color
    - Text color
- Each group results always have a selection button to select the result


Interaction State Guide
*Always implement the same interaction state for all and newly created interactive elements*
- Active state: Blue
- Hover state: Light Blue
- Focus state: Blue outline
- Disabled state: Gray
- Error state: Red
- Success state: Green
- Loading state: Loading spinner with dark blue color
    - Spinner style should always be consistent


**Unlinked Variables Feature**

UI, Component Style and Hierarchy guide
*Scan Settings section*
- Title & Watch Changes button → Scan Settings dropdown → Selection status
- Follow the same styling as Unlinked Values page

*Scan Criteria section*
- Title → Variable Types Selection cards
*Variable Type Selection cards*
- Icons should be on the left
- Text Title should be on the right
- Each card represents a variable type (Color, Typography, Spacing, etc.)
- Cards should show selection state (selected/unselected)
- Multiple selection should be allowed

*Scanning section*
Title → Progress Bar → Buttons
*Progress Bar*
- Follows the same style as Unlinked Values page
- Progress bar states:
    - Scanning: Blue 
    - Ready to scan: Gray
    - Scan complete: Green
    - Scan error: Red
- Scanning status text:
    - Scanning: "Scanning for unlinked variables..."
    - Ready to scan: "Ready to scan"
    - Scan complete: "Scan complete"
    - Scan complete no results: "No unlinked variables found"
    - Scan error: "Scan error"

*Variables Scan Result*
- Grouped by library name
- Each library group shows:
    - Library name
    - Total variables count
    - Activation status (Active/Inactive)
    - Activate library button (if inactive)

- Each variable in the group shows:
    - Variable name
    - Variable type (Color, Typography, Number, etc)
    - Usage count
    - Preview (based on variable type):
        - Color: Color swatch
        - Typography: Font preview
        - Number: Value with unit

- Each variable has:
    - Dropdown to show usage details
    - Select all instances button

- Usage details show:
    - Node name
    - Property name (e.g., "fill", "text", "spacing")
    - Select instance button

- Group actions:
    - Select all variables in library
    - Activate library (if inactive)

Interaction State Guide
*Follow the same interaction states as Unlinked Values page*
- Active state: Blue
- Hover state: Light Blue
- Focus state: Blue outline
- Disabled state: Gray
- Error state: Red
- Success state: Green
- Loading state: Loading spinner with dark blue color

Additional Features
- Real-time library status monitoring
- Batch selection of variables by type
- Quick preview of variable values
- Direct library activation from results
- Filter variables by type or usage
- Sort by name, usage count, or type
- Export results to CSV/JSON

Error Handling
- Show clear error messages for:
    - Failed library activation
    - Network connectivity issues
    - API limitations
    - Permission issues
- Provide retry options where applicable
- Cache results to prevent data loss

Performance Considerations
- Implement pagination for large result sets
- Lazy load variable previews
- Cache library status checks
- Batch process selections
- Progressive loading of usage details

**Future Development Roadmap**

*Pro vs Free Version Features*
- Free Version limitations:
    - Basic variable scanning
    - Limited selection options
    - Basic grouping features
    - Standard export options
- Pro Version features:
    - Advanced variable scanning
    - Comprehensive selection tools
    - Advanced grouping options
    - Premium export formats
    - Batch processing capabilities
    - Advanced filtering options

*Enhanced Variable Scanning Features*
- Scan for linked tokens from inactive libraries:
    - Identify all tokens linked to inactive libraries
    - Show activation status for each library
    - Provide quick activation options
    - Group results by library source

- Similar Variable Token Scanning:
    - Group variables with similar properties
    - Compare variable values across different libraries
    - Identify potential consolidation opportunities
    - Show usage statistics for similar variables

- Typography Grouping Improvements:
    - Group by font settings regardless of content
    - Match by:
        - Font family
        - Font weight
        - Font size
        - Line height
        - Letter spacing
    - Ignore text content differences
    - Show group statistics

*Padding Controls Enhancement*
- Horizontal Padding:
    - Separate left/right padding controls
    - Individual padding value display
    - Toggle for unified/separate control
    - Preview of padding changes

- Vertical Padding:
    - Separate top/bottom padding controls
    - Individual padding value display
    - Toggle for unified/separate control
    - Preview of padding changes

*Variable Reference Scanner*
- Select and scan specific variables:
    - Show all elements linked to selected variable
    - Display usage context
    - Group by component/frame
    - Show inheritance chain
    - Provide direct selection tools

*Terminology Standardization*
- Update "instance" terminology:
    - Use consistent naming across UI
    - Clear distinction between instances and components
    - Update all related documentation
    - Review and update error messages

*Feedback System*
- Implement JIRA integration:
    - Direct feedback form in plugin
    - Bug report template
    - Feature request template
    - User experience feedback
    - Automatic issue creation in JIRA
    - Feedback status tracking

*UI/UX Considerations*
- Clear feature differentiation between versions
- Intuitive pro upgrade path
- Consistent terminology
- Enhanced error messaging
- Improved progress indicators
- Responsive feedback forms