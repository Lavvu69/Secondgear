// user-login.js
// Handles user login and session

document.addEventListener('DOMContentLoaded', function() {
	const form = document.querySelector('form');
	if (form) {
		form.addEventListener('submit', async function(e) {
			e.preventDefault();
			const email = document.getElementById('user-email').value.trim();
			const password = document.getElementById('user-password').value;
			const remember = document.getElementById('remember')?.checked === true;
			try {
				const res = await fetch('/user/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email, password })
				});
				const result = await res.json();
				if (res.ok && result.user) {
					const primaryStorage = remember ? localStorage : sessionStorage;
					const secondaryStorage = remember ? sessionStorage : localStorage;
					['userLoggedIn', 'userInfo', 'user_id', 'rememberMe'].forEach((key) => {
						secondaryStorage.removeItem(key);
					});
					primaryStorage.setItem('rememberMe', remember ? 'true' : 'false');
					primaryStorage.setItem('userLoggedIn', 'true');
					primaryStorage.setItem('userInfo', JSON.stringify(result.user));
					primaryStorage.setItem('user_id', result.user.id);
					// Redirect to original page if present
					const urlParams = new URLSearchParams(window.location.search);
					const redirect = urlParams.get('redirect');
					if (redirect) {
						window.location.href = redirect;
					} else {
						window.location.href = 'Home.html';
					}
				} else {
					alert(result.message || 'Login failed');
				}
			} catch (err) {
				alert('Login error. Please try again.');
			}
		});
	}
});
