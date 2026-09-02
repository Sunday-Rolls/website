#!/usr/bin/env python3
"""Sync src/data/product-catalog.json from the Faire Product Template.xlsx file."""

from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def slugify(title: str) -> str:
    value = title.lower().replace("'", '').replace('’', '')
    value = re.sub(r'[^a-z0-9]+', '-', value)
    return value.strip('-')


def parse_workbook(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        shared_xml = archive.read('xl/sharedStrings.xml')
        root = ET.fromstring(shared_xml)
        for item in root.findall('m:si', NS):
            texts = [node.text or '' for node in item.findall('.//m:t', NS)]
            shared.append(''.join(texts))

        sheet = ET.fromstring(archive.read('xl/worksheets/sheet2.xml'))
        cells: dict[tuple[int, str], str] = {}

        for cell in sheet.findall('m:sheetData/m:row/m:c', NS):
            reference = cell.get('r', '')
            column = ''.join(char for char in reference if char.isalpha())
            row = int(''.join(char for char in reference if char.isdigit()))
            value_node = cell.find('m:v', NS)
            value = ''
            if value_node is not None and value_node.text is not None:
                value = value_node.text
                if cell.get('t') == 's':
                    value = shared[int(value)]
            cells[(row, column)] = value

        columns = sorted({column for (_, column) in cells.keys()}, key=lambda item: (len(item), item))
        keys = {column: cells.get((3, column), '') for column in columns}
        products: list[dict] = []
        max_row = max(row for (row, _) in cells.keys())

        for row in range(4, max_row + 1):
            record = {
                keys[column]: cells.get((row, column), '')
                for column in columns
                if keys[column]
            }
            title = record.get('product_name_english', '').strip()
            if not title:
                continue

            image_value = record.get('product_images', '')
            products.append(
                {
                    'title': title,
                    'handle': slugify(title),
                    'status': record.get('info_status_v2', ''),
                    'productType': record.get('info_product_type', ''),
                    'description': record.get('product_description_english', ''),
                    'sellingMethod': record.get('selling_method', ''),
                    'category': 'headcovers',
                    'productToken': record.get('info_product_token', ''),
                    'itemWeight': record.get('item_weight', ''),
                    'itemWeightUnit': record.get('item_weight_unit', ''),
                    'dimensions': {
                        'length': record.get('item_length', ''),
                        'width': record.get('item_width', ''),
                        'height': record.get('item_height', ''),
                        'unit': record.get('item_dimensions_unit', ''),
                    },
                    'images': image_value.split() if image_value else [],
                }
            )

        return products


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Downloads/Product Template.xlsx'
    output = repo_root / 'src/data/product-catalog.json'

    if not source.exists():
        print(f'Catalog source not found: {source}', file=sys.stderr)
        return 1

    products = parse_workbook(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(products, indent=2) + '\n', encoding='utf-8')
    print(f'Synced {len(products)} products to {output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
