"""Package client assets and documentation, never private settings or user data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib,json
root=Path(__file__).resolve().parents[1]
public=root/'src'/'public'
version=json.loads((root/'src'/'package.json').read_text(encoding='utf-8'))['version']
output=root/'dist'/'retirement-calculator-standalone.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output,'w',ZIP_DEFLATED) as bundle:
    for item in sorted(public.rglob('*')):
        if item.is_file() and item.suffix.lower() in {'.html','.js','.css','.svg','.png','.ico','.txt','.woff2'}:
            bundle.write(item,item.relative_to(public).as_posix())
    bundle.write(root/'README.md','README.md')
    for document in sorted((root/'docs').rglob('*.md')):
        bundle.write(document,document.relative_to(root).as_posix())
    bundle.write(public/'vendor'/'LICENSES.txt','src/public/vendor/LICENSES.txt')
    for name in ['compose.yaml','.env.example','.github/workflows/docker-build.yaml']:
        bundle.write(root/name,name)
    bundle.writestr('VERSION.txt',version+'\n')
    bundle.writestr('START-HERE.txt','Retirement Calculator '+version+'\n\nExtract the entire ZIP, then open index.html in Edge or Chrome.\nNo Node, Docker or internet connection is needed.\nFor setup: Configuration > Household > Setup Wizard. Replace all example values with your own information.\nUse Export JSON to keep a portable copy of your plan. Browser data belongs to this browser and folder.\nKeep all extracted files together.\nRead README.md for the full installation and user guide, or visit https://github.com/asmegin/Retirement-Calculator#readme\n')
checksum=output.parent/'SHA256SUMS.txt'
checksum.write_text(hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name+'\n',encoding='utf-8')
print(output)
print(checksum)
