from pathlib import Path
from pypdf import PdfReader

paths = [
    Path(r"C:/Users/Nazim/Downloads/Label 22-05-2026 (4).pdf"),
    Path(r"C:/Users/Nazim/Desktop/P.Post/Label Generator/Label 22-05-2026 (4).pdf"),
]

for p in paths:
    reader = PdfReader(str(p))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    print(f"{p.name} pages={len(reader.pages)} chars={len(text)}")
    print(f"contains_MO={('MO Amount' in text) or ('Gross Collect Amount' in text) or ('MO Commission' in text)}")
    print(f"contains_general={all(x in text for x in ['IRL', 'UMS', 'RGL', 'PAR'])}")

    out = Path("forensic-artifacts") / ("benchmark-pdf-text.txt" if "Downloads" in str(p) else "restored-pdf-text.txt")
    out.write_text(text, encoding="utf-8")
