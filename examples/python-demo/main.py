"""Summarize a CSV using only Python's standard library."""

import argparse
import csv
import html
import json
from collections import defaultdict
from pathlib import Path


def summarize(source):
    totals = defaultdict(int)
    count = 0
    with source.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            totals[row["category"]] += int(row["amount"])
            count += 1
    return {"count": count, "total": sum(totals.values()), "by_category": dict(sorted(totals.items()))}


def main():
    directory = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=directory / "data.csv")
    parser.add_argument("--output-dir", type=Path, default=directory / "output")
    args = parser.parse_args()
    report = summarize(args.input)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    (args.output_dir / "summary.json").write_text(text + "\n", encoding="utf-8")
    rows = "".join(f"<tr><td>{html.escape(category)}</td><td>{amount}</td></tr>" for category, amount in report["by_category"].items())
    page = f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Python Demo Report</title>
<style>body{{font:16px system-ui;max-width:640px;margin:48px auto;padding:16px}}table{{border-collapse:collapse;width:100%}}th,td{{padding:12px;text-align:left;border-bottom:1px solid #ccc}}</style>
<h1>Python Demo Report</h1><p>Records: {report['count']} · Total: {report['total']}</p>
<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>{rows}</tbody></table></html>
"""
    (args.output_dir / "report.html").write_text(page, encoding="utf-8")
    print(text)
    print(f"Reports written to: {args.output_dir}")


if __name__ == "__main__":
    main()
