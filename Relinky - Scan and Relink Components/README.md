# Relinky - Scan and Replace Missing Token

A powerful Figma plugin to help you find and manage unlinked design tokens and styles across your files.

## Features

### 🔍 Comprehensive Scanning
- **Typography**: Find text layers missing text style variables
- **Auto-layout Spacing**: 
  - Detect unlinked vertical gaps
  - Find frames with unlinked vertical padding
  - Find frames with unlinked horizontal padding
- **Corner Radius**: Identify shapes with unlinked corner radius
- **Colors**: 
  - Find layers with unlinked fill colors
  - Detect layers with unlinked stroke colors
- **Library Variables**: Scan for inactive or missing library variables

### 🎯 Smart Selection
- Scan entire page or selected frames/components/sections
- Group similar unlinked values for easier management
- Quick selection of affected layers
- Navigate to specific instances
- Automatic viewport adjustment to selected elements

### 👀 Live Watching
- Watch for changes in real-time
- Automatically scan as you work
- Toggle watching on/off
- Smart debouncing to prevent performance issues

### 💡 Smart Features
- Detailed typography information display
- Grouped results by value
- Progress tracking during scans
- Success notifications
- Rescan and clear results options
- Library variable analysis
- Variable collection insights
- Scan filters:
  - Ignore hidden layers
  - Include/exclude specific layer types

## 🗺 Roadmap

### ✅ Implemented
- Have a success state for no results found
- Release version number
- Donation button
- Rename to "Scan Whole Page"
- Fix progress bar

### 🛠 In Progress / Experimental
- Ignore hidden layers for scan
- Watch for changes to work

### �� Planned
- Feedback CTA
- Pro version vs free version features
- Scan for linked tokens from non-active libraries
- Scan selected similar variable tokens
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
1. Select the frames, components, or sections you want to scan (or leave unselected to scan entire page)
2. Open the plugin from Plugins > Relinky
3. Configure scan settings (optional):
   - Toggle "Ignore Hidden Layers"
   - Select layer types to include
4. Choose which references to scan for (typography, spacing, colors, etc.)
5. Click "Start Scan" to begin the analysis

### Working with Results
- Results are grouped by type and value for easier management
- Click on any result to select the affected layers in your design
- Use the navigation arrows to jump between instances
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
- Watch mode works best when scanning the entire page