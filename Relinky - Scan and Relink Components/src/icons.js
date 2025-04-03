// Import all SVGs
import typographyIcon from './icons/typography.svg';
import strokeIcon from './icons/stroke.svg';
import spacingIcon from './icons/spacing.svg';
import radiusIcon from './icons/radius.svg';
import verticalPaddingIcon from './icons/vertical-padding.svg';
import horizontalPaddingIcon from './icons/horizontal-padding.svg';
import fillIcon from './icons/fill.svg';

// Library icons - using SVG strings directly since they are simple
const libraryIcon = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 4H26C27.1046 4 28 4.89543 28 6V26C28 27.1046 27.1046 28 26 28H6C4.89543 28 4 27.1046 4 26V6C4 4.89543 4.89543 4 6 4Z" stroke="currentColor" stroke-width="2"/>
  <path d="M10 12H22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 16H22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 20H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const localIcon = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
  <path d="M12 16H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M16 12L16 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const missingIcon = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="6" width="20" height="20" rx="2" stroke="currentColor" stroke-width="2"/>
  <path d="M12 12L20 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M20 12L12 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// Export as an object
export const icons = {
  typography: typographyIcon,
  stroke: strokeIcon,
  spacing: spacingIcon,
  radius: radiusIcon,
  'vertical-padding': verticalPaddingIcon,
  'horizontal-padding': horizontalPaddingIcon,
  fill: fillIcon,
  // New icons
  library: libraryIcon,
  local: localIcon,
  missing: missingIcon
}; 