// feedback.js - Fetch and display feedback for admin

document.addEventListener('DOMContentLoaded', async function() {
    const tbody = document.querySelector('#feedback-table tbody');

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function statusBadgeHtml(fb) {
        const isApproved = Number(fb.approved) === 1;
        if (isApproved) {
            return '<span class="homepage-status shown">Showing on Homepage</span>';
        }
        return '<span class="homepage-status hidden">Hidden from Homepage</span>';
    }

    function actionBtnHtml(fb) {
        const isApproved = Number(fb.approved) === 1;
        if (isApproved) {
            return `<button class="hide-feedback-btn" data-id="${fb.id}">Hide from Homepage</button>`;
        }
        return `<button class="approve-feedback-btn" data-id="${fb.id}">Show on Homepage</button>`;
    }

    // Function to refresh feedback from backend
    async function refreshFeedback() {
        try {
            const res = await fetch('/admin/feedback');
            if (!res.ok) throw new Error('Failed to fetch feedback');
            const feedbackList = await res.json();
            renderFeedbackRows(feedbackList);
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:#c00;text-align:center;">Failed to load feedback.</td></tr>';
        }
    }

    function renderFeedbackRows(feedbackList) {
        tbody.innerHTML = '';
        if (!feedbackList.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No feedback found.</td></tr>';
            return;
        }
        feedbackList.forEach(fb => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${fb.id}</td>
                <td>${escapeHtml(fb.user_email || '')}</td>
                <td>${escapeHtml(fb.feedback_text || '')}</td>
                <td>${new Date(fb.created_at).toLocaleString()}</td>
                <td>
                    ${statusBadgeHtml(fb)}
                    <div style="margin-top:6px;">${actionBtnHtml(fb)}</div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    try {
        const res = await fetch('/admin/feedback');
        if (!res.ok) throw new Error('Failed to fetch feedback');
        const feedbackList = await res.json();
        renderFeedbackRows(feedbackList);
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#c00;text-align:center;">Failed to load feedback.</td></tr>';
    }

    tbody.addEventListener('click', async function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        if (!id) return;
        try {
            if (btn.classList.contains('approve-feedback-btn')) {
                const approveRes = await fetch('/admin/feedback/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                if (!approveRes.ok) throw new Error('Failed to approve feedback');
            } else if (btn.classList.contains('hide-feedback-btn')) {
                const unapproveRes = await fetch('/admin/feedback/unapprove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                if (!unapproveRes.ok) throw new Error('Failed to hide feedback');
            } else {
                return;
            }
            await refreshFeedback();
        } catch (err) {
            alert('Failed to update feedback.');
        }
    });
});
