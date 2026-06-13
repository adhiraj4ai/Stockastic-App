import os
import re

files_to_fix = [
    'frontend/src/components/SystemOffline.tsx',
    'frontend/src/components/PositionSizingCalculator.tsx',
    'frontend/src/components/MarketTerminal.tsx'
]

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, 'r') as f:
        content = f.read()
        
    # We only want to replace inside className="..." or className={...}
    # To be safe, we'll just replace the specific class tokens globally
    # but ensure they are whole words to not break "italics" in text
    
    # Replace font-black with font-bold
    content = re.sub(r'\bfont-black\b', 'font-bold', content)
    
    # Replace tracking-widest with tracking-wide
    content = re.sub(r'\btracking-widest\b', 'tracking-wide', content)
    
    # Replace italic class
    content = re.sub(r'\bitalic\b', '', content)
    
    # Clean up double spaces in classNames
    content = content.replace('  ', ' ')
    
    with open(file_path, 'w') as f:
        f.write(content)
        
    print(f"Fixed {file_path}")
