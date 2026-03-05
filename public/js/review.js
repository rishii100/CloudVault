// Review page logic
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

  // Set user email
  document.getElementById('user-email').textContent = localStorage.getItem('email') || '';

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    window.location.href = '/';
  });

  // Get session ID from URL
  const pathParts = window.location.pathname.split('/');
  const sessionId = pathParts[pathParts.length - 1];

  if (!sessionId || sessionId === 'review') {
    window.location.href = '/dashboard';
    return;
  }

  // ============ TOAST ============
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ============ LOAD SESSION ============
  async function loadSession() {
    try {
      const res = await fetch(`/api/generate/session/${sessionId}`, { headers });
      if (!res.ok) throw new Error('Session not found');
      const session = await res.json();

      // Update header
      document.getElementById('review-title').textContent = `Review: ${session.questionnaire_filename}`;
      document.getElementById('review-subtitle').textContent = `${session.version_label || 'v1'} • Status: ${session.status} • ${formatDate(session.created_at)}`;

      renderAnswers(session.answers);
    } catch (err) {
      document.getElementById('qa-list').innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">❌</span>
          <p>${err.message}</p>
        </div>
      `;
    }
  }

  function renderAnswers(answers) {
    const qaList = document.getElementById('qa-list');

    // Calculate stats
    const total = answers.length;
    const notFound = answers.filter(a => a.answer && a.answer.toLowerCase().includes('not found in references')).length;
    const answered = total - notFound;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-answered').textContent = answered;
    document.getElementById('stat-notfound').textContent = notFound;

    if (answers.length === 0 || !answers[0].answer) {
      qaList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⏳</span>
          <p>Answers have not been generated yet. Go back to the dashboard to generate.</p>
        </div>
      `;
      return;
    }

    qaList.innerHTML = answers.map((a, i) => {
      const isNotFound = a.answer && a.answer.toLowerCase().includes('not found in references');
      const confLevel = a.confidence >= 0.7 ? 'high' : a.confidence >= 0.4 ? 'medium' : 'low';
      const confLabel = a.confidence >= 0.7 ? 'High' : a.confidence >= 0.4 ? 'Medium' : 'Low';
      const confPercent = Math.round((a.confidence || 0) * 100);
      const citations = a.citations || [];

      return `
        <div class="qa-card" id="qa-${a.id}">
          <div class="qa-question">
            <div class="qa-number">${a.question_index + 1}</div>
            <div class="qa-question-text">${escapeHtml(a.question)}</div>
          </div>

          <div class="qa-answer ${isNotFound ? 'not-found' : ''}" id="answer-display-${a.id}">
            <div class="qa-answer-text">${escapeHtml(a.answer)}</div>
          </div>

          <div class="qa-edit-area" id="edit-area-${a.id}">
            <textarea id="edit-text-${a.id}">${escapeHtml(a.answer)}</textarea>
            <div class="qa-edit-actions">
              <button class="btn btn-success btn-sm" onclick="saveEdit(${a.id})">Save</button>
              <button class="btn btn-secondary btn-sm" onclick="cancelEdit(${a.id})">Cancel</button>
            </div>
          </div>

          <div class="confidence-badge ${confLevel}">
            ${confLevel === 'high' ? '🟢' : confLevel === 'medium' ? '🟡' : '🔴'} 
            Confidence: ${confLabel} (${confPercent}%)
          </div>

          ${citations.length > 0 ? `
            <div class="qa-citations">
              <div class="qa-citations-label">Citations</div>
              ${citations.map(c => `
                <div class="citation-item">
                  <span class="citation-doc">📄 ${escapeHtml(c.document)}</span>
                  <span class="citation-excerpt">"${escapeHtml(c.excerpt)}"</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div class="qa-meta">
            <button class="btn btn-secondary btn-sm" onclick="startEdit(${a.id})">✏️ Edit</button>
            ${a.edited ? '<span class="edited-badge">✏️ Manually edited</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ============ EDIT FUNCTIONS ============
  window.startEdit = function (id) {
    document.getElementById(`answer-display-${id}`).style.display = 'none';
    document.getElementById(`edit-area-${id}`).style.display = 'block';
    document.getElementById(`edit-text-${id}`).focus();
  };

  window.cancelEdit = function (id) {
    document.getElementById(`answer-display-${id}`).style.display = 'block';
    document.getElementById(`edit-area-${id}`).style.display = 'none';
  };

  window.saveEdit = async function (id) {
    const newAnswer = document.getElementById(`edit-text-${id}`).value;
    try {
      const res = await fetch(`/api/generate/answer/${id}`, {
        method: 'PUT',
        headers: headersJson,
        body: JSON.stringify({ answer: newAnswer }),
      });
      if (!res.ok) throw new Error('Failed to save');

      // Update display
      const display = document.getElementById(`answer-display-${id}`);
      display.querySelector('.qa-answer-text').textContent = newAnswer;
      display.style.display = 'block';
      document.getElementById(`edit-area-${id}`).style.display = 'none';

      // Update not-found styling
      if (newAnswer.toLowerCase().includes('not found in references')) {
        display.classList.add('not-found');
      } else {
        display.classList.remove('not-found');
      }

      showToast('Answer updated successfully', 'success');
      // Reload to update stats
      loadSession();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ============ EXPORT ============
  document.getElementById('btn-export').addEventListener('click', async () => {
    const btn = document.getElementById('btn-export');
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    try {
      showToast('Generating document...', 'info');

      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/api/export/${sessionId}`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.responseType = 'blob';

      xhr.onload = function () {
        if (xhr.status === 200) {
          const blob = xhr.response;
          const url = window.URL.createObjectURL(blob);

          // Get filename from Content-Disposition header or use default
          let filename = 'questionnaire-responses.docx';
          const disposition = xhr.getResponseHeader('Content-Disposition');
          if (disposition && disposition.indexOf('filename=') !== -1) {
            const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match && match[1]) {
              filename = match[1].replace(/['"]/g, '');
            }
          }

          const link = document.createElement('a');
          link.style.display = 'none';
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();

          // Clean up after a delay
          setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
          }, 1000);

          showToast('Document exported successfully!', 'success');
        } else {
          showToast('Export failed: Server returned ' + xhr.status, 'error');
        }
        btn.disabled = false;
        btn.textContent = '📥 Export DOCX';
      };

      xhr.onerror = function () {
        showToast('Export failed: Network error', 'error');
        btn.disabled = false;
        btn.textContent = '📥 Export DOCX';
      };

      xhr.send();
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = '📥 Export DOCX';
    }
  });

  // ============ HELPERS ============
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    // SQLite stores UTC but without 'Z', so append it to ensure correct local conversion
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  }

  // ============ INIT ============
  loadSession();
})();
