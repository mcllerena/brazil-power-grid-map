import json
import re
import sys
from pathlib import Path

import pandas as pd


ISO_KEY_BY_SHEET = {
    "caiso": "caiso",
    "iso-ne": "iso-ne",
    "isone": "iso-ne",
    "nyiso": "nyiso",
    "ercot": "ercot",
    "spp": "spp",
    "pjm": "pjm",
    "miso": "miso",
    "westconnect": "westconnect",
    "northerngrid": "northerngrid",
    "sertp": "sertp",
    "frcc": "frcc",
}


def normalize_sheet_key(value: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", str(value or "").strip().lower())


def normalize_cell(value):
    if pd.isna(value):
        return ""
    text = str(value).strip()
    return text


def main() -> int:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("reference/us_reconductoring_projects.xlsx")
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if not xlsx_path.exists():
        payload = json.dumps({})
        if output_path:
            output_path.write_text(payload, encoding="utf-8")
        else:
            print(payload, end="")
        return 0

    workbook = pd.ExcelFile(xlsx_path)
    out = {}

    for sheet_name in workbook.sheet_names:
        sheet_key = normalize_sheet_key(sheet_name)
        iso_key = ISO_KEY_BY_SHEET.get(sheet_key)
        if not iso_key:
            continue

        df = pd.read_excel(xlsx_path, sheet_name=sheet_name)
        if df.empty:
            out[iso_key] = []
            continue

        rows = []
        for _, record in df.iterrows():
            normalized = {str(col).strip(): normalize_cell(record[col]) for col in df.columns}
            sub_1 = normalize_cell(normalized.get("SUB_1", ""))
            sub_2 = normalize_cell(normalized.get("SUB_2", ""))
            if not sub_1 or not sub_2:
                continue
            rows.append(normalized)

        out[iso_key] = rows

    payload = json.dumps(out)
    if output_path:
        output_path.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
