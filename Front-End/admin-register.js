document.addEventListener('DOMContentLoaded', function () {
    const createAdminForm = document.getElementById('createAdminForm');
    const statusEl = document.getElementById('createAdminStatus');
    const refreshBtn = document.getElementById('refreshAdminsBtn');
    const adminsTableBody = document.querySelector('#adminsTable tbody');

    function setStatus(message, type) {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.className = 'status';
        if (type) statusEl.classList.add(type);
    }

    async function loadAdmins() {
        if (!adminsTableBody) return;
        adminsTableBody.innerHTML = '<tr><td colspan="3">Loading admins...</td></tr>';
        try {
            const res = await fetch('/admin/admins');
            if (!res.ok) {
                adminsTableBody.innerHTML = '<tr><td colspan="3">Unable to load admins.</td></tr>';
                return;
            }
            const admins = await res.json();
            if (!Array.isArray(admins) || admins.length === 0) {
                adminsTableBody.innerHTML = '<tr><td colspan="3">No admin accounts found.</td></tr>';
                return;
            }

            adminsTableBody.innerHTML = admins.map(admin => {
                const createdBy = admin.created_by || 'System';
                const createdAt = admin.created_at ? new Date(admin.created_at).toLocaleString() : '-';
                return `
                    <tr>
                        <td>${admin.username || '-'}</td>
                        <td>${createdBy}</td>
                        <td>${createdAt}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            adminsTableBody.innerHTML = '<tr><td colspan="3">Unable to load admins.</td></tr>';
        }
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAdmins);
    }

    if (createAdminForm) {
        createAdminForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            setStatus('');

            const email = document.getElementById('newAdminEmail').value.trim();
            const password = document.getElementById('newAdminPassword').value;
            const adminCode = document.getElementById('newAdminCode').value.trim();

            if (!email || !password || !adminCode) {
                setStatus('Please fill all required fields.', 'error');
                return;
            }

            try {
                const res = await fetch('/admin/admins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, adminCode })
                });
                const data = await res.json();
                if (!res.ok) {
                    setStatus(data.message || 'Failed to create admin account.', 'error');
                    return;
                }
                setStatus(data.message || 'Admin account created.', 'success');
                createAdminForm.reset();
                const adminCodeField = document.getElementById('newAdminCode');
                if (adminCodeField) adminCodeField.value = '7410';
                await loadAdmins();
            } catch (error) {
                setStatus('Server error. Please try again.', 'error');
            }
        });
    }

    loadAdmins();
});
