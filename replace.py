import os

files = [
    'frontend/src/app/(authenticated)/portfolio/page.tsx',
    'frontend/src/app/(authenticated)/portfolio/watchlist/page.tsx'
]

for file_path in files:
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            content = f.read()
            
        content = content.replace('font-black text-foreground uppercase tracking-widest italic', 'font-bold text-foreground uppercase tracking-wide')
        content = content.replace('font-black text-muted-foreground uppercase tracking-[0.2em] italic', 'font-bold text-muted-foreground uppercase tracking-wide')
        content = content.replace('font-black uppercase tracking-widest italic opacity-60', 'font-bold uppercase tracking-wide opacity-60')
        content = content.replace('font-black uppercase tracking-widest italic text-[12px] opacity-60', 'font-bold uppercase tracking-wide text-[12px] opacity-60')
        content = content.replace('font-black uppercase tracking-widest italic text-muted-foreground', 'font-bold uppercase tracking-wide text-muted-foreground')
        content = content.replace('font-black text-muted-foreground uppercase tracking-widest italic opacity-40', 'font-bold text-muted-foreground uppercase tracking-wide opacity-40')
        
        # General replaces
        content = content.replace(' italic', '')
        content = content.replace('italic', '')
        content = content.replace('font-black', 'font-bold')
        content = content.replace('tracking-widest', 'tracking-wide')
        
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Updated {file_path}")
