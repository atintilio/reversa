'use strict';

// Adaptador agnóstico de Google Drive. OAuth e chamadas HTTP ficam no conector.
// O Reversa só pede arquivos selecionados e valida a resposta recebida.
function need(v, msg) { if (!v) throw new Error(msg); }

function selecionar(source, fileIds) {
  need(source && source.provider === 'google_drive', 'DRIVE_SOURCE_REQUIRED');
  const ids = [...new Set((Array.isArray(fileIds) ? fileIds : []).map(String).filter(Boolean))];
  need(ids.length > 0, 'DRIVE_FILE_SELECTION_REQUIRED');
  return { sourceId: source.id, folderId: source.rootFolderId, fileIds: ids, mode: 'selected' };
}

function validarArquivo(source, file) {
  need(source && source.provider === 'google_drive', 'DRIVE_SOURCE_REQUIRED');
  need(file && file.id && file.name, 'DRIVE_FILE_METADATA_REQUIRED');
  if (file.parents && !file.parents.includes(source.rootFolderId)) throw new Error('DRIVE_FILE_OUTSIDE_LINKED_FOLDER');
  return { providerFileId: String(file.id), name: String(file.name), mimeType: file.mimeType || null, etag: file.etag || file.version || null, byteSize: Number.isFinite(Number(file.size)) ? Number(file.size) : null };
}

module.exports = { selecionar, validarArquivo };
