// admin-auth.js
// Keeps admin session in sync with backend and handles logout globally on admin pages.

document.addEventListener('DOMContentLoaded', async function () {
    const logoutBtn = document.getElementById('admin-logout-btn');

    try {
        const res = await fetch('/admin/session');
        const data = await res.json();
        if (!data.loggedIn) {
            localStorage.removeItem('adminLoggedIn');
            window.location.href = '/admin';
            return;
        }
        localStorage.setItem('adminLoggedIn', 'true');
    } catch (e) {
        // If session check fails, fall back to existing local storage behavior.
        if (localStorage.getItem('adminLoggedIn') !== 'true') {
            window.location.href = '/admin';
            return;
        }
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function () {
            try {
                await fetch('/admin/logout', { method: 'POST' });
            } catch (e) {
                // Continue with local cleanup even if network fails.
            }
            localStorage.removeItem('adminLoggedIn');
            window.location.href = '/admin';
        });
    }
});
