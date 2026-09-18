/** Form Attachments v1. Drive manifests are authoritative; never writes a Sheet.
 * Binary I/O runs outside ScriptLock. A per-package lease serializes retries;
 * its 10-minute lifetime exceeds GAS's 6-minute execution limit. Only metadata
 * folder creation and final version CAS + rename use the global lock.
 */
var ATT_CHUNK_SIZE = 2 * 1024 * 1024;
var ATT_ID_RE = /^ATT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var ATT_MIMES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12'
};

function attAssert(ok, message) {
  if (!ok) throw createApiError('VALIDATION_ERROR', message || '附件資料格式不正確');
}
function attLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function attIdentity(p, write) {
  attAssert(p && typeof p.formId === 'string' && /^FRM-\d{4}-[\w-]+$/.test(p.formId), '表單編號不正確');
  attAssert(!p.fileId, '不接受 Drive fileId');
  if (write || p.attachmentId !== undefined) attAssert(ATT_ID_RE.test(p.attachmentId || ''), '附件編號不正確');
  var version = write ? p.expectedVersion : p.version;
  attAssert(typeof version === 'number' && Number.isInteger(version) && version > 0, '缺少有效表單版本');
  return handleGetForm({ formId: p.formId });
}
function attVersion(record, p) {
  if (Number(record.version || 1) !== p.expectedVersion) {
    throw createApiError('VERSION_CONFLICT', '表單版本已更新，請重新載入最新版後重新加入附件。');
  }
}
function attRoot(record, create) {
  var folder = DriveApp.getFolderById(getDriveRootFolderId());
  var path = ['表單歸檔', record.formId.match(/^FRM-(\d{4})-/)[1],
    record.formType === 'payment_request' ? '請款單' : '用印簽呈', record.formId, 'attachments'];
  for (var i = 0; i < path.length; i++) {
    folder = create ? getOrCreateChildFolder(folder, path[i]) : findChildFolderByName(folder, path[i]);
    if (!folder) return null;
  }
  return folder;
}
function attFile(folder, name) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return null;
}
function attRead(folder, name) {
  var f = attFile(folder, name);
  if (!f) throw createApiError('NOT_FOUND', '附件尚未完成，請重試');
  return JSON.parse(f.getBlob().getDataAsString('UTF-8'));
}
function attJson(folder, name, value) {
  // Immutable intent/manifest; write-once permits recovery after a lost response.
  if (!attFile(folder, name)) folder.createFile(Utilities.newBlob(JSON.stringify(value), 'application/json', name));
}
function attHash(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}
function attFingerprint(intent) { return attHash(Utilities.newBlob(JSON.stringify(intent)).getBytes()); }
function attValidateBinary(bytes, mime) {
  var b = bytes.slice(0, 16).map(function (n) { return (n + 256) % 256; });
  function starts(prefix) { return prefix.every(function (n, i) { return b[i] === n; }); }
  var valid = mime === 'application/pdf' ? starts([37, 80, 68, 70, 45]) :
    mime === 'image/jpeg' ? starts([255, 216, 255]) :
    mime === 'image/png' ? starts([137, 80, 78, 71, 13, 10, 26, 10]) :
    mime === 'image/webp' ? starts([82, 73, 70, 70]) && b.slice(8, 12).join(',') === '87,69,66,80' :
    mime === 'application/msword' || mime === 'application/vnd.ms-excel' ? starts([208, 207, 17, 224, 161, 177, 26, 225]) :
    starts([80, 75, 3, 4]); // OOXML is a ZIP container, unlike user-uploaded .zip files.
  attAssert(valid, '附件內容與副檔名不符');
}
function attText(value, max) { return typeof value === 'string' && value.length <= max; }
function attValidateIntent(p) {
  attAssert(p.type === 'general' || p.type === 'construction');
  attAssert(attText(p.displayName, 180) && p.displayName.length > 0 && !/[\\/\x00-\x1f]/.test(p.displayName));
  attAssert(Array.isArray(p.files) && p.files.length >= 1 && p.files.length <= 31);
  var files = p.files.map(function (f, i) {
    attAssert(f && attText(f.fileName, 180) && f.fileName.length > 0 && !/[\\/\x00-\x1f]/.test(f.fileName));
    var ext = f.fileName.split('.').pop().toLowerCase();
    attAssert(Object.prototype.hasOwnProperty.call(ATT_MIMES, ext) && ATT_MIMES[ext] === f.mimeType, '不支援的附件格式');
    attAssert(f.key === (i === 0 ? 'primary' : 'photo-' + i));
    var limit = p.type === 'general' ? 10 * 1024 * 1024 : i === 0 ? 40 * 1024 * 1024 : 1.2 * 1024 * 1024;
    attAssert(Number.isInteger(f.size) && f.size > 0 && f.size <= limit, '附件超過大小限制');
    attAssert(typeof f.sha256 === 'string' && /^[a-f0-9]{64}$/.test(f.sha256));
    if (p.type === 'construction') {
      attAssert(i === 0 ? f.mimeType === 'application/pdf' : f.mimeType === 'image/jpeg');
      if (i > 0) attAssert(f.fileName === ('00' + i).slice(-3) + '.jpg');
    }
    return { key: f.key, fileName: f.fileName, mimeType: f.mimeType, size: f.size, sha256: f.sha256 };
  });
  attAssert(files[0].fileName === p.displayName);
  var metadata = null;
  if (p.type === 'general') attAssert(files.length === 1 && p.metadata == null);
  else {
    var m = p.metadata;
    attAssert(m && attText(m.projectName, 100) && attText(m.location, 100) && attText(m.workDescription, 300));
    attAssert(typeof m.constructionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.constructionDate));
    attAssert(m.photoCount >= 1 && m.photoCount <= 30 && m.photoCount === files.length - 1);
    attAssert(Array.isArray(m.photos) && m.photos.length === m.photoCount);
    metadata = { projectName: m.projectName, constructionDate: m.constructionDate, location: m.location,
      workDescription: m.workDescription, photoCount: m.photoCount, photos: m.photos.map(function (photo, i) {
        attAssert(photo.sequence === i + 1 && photo.archivedFileName === files[i + 1].fileName);
        attAssert(attText(photo.description, 120) && ['landscape', 'portrait', 'square'].indexOf(photo.orientation) !== -1);
        attAssert([0, 90, 180, 270].indexOf(photo.rotation) !== -1);
        return { sequence: i + 1, description: photo.description, orientation: photo.orientation,
          rotation: photo.rotation, archivedFileName: photo.archivedFileName };
      }) };
  }
  return { attachmentId: p.attachmentId, type: p.type, displayName: p.displayName,
    addedVersion: p.expectedVersion, files: files, metadata: metadata };
}

function attMutation(p, fn) {
  var record = attIdentity(p, true);
  var key = 'ATT_LEASE_' + p.formId + '_' + p.attachmentId;
  var token = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  attLock(function () {
    var current = JSON.parse(props.getProperty(key) || 'null');
    if (current && current.expires > Date.now()) throw createApiError('UPLOAD_BUSY', '此附件正在上傳，請稍後重試。');
    props.setProperty(key, JSON.stringify({ token: token, expires: Date.now() + 600000 }));
  });
  var root;
  try {
    root = attRoot(record, false);
    attVersion(handleGetForm({ formId: p.formId }), p);
    return fn(record, root);
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT' && root) {
      var pending = findChildFolderByName(root, '.pending-' + p.attachmentId);
      if (pending) pending.setTrashed(true);
    }
    throw err;
  } finally {
    attLock(function () {
      var current = JSON.parse(props.getProperty(key) || 'null');
      if (current && current.token === token) props.deleteProperty(key);
    });
  }
}
function attPending(root, p) {
  var pending = root && findChildFolderByName(root, '.pending-' + p.attachmentId);
  if (!pending) throw createApiError('NOT_FOUND', '找不到待上傳附件，請重新開始上傳');
  var intent = attRead(pending, 'upload.json');
  attAssert(intent.addedVersion === p.expectedVersion, '附件版本與上傳內容不同');
  return { folder: pending, intent: intent };
}
function attPublished(root, p) {
  return root && findChildFolderByName(root, p.attachmentId);
}
function attFileTarget(folder, intent, descriptor) {
  if (descriptor.key === 'primary') return { folder: folder, name: intent.type === 'general' ? 'file' : descriptor.fileName };
  var photos = findChildFolderByName(folder, 'photos');
  return { folder: photos, name: descriptor.fileName };
}
function attDescriptor(intent, key) {
  var d = intent.files.filter(function (f) { return f.key === key; })[0];
  attAssert(d, '附件檔案編號不正確'); return d;
}

function handleBeginFormAttachmentUpload(p) {
  var intent = attValidateIntent(p);
  return attMutation(p, function (record, root) {
    var published = attPublished(root, p);
    if (published) {
      attAssert(attRead(published, 'manifest.json').uploadFingerprint === attFingerprint(intent), '附件編號已使用於其他內容');
      return { published: true };
    }
    // Only resolve/create directories under this short lock, never binary I/O.
    var pending = attLock(function () {
      root = attRoot(record, true);
      return getOrCreateChildFolder(root, '.pending-' + p.attachmentId);
    });
    if (attFile(pending, 'upload.json')) attAssert(JSON.stringify(attRead(pending, 'upload.json')) === JSON.stringify(intent), '附件編號已使用於其他內容');
    else attJson(pending, 'upload.json', intent);
    return { published: false, chunkSize: ATT_CHUNK_SIZE };
  });
}

function handleUploadFormAttachmentChunk(p) {
  attAssert(typeof p.base64 === 'string' && p.base64.length <= Math.ceil(ATT_CHUNK_SIZE / 3) * 4 &&
    p.base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(p.base64), '附件分塊過大或格式錯誤');
  var bytes = Utilities.base64Decode(p.base64);
  return attMutation(p, function (_, root) {
    if (attPublished(root, p)) return { published: true };
    var pending = attPending(root, p), d = attDescriptor(pending.intent, p.fileKey);
    var count = Math.ceil(d.size / ATT_CHUNK_SIZE);
    attAssert(Number.isInteger(p.index) && p.index >= 0 && p.index < count);
    attAssert(bytes.length === Math.min(ATT_CHUNK_SIZE, d.size - p.index * ATT_CHUNK_SIZE), '附件分塊長度不正確');
    var target = attFileTarget(pending.folder, pending.intent, d);
    if (target.folder && attFile(target.folder, target.name)) return { complete: true };
    var chunks = getOrCreateChildFolder(pending.folder, '.chunks');
    var name = d.key + '-' + p.index;
    var existing = attFile(chunks, name);
    if (existing) attAssert(attHash(existing.getBlob().getBytes()) === attHash(bytes), '重試分塊內容不同');
    else chunks.createFile(Utilities.newBlob(bytes, 'application/octet-stream', name));
    return { index: p.index };
  });
}

function handleFinalizeFormAttachmentFile(p) {
  return attMutation(p, function (_, root) {
    if (attPublished(root, p)) return { published: true };
    var pending = attPending(root, p), d = attDescriptor(pending.intent, p.fileKey);
    if (d.key !== 'primary') getOrCreateChildFolder(pending.folder, 'photos');
    var target = attFileTarget(pending.folder, pending.intent, d);
    if (attFile(target.folder, target.name)) return { complete: true };
    var chunks = findChildFolderByName(pending.folder, '.chunks');
    if (!chunks) throw createApiError('NOT_FOUND', '附件分塊未完成');
    var bytes = [];
    for (var index = 0; index < Math.ceil(d.size / ATT_CHUNK_SIZE); index++) {
      var chunk = attFile(chunks, d.key + '-' + index);
      if (!chunk) throw createApiError('NOT_FOUND', '附件分塊未完成');
      var part = chunk.getBlob().getBytes();
      attAssert(part.length === Math.min(ATT_CHUNK_SIZE, d.size - index * ATT_CHUNK_SIZE));
      bytes = bytes.concat(part);
    }
    attAssert(bytes.length === d.size && attHash(bytes) === d.sha256, '附件完整性驗證失敗');
    attValidateBinary(bytes, d.mimeType);
    target.folder.createFile(Utilities.newBlob(bytes, d.mimeType, target.name));
    return { complete: true };
  });
}

function handleFinalizeFormAttachment(p) {
  return attMutation(p, function (_, root) {
    var published = attPublished(root, p);
    if (published) return attRead(published, 'manifest.json');
    var pending = attPending(root, p), intent = pending.intent;
    intent.files.forEach(function (d) {
      var target = attFileTarget(pending.folder, intent, d);
      var file = target.folder && attFile(target.folder, target.name);
      attAssert(file && file.getSize() === d.size, '附件檔案尚未完成');
    });
    var manifest = { attachmentId: p.attachmentId, type: intent.type, displayName: intent.displayName,
      addedVersion: intent.addedVersion, createdAt: new Date().toISOString(), primaryFile: intent.files[0], metadata: intent.metadata,
      uploadFingerprint: attFingerprint(intent) };
    attJson(pending.folder, 'manifest.json', manifest);
    // Discard upload chunks before publishing; never duplicate binaries per vN.
    var chunks = findChildFolderByName(pending.folder, '.chunks');
    if (chunks) chunks.setTrashed(true);
    var result = attLock(function () {
      attVersion(handleGetForm({ formId: p.formId }), p);
      pending.folder.setName(p.attachmentId); // sole publish point after authoritative CAS
      return attRead(pending.folder, 'manifest.json');
    });
    try { attFile(pending.folder, 'upload.json').setTrashed(true); } catch (cleanupError) { /* published manifest remains authoritative */ }
    return result;
  });
}

function handleListFormAttachments(p) {
  var record = attIdentity(p, false);
  attAssert(p.version <= Number(record.version || 1), '表單版本不存在');
  var root = attRoot(record, false), result = [];
  if (!root) return result;
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    if (folder.isTrashed() || !ATT_ID_RE.test(folder.getName())) continue;
    var m = attRead(folder, 'manifest.json');
    if (m.attachmentId === folder.getName() && m.addedVersion <= p.version) result.push(m);
  }
  return result.sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); });
}
function attDownload(p) {
  var record = attIdentity(p, false);
  attAssert(ATT_ID_RE.test(p.attachmentId || ''));
  attAssert(p.version <= Number(record.version || 1), '表單版本不存在');
  var folder = attPublished(attRoot(record, false), p);
  if (!folder) throw createApiError('NOT_FOUND', '找不到已歸檔附件');
  var m = attRead(folder, 'manifest.json');
  if (m.attachmentId !== p.attachmentId || m.addedVersion > p.version) throw createApiError('NOT_FOUND', '此版本沒有該附件');
  var file = attFile(folder, m.type === 'general' ? 'file' : m.primaryFile.fileName);
  if (!file) throw createApiError('NOT_FOUND', '找不到附件檔案');
  return { info: m.primaryFile, file: file };
}
function handleGetFormAttachmentFileInfo(p) {
  var d = attDownload(p), info = d.info;
  info.chunkCount = Math.ceil(info.size / ATT_CHUNK_SIZE);
  return info;
}
function handleGetFormAttachmentFileChunk(p) {
  var d = attDownload(p);
  attAssert(Number.isInteger(p.index) && p.index >= 0 && p.index < Math.ceil(d.info.size / ATT_CHUNK_SIZE));
  // DriveApp has no byte-range read; bound stored files, return only one chunk.
  var bytes = d.file.getBlob().getBytes().slice(p.index * ATT_CHUNK_SIZE, (p.index + 1) * ATT_CHUNK_SIZE);
  return { index: p.index, base64: Utilities.base64Encode(bytes) };
}
