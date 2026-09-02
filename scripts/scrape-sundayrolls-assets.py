#!/usr/bin/env python3
"""Download marketing and product images from sundayrollsgolf.com."""

from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / 'src/data/product-catalog.json'
ASSETS_DIR = ROOT / 'public/assets'
MANIFEST_PATH = ROOT / 'src/assets/assets-manifest.json'

SITE_ID = '68d847794748c81c26a22b90'

SITE_ASSETS = {
    'home/hero.jpg': (
        f'https://images.squarespace-cdn.com/content/v1/{SITE_ID}/'
        '76cdeac8-1370-4002-987a-003cfe2fc1ec/Putter+Headcovers.JPG?format=1500w'
    ),
    'home/crew.jpg': (
        f'https://images.squarespace-cdn.com/content/v1/{SITE_ID}/'
        'b3adc3c6-783e-4b81-b6a7-4f7a7a5ff55e/sunday-rolls-crew.JPG?format=1500w'
    ),
    'home/lifestyle.png': (
        f'https://images.squarespace-cdn.com/content/v1/{SITE_ID}/'
        'aea15c0a-e89c-4268-83be-67c3dd64fc88/lab-putter-covers.png?format=1500w'
    ),
    'shop/banner.jpg': (
        f'https://images.squarespace-cdn.com/content/v1/{SITE_ID}/'
        '76cdeac8-1370-4002-987a-003cfe2fc1ec/Putter+Headcovers.JPG?format=1500w'
    ),
}

DOODLE_URL = (
    f'https://images.squarespace-cdn.com/content/v1/{SITE_ID}/'
    'e324a5df-509b-4813-a0fd-584e6cf80b55/IMG_2867.JPG?format=1000w'
)


def normalize_url(url: str, width: str = '1000w') -> str:
    if url.startswith('/'):
        raise ValueError(f'Expected remote URL, received local path: {url}')
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme:
        url = f'https:{url}'
    base = url.split('?')[0]
    return f'{base}?format={width}'


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={'User-Agent': 'SundayRollsSiteMigration/1.0'},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        destination.write_bytes(response.read())
    print(f'  saved {destination.relative_to(ROOT)}')


def scrape_shop_doodle() -> str:
    shop_url = 'https://www.sundayrollsgolf.com/shop'
    request = urllib.request.Request(
        shop_url,
        headers={'User-Agent': 'SundayRollsSiteMigration/1.0'},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        html = response.read().decode('utf-8', errors='ignore')

    match = re.search(
        rf'https://images\.squarespace-cdn\.com/content/v1/{SITE_ID}/[a-f0-9-]+/IMG_2867\.JPG',
        html,
    )
    return normalize_url(match.group(0) if match else DOODLE_URL)


def main() -> int:
    catalog = json.loads(CATALOG_PATH.read_text())
    manifest: dict[str, str | dict[str, str]] = {
        'brand': {'logo': '/assets/brand/logo.svg'},
        'home': {},
        'shop': {},
        'products': {},
    }

    print('Downloading site assets...')
    for relative_path, url in SITE_ASSETS.items():
        destination = ASSETS_DIR / relative_path
        download(normalize_url(url, '1500w'), destination)
        key = Path(relative_path).stem
        section = relative_path.split('/')[0]
        manifest[section][key] = f'/assets/{relative_path}'

    print('Downloading catalog product images...')
    for product in catalog:
        handle = product['handle']
        images = product.get('images') or []
        destination = ASSETS_DIR / 'products' / f'{handle}.jpg'
        local_path = f'/assets/products/{handle}.jpg'

        remote_url = images[0] if images and images[0].startswith('http') else None
        if remote_url:
            url = normalize_url(remote_url, '1000w')
        elif handle == 'the-doodle':
            url = scrape_shop_doodle()
        else:
            print(f'  skip {handle}: no remote image URL in catalog')
            manifest['products'][handle] = local_path
            continue

        download(url, destination)
        manifest['products'][handle] = local_path
        product['images'] = [local_path]

    CATALOG_PATH.write_text(json.dumps(catalog, indent=2) + '\n')
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Wrote manifest to {MANIFEST_PATH.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
