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




