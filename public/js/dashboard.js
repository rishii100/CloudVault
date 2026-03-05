// Dashboard page logic
(function () {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
    };

    const headersJson = {
        ...headers,
        'Content-Type': 'application/json',
    };

    // Set user email in navbar
    document.getElementById('user-email').textContent = localStorage.getItem('email') || '';

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('email');
        window.location.href = '/';
    });

    let currentSessionId = null;

    // ============ TOAST ============
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.classList.add('toast', type);
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ============ LOADING ============
    function showLoading(text = 'Processing...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading').classList.add('active');
    }

    function hideLoading() {
        document.getElementById('loading').classList.remove('active');
    }

    // ============ QUESTIONNAIRE UPLOAD ============
    const questionnaireInput = document.getElementById('questionnaire-input');
    const questionnaireZone = document.getElementById('questionnaire-zone');
    const questionnaireStatus = document.getElementById('questionnaire-status');

    // Drag & drop
    questionnaireZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        questionnaireZone.classList.add('dragover');
    });
    questionnaireZone.addEventListener('dragleave', () => {
        questionnaireZone.classList.remove('dragover');
    });
    questionnaireZone.addEventListener('drop', (e) => {
        e.preventDefault();
        questionnaireZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            loadFileIntoTextarea(e.dataTransfer.files[0]);
        }
    });

    questionnaireInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            loadFileIntoTextarea(e.target.files[0]);
        }
    });

    // Read the uploaded file and load content into the paste textarea for editing
    function loadFileIntoTextarea(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            document.getElementById('questionnaire-text').value = content;
            // Switch to paste tab so user can review/edit
            window.switchQTab('paste');
            showToast(`"${file.name}" loaded — review and edit, then click Submit`, 'success');
            questionnaireStatus.innerHTML = `
                <span style="color: var(--accent);">📄</span> 
                <strong>${file.name}</strong> loaded into editor — edit as needed, then submit.
            `;
        };
        reader.onerror = function () {
            showToast('Failed to read file', 'error');
        };
        reader.readAsText(file);
        questionnaireInput.value = '';
    }

    // ============ QUESTIONNAIRE TABS ============
    window.switchQTab = function (tab) {
        document.getElementById('q-tab-upload').classList.toggle('active', tab === 'upload');
        document.getElementById('q-tab-paste').classList.toggle('active', tab === 'paste');
        document.getElementById('q-panel-upload').style.display = tab === 'upload' ? 'block' : 'none';
        document.getElementById('q-panel-paste').style.display = tab === 'paste' ? 'block' : 'none';
    };

    // Submit pasted text questions
    document.getElementById('btn-submit-text').addEventListener('click', async () => {
        const title = document.getElementById('questionnaire-title').value.trim();
        if (!title) {
            showToast('Please enter an assignment title', 'error');
            document.getElementById('questionnaire-title').focus();
            return;
        }

        const text = document.getElementById('questionnaire-text').value.trim();
        if (!text) {
            showToast('Please enter at least one question', 'error');
            return;
        }

        showLoading('Parsing questions...');
        try {
            const res = await fetch('/api/upload/questionnaire-text', {
                method: 'POST',
                headers: headersJson,
                body: JSON.stringify({ text, title: document.getElementById('questionnaire-title').value.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            currentSessionId = data.sessionId;
            const displayName = document.getElementById('questionnaire-title').value.trim() || 'Pasted Questions';
            questionnaireStatus.innerHTML = `
                <span style="color: var(--success);">✓</span> 
                <strong>${displayName}</strong> — ${data.questionCount} questions parsed 
                <span class="status-badge pending" style="margin-left: 8px;">${data.version}</span>
            `;

            document.getElementById('generate-section').style.display = 'block';
            showToast(`${data.questionCount} questions parsed successfully`, 'success');
            loadSessions();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    });

    // ============ REFERENCE DOCS ============
    const referenceInput = document.getElementById('reference-input');
    const referenceZone = document.getElementById('reference-zone');

    referenceZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        referenceZone.classList.add('dragover');
    });
    referenceZone.addEventListener('dragleave', () => {
        referenceZone.classList.remove('dragover');
    });
    referenceZone.addEventListener('drop', (e) => {
        e.preventDefault();
        referenceZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            uploadReference(e.dataTransfer.files[0]);
        }
    });

    referenceInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            uploadReference(e.target.files[0]);
        }
    });

    async function uploadReference(file) {
        showLoading('Processing reference document...');
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload/reference', {
                method: 'POST',
                headers,
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            showToast(`Reference uploaded: ${file.name}`, 'success');
            loadReferenceDocs();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
            referenceInput.value = '';
        }
    }

    async function loadReferenceDocs() {
        try {
            const res = await fetch('/api/upload/references', { headers });
            const docs = await res.json();
            const list = document.getElementById('doc-list');

            if (docs.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: 16px;"><p style="font-size: 12px;">No reference documents yet</p></div>';
                return;
            }

            list.innerHTML = docs.map(doc => `
        <li class="doc-item">
          <div>
            <div class="doc-name">${doc.filename}${doc.is_default ? ' <span style="font-size:10px;color:var(--accent);font-weight:600;margin-left:6px;">BUILT-IN</span>' : ''}</div>
            <div class="doc-meta">${formatBytes(doc.content_length)} • ${formatDate(doc.uploaded_at)}</div>
          </div>
          ${doc.is_default ? '' : `<button class="btn-icon" onclick="deleteReference(${doc.id})" title="Delete">✕</button>`}
        </li>
      `).join('');

            // Show generate button if we have a session
            if (currentSessionId) {
                document.getElementById('generate-section').style.display = 'block';
            }
        } catch (err) {
            console.error('Failed to load reference docs:', err);
        }
    }

    // Make delete function global
    window.deleteReference = async function (id) {
        try {
            const res = await fetch(`/api/upload/reference/${id}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) throw new Error('Failed to delete');
            showToast('Reference document deleted', 'info');
            loadReferenceDocs();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // ============ SEED SAMPLE DOCS ============
    document.getElementById('btn-seed-docs').addEventListener('click', async () => {
        const btn = document.getElementById('btn-seed-docs');
        btn.disabled = true;
        btn.textContent = '⏳ Loading...';
        showLoading('Loading sample reference documents...');

        try {
            const res = await fetch('/api/upload/seed-references', {
                method: 'POST',
                headers,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            showToast(data.message, 'success');
            loadReferenceDocs();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '📦 Load Sample Docs';
            hideLoading();
        }
    });

    // ============ GENERATE ANSWERS ============
    document.getElementById('btn-generate').addEventListener('click', async () => {
        if (!currentSessionId) {
            showToast('Upload a questionnaire first', 'error');
            return;
        }

        const btn = document.getElementById('btn-generate');
        btn.disabled = true;
        showLoading('Generating answers with AI... This may take a moment.');

        try {
            const res = await fetch(`/api/generate/${currentSessionId}`, {
                method: 'POST',
                headers,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            showToast('Answers generated successfully!', 'success');
            // Redirect to review page
            window.location.href = `/review/${currentSessionId}`;
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            hideLoading();
        }
    });

    // ============ SESSIONS / VERSION HISTORY ============
    async function loadSessions() {
        try {
            const res = await fetch('/api/generate/sessions', { headers });
            const sessions = await res.json();
            const list = document.getElementById('session-list');

            if (sessions.length === 0) {
                list.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📝</span>
            <p>No sessions yet. Upload a questionnaire to get started.</p>
          </div>
        `;
                return;
            }

            list.innerHTML = sessions.map(s => `
        <div class="session-card" onclick="window.location.href='/review/${s.id}'">
          <div class="session-info">
            <div class="session-name">
              📋 ${s.questionnaire_filename}
              <span class="status-badge ${s.status}">${s.status}</span>
            </div>
            <div class="session-meta">
              ${s.version_label || 'v1'} • ${formatDate(s.created_at)}
            </div>
          </div>
          <div class="session-stats">
            <span class="stat-badge total">${s.total_questions} Q</span>
            <span class="stat-badge answered">${s.answered || 0} ✓</span>
            <span class="stat-badge not-found">${s.not_found || 0} ✗</span>
          </div>
        </div>
      `).join('');
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    }

    // ============ HELPERS ============
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        // SQLite stores UTC but without 'Z', so append it to ensure correct local conversion
        const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
        return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    }

    // ============ INIT ============
    loadReferenceDocs();
    loadSessions();
})();
