"""Package the already-built app for GoDaddy's production-only npm install."""
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
package = json.loads((root / 'package.json').read_text())
output = root / 'artifacts' / 'multi-chart-godaddy.zip'
required = [root / 'dist/index.html', root / package['main']]
if not all(path.is_file() for path in required):
    raise SystemExit('Run npm run build before packaging.')

# The upload contains compiled JavaScript and CSS, so GoDaddy needs no build tools.
# Keep the normal source build command in the repository for ongoing development.
release = {key: package[key] for key in ('name', 'version', 'private', 'type', 'main', 'engines')}
release['scripts'] = {
    'build': 'node --check dist-server/index.mjs',
    'start': package['scripts']['start'],
}
release['dependencies'] = {
    key: package['dependencies'][key] for key in ('@mathieuc/tradingview', 'sirv')
}

output.parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as temporary:
    staging = Path(temporary)
    (staging / 'package.json').write_text(json.dumps(release, indent=2) + '\n')
    # Retain the exact versions already verified in the source lockfile.
    (staging / 'package-lock.json').write_bytes((root / 'package-lock.json').read_bytes())
    subprocess.run(['npm', 'install', '--package-lock-only', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], cwd=staging, check=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ('package.json', 'package-lock.json'):
            archive.write(staging / name, name)
        for directory in ('dist', 'dist-server'):
            for path in sorted((root / directory).rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(root).as_posix())

if output.stat().st_size >= 100_000_000:
    output.unlink()
    raise SystemExit('GoDaddy upload must be smaller than 100 MB.')
print(f'GoDaddy ZIP: {output} ({output.stat().st_size:,} bytes)')
