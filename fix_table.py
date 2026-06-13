import os

file_path = 'frontend/src/components/PortfolioTable.tsx'

if os.path.exists(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Manual safe replacements for Typography
    content = content.replace("font-black", "font-bold")
    content = content.replace("tracking-widest", "tracking-wide")
    content = content.replace(" uppercase", "")
    content = content.replace(" italic", "")
    
    with open(file_path, 'w') as f:
        f.write(content)
    print("Fixed.")
