const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('PWA & Assets Integrity', () => {
  const root = path.resolve(__dirname, '..');

  it('manifest.json es un JSON válido con todos los campos obligatorios de PWA', () => {
    const filePath = path.join(root, 'manifest.json');
    assert.ok(fs.existsSync(filePath), 'manifest.json debe existir');

    const content = fs.readFileSync(filePath, 'utf8');
    const manifest = JSON.parse(content);

    assert.ok(manifest.name, 'manifest debe tener name');
    assert.ok(manifest.short_name, 'manifest debe tener short_name');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.start_url);
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.length >= 2, 'manifest debe definir al menos 2 iconos');
  });

  it('icon-192.png e icon-512.png son imágenes PNG binarias válidas con dimensiones correctas', () => {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    [192, 512].forEach((size) => {
      const iconPath = path.join(root, `icon-${size}.png`);
      assert.ok(fs.existsSync(iconPath), `icon-${size}.png debe existir`);

      const buf = fs.readFileSync(iconPath);
      assert.ok(buf.length > 500, `icon-${size}.png debe tener contenido binario`);
      assert.ok(
        buf.subarray(0, 8).equals(pngMagic),
        `icon-${size}.png debe tener la cabecera mágica de PNG`
      );

      // Comprobar dimensiones en el chunk IHDR (bytes 16..24)
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.equal(width, size, `Anchura esperada ${size}, obtenida ${width}`);
      assert.equal(height, size, `Altura esperada ${size}, obtenida ${height}`);
    });
  });

  it('favicon.svg existe y es un archivo vectorial SVG válido', () => {
    const favPath = path.join(root, 'favicon.svg');
    assert.ok(fs.existsSync(favPath), 'favicon.svg debe existir');

    const content = fs.readFileSync(favPath, 'utf8');
    assert.ok(content.includes('<svg') && content.includes('</svg>'));
    assert.ok(content.includes('viewBox='));
  });

  it('Todos los recursos listados en la caché de sw.js existen físicamente en disco', () => {
    const swPath = path.join(root, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js debe existir');

    const swContent = fs.readFileSync(swPath, 'utf8');
    // Extraer array ASSETS de sw.js
    const match = swContent.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'sw.js debe contener un array ASSETS');

    const assets = match[1]
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter((s) => s && s !== './');

    assets.forEach((relPath) => {
      const cleanPath = relPath.replace(/^\.\//, '');
      const fullPath = path.join(root, cleanPath);
      assert.ok(
        fs.existsSync(fullPath),
        `El recurso '${relPath}' precacheado en sw.js debe existir físicamente en ${fullPath}`
      );
    });
  });
});
