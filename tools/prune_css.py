#!/usr/bin/env python3
import os, re, json
from pathlib import Path

ROOT = Path('/Volumes/Crucial SSD 2TB/Projects/Relinky/Relinky - Scan and Relink Components/src')
CSS_PATH = ROOT / 'styles.css'
PRUNED_PATH = ROOT / 'styles.pruned.css'
REPORT_PATH = ROOT / 'styles.pruned.report.json'

cls_token_re = re.compile(r'-?[_a-zA-Z]+[_a-zA-Z0-9-]*')

class_attr_re = re.compile(r'class\s*=\s*[\"\']([^\"\']+)')
class_name_re = re.compile(r'className\s*=\s*[\"\']([^\"\']+)')
classlist_re = re.compile(r'classList\.(?:add|remove|toggle)\(([^)]*)\)')
qs_re = re.compile(r'querySelector(?:All)?\(\s*[\"\']\.([^\"\')]+)')
get_by_class_re = re.compile(r'getElementsByClassName\(\s*[\"\']([^\"\']+)')
string_literal_re = re.compile(r'[\"\']([^\"\']+)[\"\']')

used_classes = set()
for path in ROOT.rglob('*'):
    if not path.is_file():
        continue
    if path.suffix.lower() not in {'.html', '.js', '.ts', '.jsx', '.tsx'}:
        continue
    try:
        text = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    for m in class_attr_re.finditer(text):
        for token in re.split(r'\s+', m.group(1)):
            if cls_token_re.fullmatch(token):
                used_classes.add(token)
    for m in class_name_re.finditer(text):
        for token in re.split(r'\s+', m.group(1)):
            if cls_token_re.fullmatch(token):
                used_classes.add(token)
    for m in classlist_re.finditer(text):
        args = m.group(1)
        for sm in string_literal_re.finditer(args):
            for token in re.split(r'\s+', sm.group(1)):
                if cls_token_re.fullmatch(token):
                    used_classes.add(token)
    for m in qs_re.finditer(text):
        sel = m.group(1)
        first = re.split(r'[^-_a-zA-Z0-9]', sel)[0]
        if cls_token_re.fullmatch(first):
            used_classes.add(first)
    for m in get_by_class_re.finditer(text):
        for token in re.split(r'\s+', m.group(1)):
            if cls_token_re.fullmatch(token):
                used_classes.add(token)

css_text = CSS_PATH.read_text(encoding='utf-8')
comment_re = re.compile(r'/\*[\s\S]*?\*/')
css_nocomments = comment_re.sub(lambda m: ' ' * (m.end()-m.start()), css_text)

class_in_sel_re = re.compile(r'\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)')

def split_selectors(prelude: str):
    parts, buf = [], []
    depth_paren = depth_bracket = 0
    in_str = None
    i = 0
    while i < len(prelude):
        ch = prelude[i]
        if in_str:
            buf.append(ch)
            if ch == in_str:
                in_str = None
            elif ch == '\\':
                i += 1
                if i < len(prelude):
                    buf.append(prelude[i])
            i += 1
            continue
        if ch in ('\"', "\'"):
            in_str = ch
            buf.append(ch)
            i += 1
            continue
        if ch == '(':
            depth_paren += 1
        elif ch == ')':
            depth_paren = max(0, depth_paren-1)
        elif ch == '[':
            depth_bracket += 1
        elif ch == ']':
            depth_bracket = max(0, depth_bracket-1)
        if ch == ',' and depth_paren == 0 and depth_bracket == 0:
            parts.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    if buf:
        parts.append(''.join(buf).strip())
    return [p for p in parts if p]

removed_rules = []
kept_count = removed_count = 0

out = []
i = 0
n = len(css_nocomments)
while i < n:
    ch = css_nocomments[i]
    if ch == '}':
        out.append('}')
        i += 1
        continue
    if ch.isspace():
        out.append(css_text[i])
        i += 1
        continue
    if css_nocomments.startswith('@', i):
        j = i
        while j < n and css_nocomments[j] not in '{;':
            j += 1
        if j < n and css_nocomments[j] == ';':
            out.append(css_text[i:j+1])
            i = j+1
            continue
        if j < n and css_nocomments[j] == '{':
            out.append(css_text[i:j+1])
            i = j+1
            continue
        out.append(css_text[i:j])
        i = j
        continue
    j = i
    while j < n and css_nocomments[j] != '{':
        j += 1
    if j >= n:
        out.append(css_text[i:])
        break
    prelude_src = css_text[i:j]
    prelude_ws = re.match(r'\s*', prelude_src).group(0)
    prelude = prelude_src.strip()
    k = j + 1
    depth = 1
    while k < n and depth > 0:
        if css_nocomments[k] == '{':
            depth += 1
        elif css_nocomments[k] == '}':
            depth -= 1
        k += 1
    block_end = k
    body = css_text[j:block_end]

    selectors = split_selectors(prelude)
    class_tokens = []
    any_used = False
    any_class = False
    for sel in selectors:
        tokens = class_in_sel_re.findall(sel)
        if tokens:
            any_class = True
            class_tokens.extend(tokens)
            if any(t in used_classes for t in tokens):
                any_used = True
    if not any_class:
        out.append(prelude_ws + prelude + body)
        kept_count += 1
    else:
        if any_used:
            out.append(prelude_ws + prelude + body)
            kept_count += 1
        else:
            removed_rules.append({'selectors': selectors, 'class_tokens': sorted(set(class_tokens))})
            removed_count += 1
    i = block_end

pruned_css = ''.join(out)
PRUNED_PATH.write_text(pruned_css, encoding='utf-8')
REPORT_PATH.write_text(json.dumps({
    'kept_rules': kept_count,
    'removed_rules': removed_count,
    'removed_details': removed_rules,
    'used_classes_count': len(used_classes),
    'pruned_bytes': len(pruned_css),
    'original_bytes': len(css_text),
    'bytes_saved_estimate': len(css_text) - len(pruned_css)
}, indent=2), encoding='utf-8')

print('used_classes', len(used_classes))
print('kept', kept_count, 'removed', removed_count)
print('wrote', str(PRUNED_PATH))
print('report', str(REPORT_PATH))
