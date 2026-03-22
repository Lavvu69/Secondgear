document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('adminLoginForm');
    const sessionHint = document.getElementById('admin-session-hint');
    const sessionText = document.getElementById('admin-session-text');
    const accessDashboardLink = document.getElementById('admin-access-dashboard-link');

    function setSessionHint(isLoggedIn, username) {
        if (!sessionHint || !sessionText) return;
        if (!isLoggedIn) {
            sessionHint.style.display = 'none';
            return;
        }
        const label = username ? `Logged in as ${username}.` : 'Admin session is active.';
        sessionText.textContent = `${label} You can access dashboard directly or login as another admin below.`;
        sessionHint.style.display = 'flex';
    }

    fetch('/admin/session')
        .then(res => res.json())
        .then(data => {
            const isLoggedIn = !!(data && data.loggedIn);
            if (isLoggedIn) {
                localStorage.setItem('adminLoggedIn', 'true');
                setSessionHint(true, data.admin && data.admin.username);
            } else {
                localStorage.removeItem('adminLoggedIn');
                setSessionHint(false);
            }
        })
        .catch(() => {
            setSessionHint(localStorage.getItem('adminLoggedIn') === 'true');
        });

    if (accessDashboardLink) {
        accessDashboardLink.addEventListener('click', function () {
            localStorage.setItem('adminLoggedIn', 'true');
        });
    }

    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        const adminCode = document.getElementById('admin-code').value;

        try {
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password, adminCode })
            });

            const data = await response.json();
            if (!response.ok) {
                alert(data.message || 'Admin login failed');
                return;
            }

            localStorage.setItem('adminLoggedIn', 'true');
            setSessionHint(true, email);

            const dashboardTab = window.open('/admin-dashboard.html', '_blank');
            if (!dashboardTab) {
                window.location.href = '/admin-dashboard.html';
                return;
            }

            form.reset();
            alert('Admin login successful. Dashboard opened in a new tab.');
        } catch (error) {
            alert('Server error. Try again later.');
            console.error(error);
        }
    });
});
