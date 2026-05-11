#!/usr/bin/env python3
"""
Extract real URLs from a PDF roundup and update the matching YAML file.

Usage:
    python3 scripts/extract-links-from-pdf.py <pdf_path> <yaml_path>

Example:
    python3 scripts/extract-links-from-pdf.py \
        ~/Downloads/Crypto\ News\ Roundup\ -\ 5_1.pdf \
        curated/2026-05-01.yaml

Requires: pip install PyMuPDF
"""

import sys
import re
import fitz  # PyMuPDF


def extract_pdf_links(pdf_path):
    """Extract all hyperlinks from a PDF, returning (clean_url, link_text) pairs."""
    doc = fitz.open(pdf_path)
    links = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        for link in page.get_links():
            if not link.get('uri') or link['uri'].startswith('mailto:'):
                continue
            uri = link['uri']
            rect = fitz.Rect(link['from'])
            text = page.get_text('text', clip=rect).strip().replace('\n', ' ')
            if not text:
                rect2 = fitz.Rect(rect.x0 - 5, rect.y0 - 2, rect.x1 + 300, rect.y1 + 2)
                text = page.get_text('text', clip=rect2).strip().replace('\n', ' ')
            # Strip tracking/analytics params
            clean = re.sub(
                r'[?&](utm_\w+|_bhlid|_hsenc|_hsmi|guccounter|member)=[^&]*', '', uri
            )
            clean = re.sub(r'[?&]$', '', clean)
            links.append((clean, text))
    return links


def build_lookup(pdf_links):
    """Deduplicate links and build a list of (url, word_set, text) for matching."""
    entries = []
    seen = set()
    for url, text in pdf_links:
        if url not in seen:
            seen.add(url)
            words = set(re.findall(r'[a-z]{4,}', text.lower()))
            entries.append((url, words, text))
    return entries


def fix_yaml_urls(yaml_path, pdf_entries, dry_run=False):
    """Match YAML title lines to PDF links and replace URLs. Returns fix count."""
    with open(yaml_path, 'r') as f:
        lines = f.read().split('\n')

    fixes = 0
    for i, line in enumerate(lines):
        m = re.match(r'^(\s*)-?\s*title:\s*"(.+)"', line)
        if not m:
            continue
        title = m.group(2)
        title_words = set(re.findall(r'[a-z]{4,}', title.lower()))
        if len(title_words) < 2:
            continue

        for j in range(i + 1, min(i + 3, len(lines))):
            um = re.match(r'^(\s*)url:\s*(.+)', lines[j])
            if not um:
                continue
            indent = um.group(1)
            old_url = um.group(2).strip()

            best_url = None
            best_score = 0
            for purl, pwords, _ptext in pdf_entries:
                overlap = len(title_words & pwords)
                if overlap > best_score:
                    best_score = overlap
                    best_url = purl

            if best_url and best_score >= 3 and best_url != old_url:
                if not dry_run:
                    lines[j] = f'{indent}url: {best_url}'
                fixes += 1
                print(f'FIXED: {title[:70]}')
                print(f'  OLD: {old_url}')
                print(f'  NEW: {best_url}')
                print()
            break

    if not dry_run:
        with open(yaml_path, 'w') as f:
            f.write('\n'.join(lines))

    return fixes


def main():
    if len(sys.argv) < 3:
        print(__doc__.strip())
        sys.exit(1)

    pdf_path = sys.argv[1]
    yaml_path = sys.argv[2]
    dry_run = '--dry-run' in sys.argv

    if dry_run:
        print('DRY RUN — no files will be modified\n')

    pdf_links = extract_pdf_links(pdf_path)
    print(f'Extracted {len(pdf_links)} links from PDF')

    pdf_entries = build_lookup(pdf_links)
    print(f'Deduplicated to {len(pdf_entries)} unique URLs\n')

    fixes = fix_yaml_urls(yaml_path, pdf_entries, dry_run=dry_run)
    print(f'Total fixes: {fixes}')

    if not dry_run and fixes > 0:
        print(f'\nUpdated {yaml_path}')
        print('Run `node scripts/build-feed.mjs` to regenerate feed.xml')


if __name__ == '__main__':
    main()
