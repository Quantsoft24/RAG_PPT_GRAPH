"""Quick debug script to check block structure in extraction.json"""
import json
import os

base = r"C:\Users\DELL\Desktop\PRISM_ANALYST\companies_annual_report_and_results"

companies = {
    "mahindra_annual_report_and_results": "mahindra_results",
    "adani_annual_report_and_results": "adanient_results",
    "icici_annual_report_and_results": "icici_results",
    "infosys_annual_report_and_results": "infosys_results",
}

for folder, results in companies.items():
    path = os.path.join(base, folder, results, "extraction.json")
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    total_blocks = 0
    pages_with_blocks = 0
    pages_without_blocks = 0
    type_counts = {}
    
    # Check first 5 pages for detail
    for i, page in enumerate(data["pages"]):
        blocks = page.get("blocks", [])
        total_blocks += len(blocks)
        if blocks:
            pages_with_blocks += 1
        else:
            pages_without_blocks += 1
        
        for b in blocks:
            t = b.get("type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
        
        if i < 3:
            print(f"  Page {page['page']}: {len(blocks)} blocks", end="")
            if blocks:
                indices = [(b['type'], b['index']) for b in blocks]
                print(f" → {indices}")
            else:
                print()
    
    print(f"\n{folder}:")
    print(f"  Total pages: {data['total_pages']}")
    print(f"  Pages with blocks: {pages_with_blocks}")
    print(f"  Pages without blocks: {pages_without_blocks}")
    print(f"  Total blocks: {total_blocks}")
    print(f"  Type counts: {type_counts}")
    print()
