import re
from collections import defaultdict

# Constants
FILE_PATH = 'src/ui-run.html'

def extract_css_rules(css_content):
    # Split the CSS content into individual rules
    rules = re.findall(r'([^{]+)\s*{\s*([^}]+)\s*}', css_content)
    
    # Create a dictionary to store rules by selector
    rules_dict = defaultdict(list)
    
    for selector, declarations in rules:
        # Clean up selector and split declarations
        selector = selector.strip()
        declarations = [d.strip() for d in declarations.split(';') if d.strip()]
        
        # Store declarations for this selector
        rules_dict[selector].extend(declarations)
    
    return rules_dict

def merge_duplicate_selectors(rules_dict):
    # Group all declarations by cleaned selector name
    merged_selectors = defaultdict(list)
    
    for selector, declarations in rules_dict.items():
        clean_selector = selector.strip()
        if len(declarations) > 0:
            # If this is a duplicate selector, print a message
            if clean_selector in merged_selectors:
                print(f"Merging duplicate selector: {clean_selector}")
            # Add all declarations to the merged list
            merged_selectors[clean_selector].extend(declarations)
    
    return merged_selectors

def organize_selectors(merged_selectors):
    # Group selectors by their type
    grouped_selectors = defaultdict(dict)
    
    for selector, declarations in merged_selectors.items():
        # Determine selector type
        if '@keyframes' in selector:
            category = 'keyframes'
        elif selector.startswith('.'):
            category = 'classes'
        elif selector.startswith('#'):
            category = 'ids'
        elif ':' in selector:
            category = 'pseudo'
        elif '[' in selector:
            category = 'attributes'
        elif '>' in selector or '+' in selector or '~' in selector:
            category = 'combinators'
        else:
            category = 'elements'
        
        grouped_selectors[category][selector] = declarations
    
    return grouped_selectors

def generate_organized_css(grouped_selectors):
    css_parts = []
    
    # Order of categories
    category_order = [
        'keyframes',
        'elements',
        'classes',
        'ids',
        'pseudo',
        'attributes',
        'combinators'
    ]
    
    # Generate CSS for each category
    for category in category_order:
        if category in grouped_selectors and grouped_selectors[category]:
            css_parts.append(f"\n/* {category.upper()} */")
            
            # Sort selectors within each category
            sorted_selectors = sorted(grouped_selectors[category].keys())
            
            for selector in sorted_selectors:
                declarations = grouped_selectors[category][selector]
                css_parts.append(f"{selector} {{")
                for decl in sorted(declarations):
                    css_parts.append(f"    {decl};")
                css_parts.append("}")
                css_parts.append("")
    
    return "\n".join(css_parts)

def extract_css_from_html(file_path=FILE_PATH):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            content = f.read()
    
    # Find CSS content between <style> tags
    css_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
    if css_match:
        return content, css_match.group(1)
    return content, ''

def write_organized_css(file_path, full_content, original_css, organized_css):
    # Replace the content between <style> tags with organized CSS
    new_content = full_content.replace(
        f'<style>{original_css}</style>',
        f'<style>\n{organized_css}\n</style>'
    )
    
    # Write the updated content back to the file
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

def organize_css_file(file_path=FILE_PATH):
    # Extract current content
    full_content, css_content = extract_css_from_html(file_path)
    
    # Parse CSS rules
    rules_dict = extract_css_rules(css_content)
    
    # Merge duplicate selectors
    merged_selectors = merge_duplicate_selectors(rules_dict)
    
    # Organize selectors by type
    grouped_selectors = organize_selectors(merged_selectors)
    
    # Generate organized CSS
    organized_css = generate_organized_css(grouped_selectors)
    
    # Write back to file
    write_organized_css(file_path, full_content, css_content, organized_css)
    
    print("CSS has been organized and duplicate selectors merged!")
    print("\nOrganized into the following categories:")
    for category in grouped_selectors:
        selector_count = len(grouped_selectors[category])
        print(f"- {category}: {selector_count} selectors")

def extract_css_rules(content):
    """Extract CSS rules from content and return as a dictionary."""
    # Regular expression to match CSS rules
    pattern = r'\.([a-zA-Z0-9_-]+)\s*{([^}]+)}'
    rules = {}
    
    matches = re.finditer(pattern, content)
    for match in matches:
        class_name = match.group(1)
        css_properties = match.group(2).strip()
        rules[class_name] = css_properties
    
    return rules

def compare_css_files(file1_path, file2_path, output_path):
    """Compare CSS rules between two files and generate missing styles."""
    try:
        # Read the first file
        with open(file1_path, 'r', encoding='utf-8') as f1:
            content1 = f1.read()
            
        # Read the second file
        with open(file2_path, 'r', encoding='utf-8') as f2:
            content2 = f2.read()
            
        # Extract CSS rules from both files
        rules1 = extract_css_rules(content1)
        rules2 = extract_css_rules(content2)
        
        # Find missing rules
        missing_rules = {}
        
        # Check rules in file2 that are missing or different in file1
        for class_name, properties in rules2.items():
            if class_name not in rules1 or rules1[class_name] != properties:
                missing_rules[class_name] = properties
        
        # Generate output CSS file with missing styles
        if missing_rules:
            with open(output_path, 'w', encoding='utf-8') as out:
                out.write("/* Missing or different styles */\n\n")
                
                for class_name, properties in missing_rules.items():
                    css_rule = f".{class_name} {{\n    {properties.replace(';', ';\n    ')}\n}}\n\n"
                    out.write(css_rule)
                    
            print(f"Generated missing styles in: {output_path}")
            print(f"Found {len(missing_rules)} missing or different styles")
        else:
            print("No missing styles found")
            
    except FileNotFoundError as e:
        print(f"Error: Could not find file - {e.filename}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    # File paths
    file1 = "src/ui.html"
    file2 = "src/ui-run.html"
    output = "missing_styles.css"
    
    # Run the comparison
    compare_css_files(file1, file2, output) 