// ── CONFIGURATION ──
const FOLDERS = {
  'T': '1BG5QSIp3ezYg9XcwENCMosGIhsfuHqn3',
  'A': '1lc5QhadXCSjBgxfr2re0sReO-7_wfmi3',
  'S': '1qDDDuFXKEM2KHFo8qUSYI9U7bcqsEOBx',
  'C': '1e3yR12IolOuyZeF_KvHCIeC9ibtR7QiB',
  'R': '1pH_GiyBktRscz_xTtQ137a0V68kTEWky',
  'Z': '1lgqRt1M7cQmwbqTnarAZ6xuukUvYVvRt'
};

const TENANT_CONFIG = {
  'T': { logo: 'https://bop-t.vr2.in/T.png', color: '#075ba6' },
  'A': { logo: 'https://bop-a.vr2.in/A.png', color: '#0755a8' },
  'S': { logo: 'https://bop-a.vr2.in/S.png', color: '#4f8f64' },
  'C': { logo: 'https://bop-beta.vr2.in/C.png', color: '#7b3fa0' },
  'R': { logo: 'https://bop-beta.vr2.in/R.png', color: '#d4500a' },
  'Z': { logo: 'https://www.energy-stock.com/vr2.png', color: '#1a7a3a' }
};

function doGet(e) {
  try {
    const action = e.parameter.action || "list";

    // ACTION: FETCH FILE DATA
    if (action === "driveurl") {
      try {
        const file = DriveApp.getFileById(e.parameter.id);
        const mime = file.getMimeType();
        const name = file.getName();
        const oauthToken = ScriptApp.getOAuthToken();

        // ── Read size from the cached index JSON in root folder ──
        let fileSize = null;
        try {
          const tenantParam = (e.parameter.OpenCLOUD || "T").toUpperCase();
          const rootId = FOLDERS[tenantParam] || FOLDERS["T"];
          const rootFolder = DriveApp.getFolderById(rootId);
          const cacheIter = rootFolder.searchFiles(
            "title = 'OpenCLOUD_TREE_CACHE.json' and trashed = false"
          );
          if (cacheIter.hasNext()) {
            const cacheData = JSON.parse(cacheIter.next().getBlob().getDataAsString());
            // Walk the tree to find the file entry by ID
            function findFileSize(node, targetId) {
              for (const f of node.files) {
                if (f.id === targetId) return f.size; // already formatted e.g. "36.7 MB"
              }
              for (const folder of node.folders) {
                const found = findFileSize(folder, targetId);
                if (found) return found;
              }
              return null;
            }
            fileSize = findFileSize(cacheData.tree, e.parameter.id);
          }
        } catch (cacheErr) { /* size stays null, not critical */ }

        const nativeTypes = [
          "application/vnd.google-apps.spreadsheet",
          "application/vnd.google-apps.document",
          "application/vnd.google-apps.presentation"
        ];

        const driveUrl = nativeTypes.includes(mime)
          ? "https://www.googleapis.com/drive/v3/files/" + e.parameter.id
          + "/export?mimeType=application%2Fpdf"
          : "https://www.googleapis.com/drive/v3/files/" + e.parameter.id + "?alt=media";

        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          url: driveUrl,
          token: oauthToken,
          mime: nativeTypes.includes(mime) ? "application/pdf" : mime,
          name: name,
          size: fileSize   // "36.7 MB" or null
        })).setMimeType(ContentService.MimeType.JSON);

      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false, error: err.toString()
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ACTION: FULL RECURSIVE TREE (cached in Drive as a file)
    if (action === "tree") {
      let tenant = (e.parameter.OpenCLOUD || "T").toUpperCase();
      if (!FOLDERS[tenant]) tenant = "T";
      const rootId = FOLDERS[tenant];
      const fileName = "OpenCLOUD_TREE_CACHE.json";

      const rootFolder = DriveApp.getFolderById(rootId);
      const filesIter = rootFolder.searchFiles("title = '" + fileName + "' and trashed = false");
      let cacheFile = null;
      if (filesIter.hasNext()) {
        cacheFile = filesIter.next();
      }

      // If user specifically requested to rebuild, OR if no cache file exists:
      if (e.parameter.rebuild === "true" || !cacheFile) {
        const resultString = updateTenantCache(tenant);
        return ContentService.createTextOutput(resultString).setMimeType(ContentService.MimeType.JSON);
      }

      // Return existing file directly! (Extremely fast)
      return ContentService.createTextOutput(cacheFile.getBlob().getDataAsString()).setMimeType(ContentService.MimeType.JSON);
    }

    // ACTION: LIST DIRECTORY
    let tenant = (e.parameter.OpenCLOUD || "T").toUpperCase();
    if (!FOLDERS[tenant]) tenant = "T";
    const rootId = FOLDERS[tenant];
    const folderId = e.parameter.folderId || rootId;
    const currentFolder = DriveApp.getFolderById(folderId);

    const path = [];
    let temp = currentFolder;
    while (temp) {
      path.unshift({ id: temp.getId(), name: temp.getName() });
      if (temp.getId() === rootId) break;
      let parents = temp.getParents();
      temp = parents.hasNext() ? parents.next() : null;
    }

    const folders = [], files = [];
    const fIter = currentFolder.getFolders();
    const fiIter = currentFolder.getFiles();

    while (fIter.hasNext()) {
      let f = fIter.next();
      folders.push({ id: f.getId(), name: f.getName() });
    }

    while (fiIter.hasNext()) {
      let f = fiIter.next();
      files.push({
        id: f.getId(),
        name: f.getName(),
        size: formatSize(f.getSize()),
        mime: f.getMimeType() // Required for the dynamic icons
      });
    }

    const recursiveStats = getRecursiveStats(folderId);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      tenant: tenant,
      brand: TENANT_CONFIG[tenant],
      path: path,
      folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
      stats: {
        fCount: folders.length,
        fileCount: files.length,
        totalFolders: recursiveStats.totalFolders,
        totalFiles: recursiveStats.totalFiles
      }
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getRecursiveStats(folderId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "stats_" + folderId;
  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  let folderCount = 0;
  let fileCount = 0;

  function countRecursively(folder) {
    const folders = folder.getFolders();
    while (folders.hasNext()) {
      folderCount++;
      countRecursively(folders.next());
    }
    const files = folder.getFiles();
    while (files.hasNext()) {
      fileCount++;
      files.next();
    }
  }

  try {
    countRecursively(DriveApp.getFolderById(folderId));
    const stats = { totalFolders: folderCount, totalFiles: fileCount };
    cache.put(cacheKey, JSON.stringify(stats), 14400); // 4 hours
    return stats;
  } catch (e) {
    return { totalFolders: 0, totalFiles: 0 };
  }
}

function formatSize(b) {
  if (b === 0) return '0 B';
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

// ── CRON / BACKGROUND SYNC ──
function syncAllTenants() {
  for (const tenant in FOLDERS) {
    try {
      updateTenantCache(tenant);
      Logger.log("Synced " + tenant + " successfully.");
    } catch (e) {
      Logger.log("Error syncing " + tenant + ": " + e.toString());
    }
  }
}

function updateTenantCache(tenant) {
  const rootId = FOLDERS[tenant];
  const fileName = "OpenCLOUD_TREE_CACHE.json";
  const rootFolder = DriveApp.getFolderById(rootId);
  const filesIter = rootFolder.searchFiles("title = '" + fileName + "' and trashed = false");
  let cacheFile = null;
  if (filesIter.hasNext()) cacheFile = filesIter.next();

  function buildTree(folder) {
    const node = { id: folder.getId(), name: folder.getName(), folders: [], files: [] };
    const fIter = folder.getFolders();
    while (fIter.hasNext()) node.folders.push(buildTree(fIter.next()));
    node.folders.sort((a, b) => a.name.localeCompare(b.name));

    const fiIter = folder.getFiles();
    while (fiIter.hasNext()) {
      const f = fiIter.next();
      const fname = f.getName();
      if (fname === fileName) continue; // Exclude the cache file itself
      if (fname === 'password.json') {
        // This folder is password-protected
        try {
          const pwData = JSON.parse(f.getBlob().getDataAsString());
          node.protected = true;
          node.password = pwData.password || pwData.pasword || '';
        } catch(e) {
          node.protected = true;
          node.password = '';
        }
        continue; // Don't include password.json in the file listing
      }
      node.files.push({ id: f.getId(), name: fname, size: formatSize(f.getSize()), mime: f.getMimeType() });
    }
    node.files.sort((a, b) => a.name.localeCompare(b.name));
    return node;
  }

  const tree = buildTree(rootFolder);
  const resultString = JSON.stringify({
    success: true,
    tenant: tenant,
    brand: TENANT_CONFIG[tenant],
    tree: tree,
    timestamp: Date.now()
  });

  if (cacheFile) {
    cacheFile.setContent(resultString);
  } else {
    rootFolder.createFile(fileName, resultString, "application/json");
  }
  return resultString;
}