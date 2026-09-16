function api(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (S.token) {
    opts.headers['Authorization'] = 'Bearer ' + S.token;
  }

  var method = (opts.method || 'GET').toUpperCase();

  // Если оффлайн и запрос на изменение данных (POST/PUT/DELETE)
  if (!S.isOnline && method !== 'GET') {
    return handleOfflineMutation(url, method, opts);
  }

  // Если оффлайн и GET-запрос: читаем из IndexedDB кэша
  if (!S.isOnline && method === 'GET') {
    var cacheKey = url.replace(/^\//, '').split('?')[0];
    return idbGet(cacheKey).then(function(cached) {
      if (cached !== null && cached !== undefined) {
        return cached;
      }
      return { error: 'Offline', cached: false };
    });
  }

  if (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH') {
    if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
    }
  }

  return fetch('/api' + url, opts).then(function(r){ 
    if (r.status === 401 || r.status === 403) {
      localStorage.clear();
      location.reload();
      return new Promise(function(){});
    }

    if (!S.isOnline) {
      S.isOnline = true;
      updateNetworkStatusUI();
    }

    return r.json().then(function(data) {
      if (method === 'GET' && r.ok) {
        var cleanKey = url.replace(/^\//, '').split('?')[0];
        if (['tasks', 'stats', 'chains', 'import-info', 'marches', 'users', 'contractors'].indexOf(cleanKey) !== -1) {
          idbSet(cleanKey, data);
        }
      }
      return data;
    });
  }).catch(function(err) {
    console.warn("API Network Error:", url, err);
    S.isOnline = false;
    updateNetworkStatusUI();

    if (method !== 'GET') {
      return handleOfflineMutation(url, method, opts);
    } else {
      var cacheKey = url.replace(/^\//, '').split('?')[0];
      return idbGet(cacheKey).then(function(cached) {
        if (cached !== null && cached !== undefined) {
          return cached;
        }
        return { error: 'Network error' };
      });
    }
  });
}

function uploadAttachments(taskId, type, files, comment) {
  var fd = new FormData();
  for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
  fd.append('type', type);
  if (comment) fd.append('comment', comment);
  return fetch('/api/tasks/' + taskId + '/attachments', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + S.token }, // без Content-Type — браузер сам поставит multipart boundary
    body: fd
  }).then(function(r){ return r.json(); });
}

function loadAttachments(taskId) {
  return api('/tasks/' + taskId + '/attachments');
}

function deleteAttachment(attId) {
  return api('/attachments/' + attId, { method: 'DELETE' });
}


// ─── BOOT ─────────────────────────────────────────────────────────────────────