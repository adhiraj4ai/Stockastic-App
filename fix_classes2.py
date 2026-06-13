import os
import re

files_to_fix = [
    'frontend/src/app/(authenticated)/signals/SignalsPageClient.tsx',
    'frontend/src/components/ticker/IntelligenceGlass.tsx',
    'frontend/src/components/ticker/BentoMetrics.tsx',
    'frontend/src/components/ticker/PriceActionTerminal.tsx',
    'frontend/src/components/ticker/TickerSignals.tsx',
    'frontend/src/components/ticker/TickerAccumulation.tsx'
]

for file_path in files_to_fix:
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, 'r') as f:
        content = f.read()
        
    # Replace font-black with font-bold
    content = re.sub(r'\bfont-black\b', 'font-bold', content)
    
    # Replace tracking-widest with tracking-wide
    content = re.sub(r'\btracking-widest\b', 'tracking-wide', content)
    
    # Replace italic class (safely inside string literals for classes)
    content = re.sub(r'\bitalic\b', '', content)
    
    # Clean up double spaces in classNames
    content = content.replace('  ', ' ')
    
    with open(file_path, 'w') as f:
        f.write(content)
        
    print(f"Fixed {file_path}")
