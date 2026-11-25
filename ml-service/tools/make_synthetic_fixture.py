"""Generate a tiny SYNTHETIC fixture for testing the ML pipeline and API plumbing only.

Every row has data_origin='synthetic_fixture'. Labels come from an arbitrary toy rule below and carry
NO real-world meaning. Anything trained on this file is a development model; its metrics must never be
reported as model performance.
"""
import json, random, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from accessflow_ml.data import assign_split

RULES = [("image-alt", "critical", "cat.text-alternatives", "wcag111", "A", "img"),
         ("button-name", "critical", "cat.name-role-value", "wcag412", "A", "button"),
         ("color-contrast", "serious", "cat.color", "wcag143", "AA", "div"),
         ("label", "critical", "cat.forms", "wcag131", "A", "input"),
         ("heading-order", "moderate", "cat.semantics", None, None, "h3"),
         ("region", "moderate", "cat.keyboard", None, None, "div"),
         ("list", "serious", "cat.structure", "wcag131", "A", "li")]

def toy_label(rule, nodes, interactive):  # arbitrary; NOT an accessibility priority policy
    return "High" if (interactive and nodes >= 1 and rule in {"button-name", "label"}) else \
           "Low" if rule in {"heading-order", "region"} else "Medium"

def main(n=60, seed=7):
    rng = random.Random(seed); out = []
    for i in range(n):
        rule, impact, cat, wtag, lvl, tag = rng.choice(RULES)
        nodes = rng.choice([1, 1, 2, 3, 8]); interactive = tag in {"button", "input"}
        domain = f"fixture-site-{rng.randint(1, 20)}.example"
        out.append({
            "finding_id": f"synthetic-{i:04d}", "data_origin": "synthetic_fixture", "page_url": f"https://{domain}/",
            "registrable_domain": domain, "rule_id": rule, "axe_impact": impact, "axe_description": "synthetic",
            "tags": [cat] + ([f"wcag2{lvl.lower()}", wtag] if wtag else ["best-practice"]),
            "wcag_criteria": [{"criterion": f"{wtag[4]}.{wtag[5]}.{wtag[6:]}", "level": lvl}] if wtag else [],
            "node_count": nodes, "page_finding_count": rng.randint(1, 15), "dedupe_key": f"synthetic-{i}",
            "nodes": [{"tag": tag, "role": None, "is_interactive": interactive, "landmark": rng.choice(["main", "navigation", None]),
                       "selector": "#x", "html_snippet": "<synthetic>"}],
            "final_label": toy_label(rule, nodes, interactive), "label_method": "synthetic_toy_rule",
            "split": assign_split(domain),
        })
    path = ROOT / "tests/fixtures/synthetic_fixture.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in out) + "\n")
    print(f"wrote {len(out)} SYNTHETIC rows to {path}")

if __name__ == "__main__":
    main()
