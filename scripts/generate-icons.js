/**
 * Script para generar iconos PNG válidos para la PWA sin dependencias externas.
 * Utiliza zlib nativo de Node.js para empaquetar chunks PNG según la especificación RFC 2083.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, drawFn) {
  // RGBA buffer: cada línea lleva un byte de filtro (0 = None) + width * 4 bytes
  const stride = 1 + width * 4;
  const rawData = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // Helper para construir chunks PNG
  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crcVal = zlib.crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crcVal >>> 0, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: width (4), height (4), depth (1), colorType 6=RGBA (1), comp (1), filter (1), interlace (1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', deflated);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Función de dibujo para el icono:
 * Crea un fondo redondeado con gradiente azul oscuro (#0a1324)
 * y un cubo isométrico central estilizado en 3D (CFGS 3D) con colores cyan/azul cielo.
 */
function draw3DIcon(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;

  // Distancia del borde para esquinas redondeadas (squircle suave)
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const maxD = Math.max(dx, dy);
  const cornerD = Math.hypot(dx - (cx - radius), dy - (cy - radius));

  let inBox = false;
  if (dx <= radius && dy <= radius) {
    if (dx > (cx - radius) && dy > (cy - radius)) {
      inBox = cornerD <= radius;
    } else {
      inBox = true;
    }
  }

  if (!inBox) {
    return [0, 0, 0, 0]; // Transparente fuera del contenedor
  }

  // Fondo gradiente oscuro
  const bgGrad = y / size;
  let r = Math.round(10 + bgGrad * 6);
  let g = Math.round(15 + bgGrad * 12);
  let b = Math.round(28 + bgGrad * 24);

  // Coordenadas relativas al centro para el cubo 3D
  const nx = (x - cx) / (size * 0.32);
  const ny = (y - cy) / (size * 0.32);

  // Geometría del cubo isométrico
  // Cara superior: Rombo con vértices (0, -0.9), (0.78, -0.45), (0, 0), (-0.78, -0.45)
  const inTop = (ny < 0) &&
    (ny > -0.9) &&
    (Math.abs(nx) <= (ny + 0.9) * 0.866) &&
    (Math.abs(nx) <= -ny * 0.866);

  // Cara izquierda: Paralelogramo (-0.78, -0.45), (0, 0), (0, 0.9), (-0.78, 0.45)
  const inLeft = (nx < 0) && (nx >= -0.78) &&
    (ny >= nx * 0.577) &&
    (ny <= nx * 0.577 + 0.9);

  // Cara derecha: Paralelogramo (0, 0), (0.78, -0.45), (0.78, 0.45), (0, 0.9)
  const inRight = (nx >= 0) && (nx <= 0.78) &&
    (ny >= -nx * 0.577) &&
    (ny <= -nx * 0.577 + 0.9);

  if (inTop) {
    // Cara superior: Azul claro / cian brillante
    r = 56; g = 189; b = 248;
  } else if (inLeft) {
    // Cara izquierda: Azul medio
    r = 2; g = 132; b = 199;
  } else if (inRight) {
    // Cara derecha: Azul oscuro/profundo
    r = 3; g = 105; b = 161;
  }

  // Borde sutil del contenedor
  const distFromEdge = radius - Math.max(dx, dy);
  if (distFromEdge < 2) {
    r = Math.min(255, r + 40);
    g = Math.min(255, g + 50);
    b = Math.min(255, b + 70);
  }

  return [r, g, b, 255];
}

const rootDir = path.resolve(__dirname, '..');

// Generar icon-192.png
const png192 = createPng(192, 192, draw3DIcon);
fs.writeFileSync(path.join(rootDir, 'icon-192.png'), png192);
console.log('✓ icon-192.png generado con éxito (' + png192.length + ' bytes)');

// Generar icon-512.png
const png512 = createPng(512, 512, draw3DIcon);
fs.writeFileSync(path.join(rootDir, 'icon-512.png'), png512);
console.log('✓ icon-512.png generado con éxito (' + png512.length + ' bytes)');
