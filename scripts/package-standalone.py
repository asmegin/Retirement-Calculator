"""Package only public client assets, never server configuration or user data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
public=root/'src'/'public'
output=root/'dist'/'retirement-calculator-standalone.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output,'w',ZIP_DEFLATED) as bundle:
    for item in sorted(public.rglob('*')):
        if item.is_file() and item.suffix.lower() in {'.html','.js','.css','.svg','.png','.ico','.txt','.woff2'}:
            bundle.write(item,item.relative_to(public).as_posix())
    bundle.writestr('START-HERE.txt','Extract the entire ZIP, then open index.html in Edge or Chrome.\nNo Node, Docker or internet connection is needed.\nUse Export JSON to keep a portable copy of your plan. Browser data belongs to this browser and folder.\nKeep all extracted files together.\n')
print(output)
