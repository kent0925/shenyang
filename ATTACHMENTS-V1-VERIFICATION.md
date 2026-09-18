# Form Attachments v1 local verification

Base: 03766012c289d0aa43f3bc910aa876c2a7b347d3
Branch: feature/form-attachments-v1

Passed:

- `node gas/test/test-form-attachments.js`: 9 backend groups. Includes >4.5 MB chunk upload, repeated chunks/finalization, byte-exact download, SHA-256, file format/size validation, executable rejection, immutable retry identity, lease contention, hidden pending folders, final authoritative CAS conflict cleanup, inherited version filtering, safe download resolution, one logical construction package and unchanged formal file references. The harness creates no spreadsheet and never invokes initializeSystem.
- `node scripts/test-attachment-browser.js`: Chrome local synthetic images and mock API. Mixed landscape/portrait, orientation from displayed dimensions, 1800px compression, manual 90-degree rotation, descriptions following reorder, six photos/one page and seven photos/two pages, actual PDF page count, contain geometry, exact processed JPEG archive blobs, no original files in package, conflict retry without saveForm and shared builder rendering.
- `node scripts/test-attachment-heic.js`: official libheif example HEIC, imported as .heic and .heif, both converted locally to JPEG (1280x854, 329959 bytes). Fixture: https://raw.githubusercontent.com/strukturag/libheif/master/examples/example.heic . Download to `tmp/attachments/example.heic` before running this optional format check.
- `npm run typecheck`: PASS.
- `npm run typecheck:api`: PASS.
- `npm run build`: PASS after rerunning only build outside sandbox, because initial esbuild invocation was denied filesystem access. Vite reports bundle size warnings; HEIC decoder and attachment PDF library are dynamically imported.

Code review A-J: chunk index files are write-once and identical retry bytes are checked; final CAS rereads FormRecord inside short ScriptLock immediately before package rename; binary upload/assembly runs outside lock; only ATT-UUID folders are listed; downloads resolve form/attachment/version and reject fileId; addedVersion <= requestedVersion applies to lists and downloads; v3 cannot appear in v1/v2; retry retains original version and processed blobs, never calls saveForm/formal generators/archive; contain preserves full image; PDF and archive use the same JPEG bytes in array order with matching rotation and description metadata.

Scope boundaries: no Google Sheet/FormRecord schema, official templates, formal PDF generators/layouts, budget/vendor/cheque logic or existing backend save semantics were changed. ActionBar markup/design unchanged. No old acceptance suite, production request, initializeSystem, PR, merge, deployment or GAS version creation was run.

Local verification uses mocked Drive and local Chrome, not live GAS/Drive. Automatic orientation relies on browser EXIF decoding and libheif HEIF transforms; the targeted synthetic portrait/landscape check is not a comprehensive device/EXIF fixture matrix. Desktop drag and mobile up/down share identity-preserving reorder; the local automated check exercises reorder rather than physical touch gestures. PDF layout uses fixed A4 2x3 geometry and page count/contain checks; this run did not perform a separate rendered-PDF visual inspection.

DriveApp lacks byte-range reads: each download request reads the bounded stored file in GAS and returns only its requested 2 MB slice. Published packages contain manifest plus primary file and compressed photos, with upload chunks trashed. No physical deletion API exists for published attachments.
