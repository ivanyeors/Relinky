# Relinky - Scan and Relink Components

Relinky keeps your Figma documents aligned with their design systems by exposing unlinked variables, raw values, and mismatched library references. Scan focused selections or entire pages, monitor changes live, and act on grouped insights to keep every component connected to the tokens it should use.

## Features

### 🔍 Deep Token Scanning
- Scan for missing or unlinked tokens across typography, fill and stroke colors, corner radius, auto-layout gaps, and horizontal or vertical padding.
- Detect raw values that can be converted into variables to expand token coverage.
- Identify linked library variables and styles from team, local, and missing libraries, surfacing availability issues before they spread.

### 🧠 Token Intelligence
- Surface library status (active, inactive, remote, local) and collection details for every variable that appears in a result.
- Support all variable types—color, number, boolean, and string—so mixed-mode collections stay accurately reported.
- Provide detailed typography breakdowns, color previews, and grouped property insights to speed up decision making.

### 🎯 Actionable Results
- Group findings by token type and value so you can bulk-select related layers and resolve them together.
- Jump straight to affected nodes with automatic viewport focusing and quick selection controls.
- Unlink variables without losing property values, rescan instantly, and track progress with clear feedback and success notifications.

### ⚙️ Flexible Workflow Controls
- Scan entire pages, specific selections, or sections depending on the task at hand.
- Toggle inclusion of hidden layers, choose which layer types participate, and target only the token categories you care about.
- Configure watch mode to only run when whole-page scanning is enabled, preserving document performance.

### 👀 Live Watch Mode
- Continuously monitor active documents with smart debouncing that prevents performance slowdowns.
- Catch new unlinked values the moment they appear and stay informed with immediate updates.
- Toggle watch mode on or off at any time while keeping your current scan context intact.

## 🗺 Roadmap

### ✅ Implemented
- Have a success state for no results found
- Release version number
- Donation button
- Rename to "Scan Whole Page"
- Fix progress bar
- Ignore hidden layers during scans
- Live watch mode with debounced updates

### 🛠 In Progress / Experimental
- Progressive scanning safeguards for extremely large documents
- Cached variable and library lookups
- Batch processing for variable operations

### 🧭 Planned
- Feedback CTA
- Pro version vs free version features
- Scan for linked tokens from non-active/unavailable libraries
- Mass relink selected linked tokens to another library token
- Work on similar typography groupings
  - Ignore different content but group same font settings
- Horizontal padding improvements
  - Add toggle for left and right
- Vertical padding improvements
  - Add toggle for top and bottom
- Typography UI improvements
  - Split results in small labels
- Fix instances and instance word corrections

## Usage

### Installation
1. Open Figma and go to the Community tab
2. Search for "Relinky"
3. Click "Install"

### Basic Usage
1. Select the frames, components, or sections you want to scan (or leave unselected to scan the entire page)
2. Open the plugin from Plugins > Relinky
3. Configure scan settings (optional):
   - Toggle "Ignore Hidden Layers"
   - Include or exclude specific layer types
   - Choose token categories (typography, spacing, colors, etc.)
4. Click "Start Scan" to begin the analysis

### Working with Results
- Results are grouped by type and value for easier management and bulk resolution
- View typography breakdowns, color previews, and library status to understand each issue
- Click on any result to select the affected layers in your design
- Use the navigation arrows to jump between instances, unlink variables, or rescan once resolved
- Clear results and rescan as needed

### Live Watching Mode
1. Enable "Scan Entire Page" to unlock watch mode
2. Toggle "Watch Mode" to enable real-time scanning
3. The plugin will automatically detect unlinked values as you work
4. Disable Watch Mode when you want to stop automatic scanning

### Tips
- Use the grouped results to quickly standardize similar unlinked values
- Regular scanning helps maintain design system consistency
- Consider scanning before sharing designs or creating documentation
- Combine watch mode with hidden-layer filtering to keep working files performing well