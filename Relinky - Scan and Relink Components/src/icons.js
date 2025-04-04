// Define all icons as inline SVGs
// This approach avoids the need for SVG loaders in webpack

// Design tokens
const typographyIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-91 -54C-91 -55.1046 -90.1046 -56 -89 -56H610C611.105 -56 612 -55.1046 612 -54V296C612 297.105 611.105 298 610 298H-89C-90.1046 298 -91 297.105 -91 296V-54Z" fill="#444444"/>
<g id="type">
<g id="Tt">
<path id="Vector" d="M19.9567 8.71249V9.97212H14.9434V8.71249H19.9567ZM16.4045 6.39478H17.8909V15.6153C17.8909 16.0351 17.9518 16.35 18.0735 16.56C18.1995 16.7657 18.3591 16.9043 18.5522 16.9757C18.7495 17.0428 18.9574 17.0764 19.1757 17.0764C19.3395 17.0764 19.4738 17.068 19.5788 17.0512C19.6838 17.0302 19.7677 17.0134 19.8307 17.0009L20.133 18.3361C20.0323 18.3738 19.8916 18.4116 19.7111 18.4494C19.5305 18.4914 19.3017 18.5124 19.0246 18.5124C18.6047 18.5124 18.1932 18.4221 17.7901 18.2416C17.3912 18.061 17.0595 17.786 16.795 17.4165C16.5347 17.047 16.4045 16.581 16.4045 16.0183V6.39478Z" fill="white"/>
<path id="Vector_2" d="M3.8667 6.87338V5.48779H13.5406V6.87338H9.48464V18.3864H7.9227V6.87338H3.8667Z" fill="white"/>
</g>
</g>
</g>
</svg>`;

const strokeIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-294 -54C-294 -55.1046 -293.105 -56 -292 -56H407C408.105 -56 409 -55.1046 409 -54V296C409 297.105 408.105 298 407 298H-292C-293.105 298 -294 297.105 -294 296V-54Z" fill="#444444"/>
<g id="stroke">
<g id="Group 6">
<path id="Vector 5" d="M17.1266 17.1267L6.87317 6.87329" stroke="white" stroke-linecap="round"/>
</g>
<rect id="Rectangle 5" x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>`;

const spacingIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Group 6">
<path id="Rectangle 3" d="M20.7651 3.39014H19C17.3431 3.39014 16 4.73328 16 6.39014V17.6096C16 19.2665 17.3431 20.6096 19 20.6096H20.7651" stroke="white" stroke-linecap="round"/>
<path id="Rectangle 4" d="M3.23486 3.39014H4.99998C6.65683 3.39014 7.99998 4.73328 7.99998 6.39014V17.6096C7.99998 19.2665 6.65683 20.6096 4.99998 20.6096H3.23486" stroke="white" stroke-linecap="round"/>
<path id="Vector 5" d="M12 6.92114V17.2227" stroke="white" stroke-linecap="round"/>
</g>
</svg>`;

const radiusIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-47 -54C-47 -55.1046 -46.1046 -56 -45 -56H356C357.105 -56 358 -55.1046 358 -54V89C358 90.1046 357.105 91 356 91H-45C-46.1046 91 -47 90.1046 -47 89V-54Z" fill="#444444"/>
<path d="M-45 -55H356V-57H-45V-55ZM357 -54V89H359V-54H357ZM356 90H-45V92H356V90ZM-46 89V-54H-48V89H-46ZM-45 90C-45.5523 90 -46 89.5523 -46 89H-48C-48 90.6568 -46.6569 92 -45 92V90ZM357 89C357 89.5523 356.552 90 356 90V92C357.657 92 359 90.6569 359 89H357ZM356 -55C356.552 -55 357 -54.5523 357 -54H359C359 -55.6568 357.657 -57 356 -57V-55ZM-45 -57C-46.6569 -57 -48 -55.6569 -48 -54H-46C-46 -54.5523 -45.5523 -55 -45 -55V-57Z" fill="white" fill-opacity="0.1"/>
<g id="corner">
<path id="Vector 1" d="M2.62552 8.80389V6.99321C2.62552 4.78407 4.41638 2.99321 6.62552 2.99321H8.86661" stroke="white" stroke-linecap="round"/>
<path id="Vector 3" d="M21.3745 15.1961L21.3745 17.0068C21.3745 19.2159 19.5836 21.0068 17.3745 21.0068L15.1334 21.0068" stroke="white" stroke-linecap="round"/>
<path id="Vector 2" d="M15.5638 2.99321L17.3745 2.99321C19.5836 2.99321 21.3745 4.78407 21.3745 6.99321V9.23431" stroke="white" stroke-linecap="round"/>
<path id="Vector 4" d="M8.4362 21.0068L6.62552 21.0068C4.41638 21.0068 2.62552 19.2159 2.62552 17.0068L2.62552 14.7657" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>
`;

const verticalPaddingIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-219 -54C-219 -55.1046 -218.105 -56 -217 -56H482C483.105 -56 484 -55.1046 484 -54V296C484 297.105 483.105 298 482 298H-217C-218.105 298 -219 297.105 -219 296V-54Z" fill="#444444"/>
<path d="M-217 -55H482V-57H-217V-55ZM483 -54V296H485V-54H483ZM482 297H-217V299H482V297ZM-218 296V-54H-220V296H-218ZM-217 297C-217.552 297 -218 296.552 -218 296H-220C-220 297.657 -218.657 299 -217 299V297ZM483 296C483 296.552 482.552 297 482 297V299C483.657 299 485 297.657 485 296H483ZM482 -55C482.552 -55 483 -54.5523 483 -54H485C485 -55.6568 483.657 -57 482 -57V-55ZM-217 -57C-218.657 -57 -220 -55.6568 -220 -54H-218C-218 -54.5523 -217.552 -55 -217 -55V-57Z" fill="white" fill-opacity="0.1"/>
<g id="vertical">
<g id="Group 6">
<path id="Vector 5" d="M20.7102 3.80981H3.34668" stroke="white" stroke-linecap="round"/>
<path id="Vector 6" d="M20.7102 20.3337H3.34668" stroke="white" stroke-linecap="round"/>
</g>
<rect id="Rectangle 5" x="7.87646" y="7.87646" width="8.24707" height="8.24707" rx="2.5" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>
`;

const horizontalPaddingIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-181 -54C-181 -55.1046 -180.105 -56 -179 -56H520C521.105 -56 522 -55.1046 522 -54V296C522 297.105 521.105 298 520 298H-179C-180.105 298 -181 297.105 -181 296V-54Z" fill="#444444"/>
<path d="M-179 -55H520V-57H-179V-55ZM521 -54V296H523V-54H521ZM520 297H-179V299H520V297ZM-180 296V-54H-182V296H-180ZM-179 297C-179.552 297 -180 296.552 -180 296H-182C-182 297.657 -180.657 299 -179 299V297ZM521 296C521 296.552 520.552 297 520 297V299C521.657 299 523 297.657 523 296H521ZM520 -55C520.552 -55 521 -54.5523 521 -54H523C523 -55.6568 521.657 -57 520 -57V-55ZM-179 -57C-180.657 -57 -182 -55.6568 -182 -54H-180C-180 -54.5523 -179.552 -55 -179 -55V-57Z" fill="white" fill-opacity="0.1"/>
<g id="horizontal">
<g id="Group 6">
<path id="Vector 5" d="M3.76648 3.39014L3.76648 20.7537" stroke="white" stroke-linecap="round"/>
<path id="Vector 6" d="M20.2904 3.39014L20.2904 20.7537" stroke="white" stroke-linecap="round"/>
</g>
<rect id="Rectangle 5" x="7.87646" y="7.87646" width="8.24707" height="8.24707" rx="2.5" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>
`;

const fillIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-259 -54C-259 -55.1046 -258.105 -56 -257 -56H442C443.105 -56 444 -55.1046 444 -54V296C444 297.105 443.105 298 442 298H-257C-258.105 298 -259 297.105 -259 296V-54Z" fill="#444444"/>
<path d="M-257 -55H442V-57H-257V-55ZM443 -54V296H445V-54H443ZM442 297H-257V299H442V297ZM-258 296V-54H-260V296H-258ZM-257 297C-257.552 297 -258 296.552 -258 296H-260C-260 297.657 -258.657 299 -257 299V297ZM443 296C443 296.552 442.552 297 442 297V299C443.657 299 445 297.657 445 296H443ZM442 -55C442.552 -55 443 -54.5523 443 -54H445C445 -55.6568 443.657 -57 442 -57V-55ZM-257 -57C-258.657 -57 -260 -55.6568 -260 -54H-258C-258 -54.5523 -257.552 -55 -257 -55V-57Z" fill="white" fill-opacity="0.1"/>
<g id="fill">
<rect id="Rectangle 5" x="3.78979" y="3.78979" width="16.4204" height="16.4204" rx="2.5" stroke="white" fill="none" stroke-linecap="round"/>
<rect id="Rectangle 6" x="5.51733" y="5.51733" width="12.9653" height="12.9653" rx="1" fill="white"/>
</g>
</g>
</svg>
`;

// Source type icons
const rawValueIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-47 -182C-47 -183.105 -46.1046 -184 -45 -184H356C357.105 -184 358 -183.105 358 -182V43C358 44.1046 357.105 45 356 45H-45C-46.1046 45 -47 44.1046 -47 43V-182Z" fill="#444444"/>
<path d="M-45 -183H356V-185H-45V-183ZM357 -182V43H359V-182H357ZM356 44H-45V46H356V44ZM-46 43V-182H-48V43H-46ZM-45 44C-45.5523 44 -46 43.5523 -46 43H-48C-48 44.6568 -46.6569 46 -45 46V44ZM357 43C357 43.5523 356.552 44 356 44V46C357.657 46 359 44.6569 359 43H357ZM356 -183C356.552 -183 357 -182.552 357 -182H359C359 -183.657 357.657 -185 356 -185V-183ZM-45 -185C-46.6569 -185 -48 -183.657 -48 -182H-46C-46 -182.552 -45.5523 -183 -45 -183V-185Z" fill="white" fill-opacity="0.1"/>
<g id="raw-value">
<rect id="Rectangle 5" x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="white" stroke-linecap="round"/>
<path id="Star 1" d="M11.0637 6.29194C11.354 5.37884 12.646 5.37884 12.9363 6.29194L13.2034 7.13203C13.3879 7.71237 14.0504 7.98682 14.5913 7.70692L15.3741 7.30172C16.2251 6.86132 17.1387 7.77494 16.6983 8.62585L16.2931 9.40874C16.0132 9.94956 16.2876 10.6121 16.868 10.7966L17.7081 11.0637C18.6212 11.354 18.6212 12.646 17.7081 12.9363L16.868 13.2034C16.2876 13.3879 16.0132 14.0504 16.2931 14.5913L16.6983 15.3741C17.1387 16.2251 16.2251 17.1387 15.3741 16.6983L14.5913 16.2931C14.0504 16.0132 13.3879 16.2876 13.2034 16.868L12.9363 17.7081C12.646 18.6212 11.354 18.6212 11.0637 17.7081L10.7966 16.868C10.6121 16.2876 9.94956 16.0132 9.40874 16.2931L8.62585 16.6983C7.77494 17.1387 6.86132 16.2251 7.30172 15.3741L7.70692 14.5913C7.98682 14.0504 7.71237 13.3879 7.13203 13.2034L6.29194 12.9363C5.37884 12.646 5.37884 11.354 6.29194 11.0637L7.13203 10.7966C7.71237 10.6121 7.98682 9.94956 7.70692 9.40874L7.30172 8.62585C6.86132 7.77494 7.77494 6.86132 8.62585 7.30172L9.40874 7.70692C9.94956 7.98682 10.6121 7.71237 10.7966 7.13203L11.0637 6.29194Z" stroke="white"/>
</g>
</g>
</svg>
`;

const teamLibIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-77 -182C-77 -183.105 -76.1046 -184 -75 -184H326C327.105 -184 328 -183.105 328 -182V43C328 44.1046 327.105 45 326 45H-75C-76.1046 45 -77 44.1046 -77 43V-182Z" fill="#444444"/>
<path d="M-75 -183H326V-185H-75V-183ZM327 -182V43H329V-182H327ZM326 44H-75V46H326V44ZM-76 43V-182H-78V43H-76ZM-75 44C-75.5523 44 -76 43.5523 -76 43H-78C-78 44.6568 -76.6569 46 -75 46V44ZM327 43C327 43.5523 326.552 44 326 44V46C327.657 46 329 44.6569 329 43H327ZM326 -183C326.552 -183 327 -182.552 327 -182H329C329 -183.657 327.657 -185 326 -185V-183ZM-75 -185C-76.6569 -185 -78 -183.657 -78 -182H-76C-76 -182.552 -75.5523 -183 -75 -183V-185Z" fill="white" fill-opacity="0.1"/>
<g id="team-lib">
<rect id="Rectangle 5" x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="white" stroke-linecap="round"/>
<circle id="Ellipse 1" cx="8.82167" cy="8.82169" r="2.77417" stroke="white"/>
<circle id="Ellipse 3" cx="8.82167" cy="15.2742" r="2.77417" stroke="white"/>
<circle id="Ellipse 2" cx="15.37" cy="8.82169" r="2.77417" stroke="white"/>
<circle id="Ellipse 4" cx="15.37" cy="15.2742" r="2.77417" stroke="white"/>
</g>
</g>
</svg>
`;

const localVarIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-108 -182C-108 -183.105 -107.105 -184 -106 -184H295C296.105 -184 297 -183.105 297 -182V43C297 44.1046 296.105 45 295 45H-106C-107.105 45 -108 44.1046 -108 43V-182Z" fill="#444444"/>
<path d="M-106 -183H295V-185H-106V-183ZM296 -182V43H298V-182H296ZM295 44H-106V46H295V44ZM-107 43V-182H-109V43H-107ZM-106 44C-106.552 44 -107 43.5523 -107 43H-109C-109 44.6568 -107.657 46 -106 46V44ZM296 43C296 43.5523 295.552 44 295 44V46C296.657 46 298 44.6569 298 43H296ZM295 -183C295.552 -183 296 -182.552 296 -182H298C298 -183.657 296.657 -185 295 -185V-183ZM-106 -185C-107.657 -185 -109 -183.657 -109 -182H-107C-107 -182.552 -106.552 -183 -106 -183V-185Z" fill="white" fill-opacity="0.1"/>
<g id="local-var">
<rect id="Rectangle 5" x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="white" stroke-linecap="round"/>
<circle id="Ellipse 1" cx="12" cy="12" r="5.95248" stroke="white"/>
<circle id="Ellipse 2" cx="12" cy="12" r="2.94649" stroke="white"/>
</g>
</g>
</svg>
`;

const missingVarIcon = 
`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-139 -182C-139 -183.105 -138.105 -184 -137 -184H264C265.105 -184 266 -183.105 266 -182V43C266 44.1046 265.105 45 264 45H-137C-138.105 45 -139 44.1046 -139 43V-182Z" fill="#444444"/>
<path d="M-137 -183H264V-185H-137V-183ZM265 -182V43H267V-182H265ZM264 44H-137V46H264V44ZM-138 43V-182H-140V43H-138ZM-137 44C-137.552 44 -138 43.5523 -138 43H-140C-140 44.6568 -138.657 46 -137 46V44ZM265 43C265 43.5523 264.552 44 264 44V46C265.657 46 267 44.6569 267 43H265ZM264 -183C264.552 -183 265 -182.552 265 -182H267C267 -183.657 265.657 -185 264 -185V-183ZM-137 -185C-138.657 -185 -140 -183.657 -140 -182H-138C-138 -182.552 -137.552 -183 -137 -183V-185Z" fill="white" fill-opacity="0.1"/>
<g id="missing-var">
<rect id="Rectangle 5" x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="white" stroke-linecap="round"/>
<circle id="Ellipse 1" cx="12" cy="12" r="5.95248" stroke="white"/>
<path id="?" d="M11.25 13.9347V13.8835C11.2557 13.3409 11.3125 12.9091 11.4205 12.5881C11.5284 12.267 11.6818 12.0071 11.8807 11.8082C12.0795 11.6094 12.3182 11.4261 12.5966 11.2585C12.7642 11.1562 12.9148 11.0355 13.0483 10.8963C13.1818 10.7543 13.2869 10.5909 13.3636 10.4062C13.4432 10.2216 13.483 10.017 13.483 9.79261C13.483 9.5142 13.4176 9.27272 13.2869 9.06818C13.1562 8.86363 12.9815 8.70596 12.7628 8.59517C12.544 8.48437 12.3011 8.42897 12.0341 8.42897C11.8011 8.42897 11.5767 8.47727 11.3608 8.57386C11.1449 8.67045 10.9645 8.82244 10.8196 9.02983C10.6747 9.23721 10.5909 9.50852 10.5682 9.84375H9.49432C9.51704 9.36079 9.64204 8.94744 9.86932 8.60369C10.0994 8.25994 10.402 7.99716 10.777 7.81534C11.1548 7.63352 11.5739 7.54261 12.0341 7.54261C12.5341 7.54261 12.9687 7.64204 13.3381 7.84091C13.7102 8.03977 13.9972 8.3125 14.1989 8.65909C14.4034 9.00568 14.5057 9.40056 14.5057 9.84375C14.5057 10.1562 14.4574 10.4389 14.3608 10.6918C14.267 10.9446 14.1307 11.1705 13.9517 11.3693C13.7756 11.5682 13.5625 11.7443 13.3125 11.8977C13.0625 12.054 12.8622 12.2187 12.7116 12.392C12.5611 12.5625 12.4517 12.7656 12.3835 13.0014C12.3153 13.2372 12.2784 13.5312 12.2727 13.8835V13.9347H11.25ZM11.7955 16.4574C11.5852 16.4574 11.4048 16.3821 11.2543 16.2315C11.1037 16.081 11.0284 15.9006 11.0284 15.6903C11.0284 15.4801 11.1037 15.2997 11.2543 15.1491C11.4048 14.9986 11.5852 14.9233 11.7955 14.9233C12.0057 14.9233 12.1861 14.9986 12.3366 15.1491C12.4872 15.2997 12.5625 15.4801 12.5625 15.6903C12.5625 15.8295 12.527 15.9574 12.456 16.0739C12.3878 16.1903 12.2955 16.2841 12.179 16.3551C12.0653 16.4233 11.9375 16.4574 11.7955 16.4574Z" fill="white"/>
</g>
</g>
</svg>
`;

// Radius corner icons
const radiusTopLeftIcon = 
`<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Section 1">
<path d="M-47 -95C-47 -96.1046 -46.1046 -97 -45 -97H356C357.105 -97 358 -96.1046 358 -95V48C358 49.1046 357.105 50 356 50H-45C-46.1046 50 -47 49.1046 -47 48V-95Z" fill="#444444"/>
<path d="M-45 -96H356V-98H-45V-96ZM357 -95V48H359V-95H357ZM356 49H-45V51H356V49ZM-46 48V-95H-48V48H-46ZM-45 49C-45.5523 49 -46 48.5523 -46 48H-48C-48 49.6568 -46.6569 51 -45 51V49ZM357 48C357 48.5523 356.552 49 356 49V51C357.657 51 359 49.6569 359 48H357ZM356 -96C356.552 -96 357 -95.5523 357 -95H359C359 -96.6568 357.657 -98 356 -98V-96ZM-45 -98C-46.6569 -98 -48 -96.6569 -48 -95H-46C-46 -95.5523 -45.5523 -96 -45 -96V-98Z" fill="white" fill-opacity="0.1"/>
<g id="top-left">
<path id="Vector 1" d="M3.142 14.454V9.54599C3.142 6.23229 5.82829 3.546 9.142 3.546H14.858" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>

`;

const radiusTopRightIcon = 
`<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="18" height="18" fill="#1E1E1E"/>
<g id="Section 1">
<path d="M-68 -95C-68 -96.1046 -67.1046 -97 -66 -97H335C336.105 -97 337 -96.1046 337 -95V48C337 49.1046 336.105 50 335 50H-66C-67.1046 50 -68 49.1046 -68 48V-95Z" fill="#444444"/>
<path d="M-66 -96H335V-98H-66V-96ZM336 -95V48H338V-95H336ZM335 49H-66V51H335V49ZM-67 48V-95H-69V48H-67ZM-66 49C-66.5523 49 -67 48.5523 -67 48H-69C-69 49.6568 -67.6569 51 -66 51V49ZM336 48C336 48.5523 335.552 49 335 49V51C336.657 51 338 49.6569 338 48H336ZM335 -96C335.552 -96 336 -95.5523 336 -95H338C338 -96.6568 336.657 -98 335 -98V-96ZM-66 -98C-67.6569 -98 -69 -96.6569 -69 -95H-67C-67 -95.5523 -66.5523 -96 -66 -96V-98Z" fill="white" fill-opacity="0.1"/>
<g id="top-right">
<path id="Vector 1" d="M3.54599 3.142L8.454 3.142C11.7677 3.142 14.454 5.82829 14.454 9.142L14.454 14.858" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>
`;

const radiusBottomLeftIcon = 
`<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="18" height="18" fill="#1E1E1E"/>
<g id="Section 1">
<path d="M-47 -118C-47 -119.105 -46.1046 -120 -45 -120H356C357.105 -120 358 -119.105 358 -118V25C358 26.1046 357.105 27 356 27H-45C-46.1046 27 -47 26.1046 -47 25V-118Z" fill="#444444"/>
<path d="M-45 -119H356V-121H-45V-119ZM357 -118V25H359V-118H357ZM356 26H-45V28H356V26ZM-46 25V-118H-48V25H-46ZM-45 26C-45.5523 26 -46 25.5523 -46 25H-48C-48 26.6568 -46.6569 28 -45 28V26ZM357 25C357 25.5523 356.552 26 356 26V28C357.657 28 359 26.6569 359 25H357ZM356 -119C356.552 -119 357 -118.552 357 -118H359C359 -119.657 357.657 -121 356 -121V-119ZM-45 -121C-46.6569 -121 -48 -119.657 -48 -118H-46C-46 -118.552 -45.5523 -119 -45 -119V-121Z" fill="white" fill-opacity="0.1"/>
<g id="bottom-left">
<path id="Vector 1" d="M14.454 14.858L9.54599 14.858C6.23228 14.858 3.54599 12.1717 3.54599 8.85799L3.54599 3.142" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>
`;

const radiusBottomRightIcon = 
`<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="18" height="18" fill="#1E1E1E"/>
<g id="Section 1">
<path d="M-68 -118C-68 -119.105 -67.1046 -120 -66 -120H335C336.105 -120 337 -119.105 337 -118V25C337 26.1046 336.105 27 335 27H-66C-67.1046 27 -68 26.1046 -68 25V-118Z" fill="#444444"/>
<path d="M-66 -119H335V-121H-66V-119ZM336 -118V25H338V-118H336ZM335 26H-66V28H335V26ZM-67 25V-118H-69V25H-67ZM-66 26C-66.5523 26 -67 25.5523 -67 25H-69C-69 26.6568 -67.6569 28 -66 28V26ZM336 25C336 25.5523 335.552 26 335 26V28C336.657 28 338 26.6569 338 25H336ZM335 -119C335.552 -119 336 -118.552 336 -118H338C338 -119.657 336.657 -121 335 -121V-119ZM-66 -121C-67.6569 -121 -69 -119.657 -69 -118H-67C-67 -118.552 -66.5523 -119 -66 -119V-121Z" fill="white" fill-opacity="0.1"/>
<g id="bottom-right">
<path id="Vector 1" d="M14.858 3.54599L14.858 8.454C14.858 11.7677 12.1717 14.454 8.85799 14.454L3.142 14.454" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>
`;

// Other icons
const toggleIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="6" width="18" height="12" rx="6" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="15" cy="12" r="4" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

const variableIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3.84668" y="3.84668" width="16.3066" height="16.3066" rx="2.5" stroke="currentColor" stroke-linecap="round"/>
  <path d="M8 12H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M12 8L12 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const checkIcon = 
`<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="check">
<g id="Group 6">
<path id="Vector 5" d="M4.33447 9.3877L0.889662 5.94288" stroke="white" stroke-linecap="round"/>
<path id="Vector 6" d="M4.33459 9.3877L11.1102 2.61212" stroke="white" stroke-linecap="round"/>
</g>
</g>
</svg>
`;

// Export the icons object
export const icons = {
  // Design tokens
  typography: typographyIcon,
  stroke: strokeIcon,
  spacing: spacingIcon,
  radius: radiusIcon,
  'vertical-padding': verticalPaddingIcon,
  'horizontal-padding': horizontalPaddingIcon,
  fill: fillIcon,
  
  // Source type icons
  'raw-value': rawValueIcon,
  'team-lib': teamLibIcon,
  'local-var': localVarIcon,
  'missing-var': missingVarIcon,
  
  // Radius corner icons
  'top-left': radiusTopLeftIcon,
  'top-right': radiusTopRightIcon,
  'bottom-left': radiusBottomLeftIcon,
  'bottom-right': radiusBottomRightIcon,
  
  // We can also use more specific naming for clarity
  'radius-top-left': radiusTopLeftIcon,
  'radius-top-right': radiusTopRightIcon,
  'radius-bottom-left': radiusBottomLeftIcon,
  'radius-bottom-right': radiusBottomRightIcon,
  
  // Other icons
  'toggle': toggleIcon,
  'variable': variableIcon,
  'check': checkIcon,
  
  // Aliases for backward compatibility
  'spacing-horizontal': horizontalPaddingIcon,
  'spacing-vertical': verticalPaddingIcon
}; 