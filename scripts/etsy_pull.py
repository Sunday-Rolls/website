#!/usr/bin/env python3
"""
etsy_pull.py - Pull your own Etsy shop data into CSV files.

Uses only the Python standard library (Python 3.8+), so nothing to install.
Also the one-time sign-in for the dashboard's Etsy sync: see docs/ETSY_SYNC.md.

Outputs (in the same folder as this script):
  etsy_orders.csv           one row per order (receipt)
  etsy_order_items.csv      one row per item sold (transaction)
  etsy_listings.csv         your active listings
  etsy_monthly_summary.csv  orders / items / revenue by month
  etsy_ledger.csv           payment-account ledger: every fee, ad charge and payout

Usage:
  python3 etsy_pull.py                    # pull everything
  python3 etsy_pull.py --since 2026-01-01 # only orders created on/after a date
  python3 etsy_pull.py --reauth           # redo the Etsy sign-in step

First run asks for your keystring, shared secret and redirect URI
(from https://www.etsy.com/developers/your-apps) and walks you through
a one-time sign-in. After that, tokens refresh automatically.
"""

import argparse
import base64
import csv
import datetime as dt
import hashlib
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(HERE, "etsy_config.json")
TOKEN_FILE = os.path.join(HERE, "etsy_tokens.json")

API_BASE = "https://api.etsy.com/v3/application"
TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token"
AUTH_URL = "https://www.etsy.com/oauth/connect"
SCOPES = "transactions_r listings_r shops_r"

# Orders with these statuses are excluded from revenue in the monthly summary.
EXCLUDED_STATUSES = {"canceled", "fully refunded"}


# --------------------------------------------------------------------------- #
# Config & tokens
# --------------------------------------------------------------------------- #
def load_json(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    try:
        os.chmod(path, 0o600)  # keep secrets private
    except OSError:
        pass


def get_config():
    cfg = load_json(CONFIG_FILE)
    if cfg:
        return cfg
    print("First-time setup. Find these at https://www.etsy.com/developers/your-apps\n")
    cfg = {
        "keystring": input("Keystring: ").strip(),
        "shared_secret": input("Shared secret: ").strip(),
        "redirect_uri": input(
            "Redirect URI (exactly as registered, e.g. https://localhost:3003/callback): "
        ).strip(),
    }
    save_json(CONFIG_FILE, cfg)
    print(f"Saved settings to {os.path.basename(CONFIG_FILE)}\n")
    return cfg


def api_key_header(cfg):
    # Since Feb 2026 Etsy requires "keystring:shared_secret".
    return f"{cfg['keystring']}:{cfg['shared_secret']}"


# --------------------------------------------------------------------------- #
# HTTP helpers
# --------------------------------------------------------------------------- #
def http(method, url, headers=None, data=None, retries=5):
    body = urllib.parse.urlencode(data).encode() if data else None
    hdrs = {"Accept": "application/json", "User-Agent": "etsy-pull-script/1.0"}
    if body:
        hdrs["Content-Type"] = "application/x-www-form-urlencoded"
    hdrs.update(headers or {})
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  Etsy returned {e.code}; retrying in {wait}s...")
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {e.code} for {url}\n{text}") from None
        except urllib.error.URLError as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"Network error for {url}: {e}") from None


# --------------------------------------------------------------------------- #
# OAuth (PKCE)
# --------------------------------------------------------------------------- #
def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def do_auth(cfg):
    verifier = b64url(secrets.token_bytes(32))
    challenge = b64url(hashlib.sha256(verifier.encode()).digest())
    state = b64url(secrets.token_bytes(12))
    params = {
        "response_type": "code",
        "client_id": cfg["keystring"],
        "redirect_uri": cfg["redirect_uri"],
        "scope": SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    url = AUTH_URL + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    print("STEP 1: Your browser is opening Etsy. Click 'Allow access'.")
    print("        (If it doesn't open, copy this link into your browser:)\n")
    print(url + "\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    print("STEP 2: Your browser will then show a 'site can't be reached' page (that's expected).")
    print("        Click the address bar, press Ctrl+C, then right-click here to paste and press Enter.\n")
    pasted = input("Paste the address: ").strip()

    qs = urllib.parse.parse_qs(urllib.parse.urlparse(pasted).query)
    if "error" in qs:
        sys.exit(f"Etsy returned an error: {qs.get('error_description', qs['error'])[0]}")
    if qs.get("state", [""])[0] != state:
        sys.exit("State mismatch - please run again and paste the newest address.")
    code = qs.get("code", [""])[0]
    if not code:
        sys.exit("Couldn't find a 'code' in that address. Please try again.")

    tok = http(
        "POST",
        TOKEN_URL,
        headers={"x-api-key": api_key_header(cfg)},
        data={
            "grant_type": "authorization_code",
            "client_id": cfg["keystring"],
            "redirect_uri": cfg["redirect_uri"],
            "code": code,
            "code_verifier": verifier,
        },
    )
    store_tokens(tok)
    print("Signed in. Tokens saved.\n")
    return load_json(TOKEN_FILE)


def store_tokens(tok):
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
    save_json(TOKEN_FILE, tok)


def get_access_token(cfg, force_reauth=False):
    tok = None if force_reauth else load_json(TOKEN_FILE)
    if not tok:
        tok = do_auth(cfg)
    if time.time() >= tok.get("expires_at", 0):
        try:
            new = http(
                "POST",
                TOKEN_URL,
                headers={"x-api-key": api_key_header(cfg)},
                data={
                    "grant_type": "refresh_token",
                    "client_id": cfg["keystring"],
                    "refresh_token": tok["refresh_token"],
                },
            )
            store_tokens(new)
            tok = load_json(TOKEN_FILE)
        except RuntimeError as e:
            print(f"Token refresh failed ({e.args[0].splitlines()[0]}); signing in again.\n")
            tok = do_auth(cfg)
    return tok["access_token"]


# --------------------------------------------------------------------------- #
# Etsy API
# --------------------------------------------------------------------------- #
class Etsy:
    def __init__(self, cfg, token):
        self.headers = {"x-api-key": api_key_header(cfg), "Authorization": f"Bearer {token}"}

    def get(self, path, params=None):
        url = API_BASE + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        time.sleep(0.15)  # stay well under Etsy's per-second limit
        return http("GET", url, headers=self.headers)

    def paginate(self, path, params=None, label="records"):
        params = dict(params or {})
        params["limit"] = 100
        offset, out = 0, []
        while True:
            params["offset"] = offset
            page = self.get(path, params)
            results = page.get("results", [])
            out.extend(results)
            total = page.get("count", len(out))
            print(f"  {label}: {len(out)} / {total}", end="\r")
            if not results or len(out) >= total:
                break
            offset += len(results)
        print()
        return out


# --------------------------------------------------------------------------- #
# Formatting helpers
# --------------------------------------------------------------------------- #
def money(m):
    if not m:
        return ""
    try:
        return round(m["amount"] / (m.get("divisor") or 100), 2)
    except (KeyError, TypeError, ZeroDivisionError):
        return ""


def currency(m):
    return (m or {}).get("currency_code", "")


def ts(t):
    if not t:
        return ""
    return dt.datetime.fromtimestamp(int(t)).strftime("%Y-%m-%d %H:%M:%S")


def write_csv(name, rows, fields):
    path = os.path.join(HERE, name)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"  wrote {name} ({len(rows)} rows)")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Pull Etsy shop data to CSV.")
    ap.add_argument("--since", help="Only orders created on/after YYYY-MM-DD")
    ap.add_argument("--reauth", action="store_true", help="Redo the Etsy sign-in")
    args = ap.parse_args()

    cfg = get_config()
    etsy = Etsy(cfg, get_access_token(cfg, force_reauth=args.reauth))

    me = etsy.get("/users/me")
    shop_id = me.get("shop_id")
    if not shop_id:
        sys.exit("This Etsy account doesn't appear to have a shop.")
    shop = etsy.get(f"/shops/{shop_id}")
    print(f"Shop: {shop.get('shop_name')} (id {shop_id})\n")

    # ---- Orders ----
    print("Fetching orders...")
    rparams = {}
    if args.since:
        rparams["min_created"] = int(dt.datetime.strptime(args.since, "%Y-%m-%d").timestamp())
    receipts = etsy.paginate(f"/shops/{shop_id}/receipts", rparams, "orders")

    orders, items = [], []
    monthly = defaultdict(lambda: defaultdict(float))
    for r in receipts:
        created = r.get("created_timestamp") or r.get("create_timestamp")
        status = (r.get("status") or "").lower()
        txns = r.get("transactions") or []
        qty = sum(int(t.get("quantity") or 0) for t in txns)
        orders.append({
            "receipt_id": r.get("receipt_id"),
            "created": ts(created),
            "status": r.get("status"),
            "is_paid": r.get("is_paid"),
            "is_shipped": r.get("is_shipped"),
            "buyer_name": r.get("name"),
            "country": r.get("country_iso"),
            "items": qty,
            "subtotal": money(r.get("subtotal")),
            "shipping": money(r.get("total_shipping_cost")),
            "tax": money(r.get("total_tax_cost")),
            "discount": money(r.get("discount_amt")),
            "grand_total": money(r.get("grandtotal")),
            "currency": currency(r.get("grandtotal")),
        })
        for t in txns:
            items.append({
                "receipt_id": r.get("receipt_id"),
                "transaction_id": t.get("transaction_id"),
                "order_created": ts(created),
                "listing_id": t.get("listing_id"),
                "title": t.get("title"),
                "sku": t.get("sku"),
                "quantity": t.get("quantity"),
                "unit_price": money(t.get("price")),
                "line_total": (
                    round(money(t.get("price")) * int(t.get("quantity") or 0), 2)
                    if money(t.get("price")) != "" else ""
                ),
                "currency": currency(t.get("price")),
            })
        if created and status not in EXCLUDED_STATUSES:
            month = dt.datetime.fromtimestamp(int(created)).strftime("%Y-%m")
            m = monthly[month]
            m["orders"] += 1
            m["items_sold"] += qty
            for key, field in (("gross_sales", "grandtotal"), ("subtotal", "subtotal"),
                               ("shipping", "total_shipping_cost"), ("tax", "total_tax_cost"),
                               ("discounts", "discount_amt")):
                v = money(r.get(field))
                m[key] += v if v != "" else 0

    # ---- Listings ----
    print("Fetching active listings...")
    listings_raw = etsy.paginate(f"/shops/{shop_id}/listings", {"state": "active"}, "listings")
    listings = [{
        "listing_id": l.get("listing_id"),
        "title": l.get("title"),
        "state": l.get("state"),
        "price": money(l.get("price")),
        "currency": currency(l.get("price")),
        "quantity": l.get("quantity"),
        "views": l.get("views"),
        "favorites": l.get("num_favorers"),
        "skus": ", ".join(l.get("skus") or []),
        "tags": ", ".join(l.get("tags") or []),
        "created": ts(l.get("created_timestamp") or l.get("creation_timestamp")),
        "last_modified": ts(l.get("last_modified_timestamp")),
        "url": l.get("url"),
    } for l in listings_raw]

    # ---- Ledger (fees, Etsy Ads, Offsite Ads, payouts) ----
    print("Fetching payment ledger (last 365 days)...")
    ledger = []
    try:
        end = int(time.time())
        start = end - 365 * 86400
        while start < end:
            stop = min(end, start + 30 * 86400 - 1)
            ledger.extend(etsy.paginate(
                f"/shops/{shop_id}/payment-account/ledger-entries",
                {"min_created": start, "max_created": stop}, "ledger entries"))
            start = stop + 1
    except RuntimeError as e:
        print(f"  Couldn't read the ledger: {str(e).splitlines()[0]}")
    seen = set()
    ledger_rows = []
    for e in sorted(ledger, key=lambda x: x.get("created_timestamp") or 0):
        if e.get("entry_id") in seen:
            continue
        seen.add(e.get("entry_id"))
        ledger_rows.append({
            "entry_id": e.get("entry_id"),
            "created": ts(e.get("created_timestamp") or e.get("create_date")),
            "ledger_type": e.get("ledger_type"),
            "description": e.get("description"),
            "amount": round((e.get("amount") or 0) / 100, 2),
            "currency": e.get("currency"),
            "reference_type": e.get("reference_type"),
            "reference_id": e.get("reference_id"),
            "balance": round((e.get("balance") or 0) / 100, 2),
        })

    # ---- Write ----
    print("\nSaving CSVs...")
    write_csv("etsy_orders.csv", orders, list(orders[0].keys()) if orders else
              ["receipt_id", "created", "status", "grand_total"])
    write_csv("etsy_order_items.csv", items, list(items[0].keys()) if items else
              ["receipt_id", "transaction_id", "title", "quantity", "unit_price"])
    write_csv("etsy_listings.csv", listings, list(listings[0].keys()) if listings else
              ["listing_id", "title", "price"])
    summary_fields = ["month", "orders", "items_sold", "gross_sales", "subtotal",
                      "shipping", "tax", "discounts"]
    summary = [{"month": k, **{f: (int(v) if f in ("orders", "items_sold") else round(v, 2))
                               for f, v in monthly[k].items()}}
               for k in sorted(monthly)]
    write_csv("etsy_monthly_summary.csv", summary, summary_fields)
    write_csv("etsy_ledger.csv", ledger_rows, list(ledger_rows[0].keys()) if ledger_rows else
              ["entry_id", "created", "ledger_type", "amount"])
    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nCancelled.")
    except RuntimeError as e:
        sys.exit(f"\nError: {e}")
