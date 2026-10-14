/**
 * @file tests/chat-crypto.test.js
 * @description Pruebas unitarias para el motor criptográfico y de identidad del Chat P2P.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateIdentityKeyPair,
  exportKeyPair,
  importKeyPair,
  getFingerprint,
  generateDefaultNickname,
  signPayload,
  verifyPayload,
  bytesToMnemonic,
  mnemonicToBytes,
  bufferToHex,
  hexToBuffer
} from '../src/chat/crypto.js';

describe('chat/crypto.js · Motor Criptográfico Autosoberano', () => {

  it('convierte correctamente entre Buffer y Hexadecimal', () => {
    const raw = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const hex = bufferToHex(raw);
    assert.equal(hex, 'deadbeef');

    const back = hexToBuffer(hex);
    assert.deepEqual(Array.from(back), [0xde, 0xad, 0xbe, 0xef]);
  });

  it('genera un par de claves ECDSA y las exporta/importa correctamente', async () => {
    const keyPair = await generateIdentityKeyPair();
    assert.ok(keyPair.privateKey);
    assert.ok(keyPair.publicKey);

    const exported = await exportKeyPair(keyPair);
    assert.ok(exported.privateJwk);
    assert.ok(typeof exported.publicSpki === 'string');

    const imported = await importKeyPair(exported.privateJwk, exported.publicSpki);
    assert.ok(imported.privateKey);
    assert.ok(imported.publicKey);
  });

  it('deriva un fingerprint determinista y de longitud fija (8 caracteres)', async () => {
    const keyPair = await generateIdentityKeyPair();
    const { publicSpki } = await exportKeyPair(keyPair);

    const fp1 = await getFingerprint(publicSpki);
    const fp2 = await getFingerprint(publicSpki);

    assert.equal(fp1.length, 8);
    assert.equal(fp1, fp2);
    assert.match(fp1, /^[0-9a-f]{8}$/);
  });

  it('genera un apodo por defecto determinista según el fingerprint', () => {
    const name1 = generateDefaultNickname('8f3b2a9c');
    const name2 = generateDefaultNickname('8f3b2a9c');
    assert.equal(name1, name2);
    assert.ok(name1.includes('#8f3b'));
  });

  it('firma un payload y lo verifica exitosamente con la clave pública', async () => {
    const keyPair = await generateIdentityKeyPair();
    const { publicSpki } = await exportKeyPair(keyPair);

    const message = {
      text: '¡Hola desde P2P!',
      roomId: 'general',
      timestamp: 1728921600000
    };

    const signature = await signPayload(keyPair.privateKey, message);
    assert.ok(typeof signature === 'string');
    assert.ok(signature.length > 20);

    const isValid = await verifyPayload(publicSpki, message, signature);
    assert.equal(isValid, true);
  });

  it('falla la verificación si el contenido del mensaje fue alterado (Anti-Tampering)', async () => {
    const keyPair = await generateIdentityKeyPair();
    const { publicSpki } = await exportKeyPair(keyPair);

    const originalMessage = {
      text: 'Transferir 10 créditos',
      timestamp: 1728921600000
    };

    const signature = await signPayload(keyPair.privateKey, originalMessage);

    const tamperedMessage = {
      text: 'Transferir 1000 créditos (alterado)',
      timestamp: 1728921600000
    };

    const isValid = await verifyPayload(publicSpki, tamperedMessage, signature);
    assert.equal(isValid, false);
  });

  it('convierte 12 bytes a frase mnemónica de 12 palabras y viceversa de forma bidireccional', () => {
    const originalBytes = new Uint8Array([10, 25, 42, 88, 120, 200, 15, 33, 99, 144, 210, 255]);
    const mnemonic = bytesToMnemonic(originalBytes);

    const words = mnemonic.split(' ');
    assert.equal(words.length, 12);

    const restoredBytes = mnemonicToBytes(mnemonic);
    assert.deepEqual(Array.from(restoredBytes), Array.from(originalBytes));
  });

  it('lanza error si la frase mnemónica contiene palabras no válidas o longitud incorrecta', () => {
    assert.throws(() => {
      mnemonicToBytes('palabra_inexistente_xyz otra');
    });

    assert.throws(() => {
      bytesToMnemonic(new Uint8Array([1, 2, 3])); // menos de 12 bytes
    });
  });

  it('genera y valida tokens de invitación a la comunidad (Invite-Only)', async () => {
    const adminKey = await generateIdentityKeyPair();
    const { publicSpki } = await exportKeyPair(adminKey);
    const adminFp = await getFingerprint(publicSpki);

    const token = await generateInviteToken(adminKey.privateKey, publicSpki, adminFp, 'alumno_test', 24);
    assert.ok(typeof token === 'string');

    const result = await verifyInviteToken(token);
    assert.equal(result.valid, true);
    assert.equal(result.payload.invitedLabel, 'alumno_test');
    assert.equal(result.payload.adminFingerprint, adminFp);
  });

  it('rechaza tokens de invitación que hayan expirado', async () => {
    const adminKey = await generateIdentityKeyPair();
    const { publicSpki } = await exportKeyPair(adminKey);
    const adminFp = await getFingerprint(publicSpki);

    // Token con expiración negativa (-1 hora)
    const token = await generateInviteToken(adminKey.privateKey, publicSpki, adminFp, 'alumno_expirado', -1);
    const result = await verifyInviteToken(token);
    assert.equal(result.valid, false);
    assert.match(result.reason, /expirado/i);
  });

  it('firma y valida acciones de moderación administrativa (KICK)', async () => {
    const adminKey = await generateIdentityKeyPair();
    const { publicSpki } = await exportKeyPair(adminKey);

    const { actionPayload, signature } = await signAdminModerationAction(
      adminKey.privateKey,
      'ADMIN_KICK',
      { targetPeerId: '8f3b2a9c', reason: 'Spam masivo' }
    );

    const isValid = await verifyPayload(publicSpki, actionPayload, signature);
    assert.equal(isValid, true);
  });

});
