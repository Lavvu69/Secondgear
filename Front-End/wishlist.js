document.addEventListener('DOMContentLoaded', async function() {
    const getAuthItem = (key) => sessionStorage.getItem(key) ?? localStorage.getItem(key);
    const clearAuthStorage = () => {
        ['userLoggedIn', 'userInfo', 'user_id', 'rememberMe'].forEach((key) => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    };

    const wishlistList = document.getElementById('wishlist-list');
    const wishlistMessage = document.getElementById('wishlist-message');
    const loginLink = document.getElementById('wishlist-login-link');
    const profileSection = document.getElementById('profile-section');
    const welcomeMessage = document.getElementById('welcome-message');
    const profileUsername = document.getElementById('profile-username');
    const logoutBtn = document.getElementById('logout-btn');

    let userLoggedIn = false;
    let isAdmin = false;

    try {
        const [adminRes, userRes] = await Promise.all([fetch('/admin/session'), fetch('/user/session')]);
        if (adminRes.ok) {
            const adminData = await adminRes.json();
            isAdmin = !!adminData.loggedIn;
        }
        if (userRes.ok) {
            const userData = await userRes.json();
            userLoggedIn = !!userData.loggedIn;
        }
    } catch (e) {
        userLoggedIn = getAuthItem('userLoggedIn') === 'true';
        isAdmin = localStorage.getItem('adminLoggedIn') === 'true';
    }

    if (loginLink) loginLink.style.display = isAdmin ? 'none' : 'inline-block';

    if (profileSection && welcomeMessage && profileUsername && logoutBtn) {
        if (userLoggedIn && !isAdmin) {
            const user = JSON.parse(getAuthItem('userInfo') || '{}');
            profileSection.style.display = 'flex';
            welcomeMessage.textContent = 'Welcome to SecondGear,';
            profileUsername.textContent = ' ' + (user.username || user.firstName || user.email || 'User');
            logoutBtn.style.display = 'inline-block';
            logoutBtn.onclick = async function() {
                try {
                    await fetch('/user/logout', { method: 'POST' });
                } catch (e) {}
                clearAuthStorage();
                window.location.reload();
            };
        } else {
            profileSection.style.display = 'none';
        }
    }

    if (!userLoggedIn || isAdmin) {
        wishlistMessage.textContent = 'Please log in as a user to view your wishlist.';
        if (wishlistList) wishlistList.innerHTML = '';
        return;
    }

    const PLACEHOLDER_IMG = 'images/cars/placeholder.png';

    function renderWishlist(items) {
        wishlistList.innerHTML = '';
        if (!items.length) {
            wishlistMessage.textContent = 'Your wishlist is empty.';
            return;
        }
        wishlistMessage.textContent = '';
        const fragment = document.createDocumentFragment();
        items.forEach(car => {
            const card = document.createElement('div');
            card.className = 'car-card';
            let imgUrl = '';
            let imageVal = car.image_url || car.image;
            if (imageVal) {
                if (imageVal.startsWith('/')) imageVal = imageVal.substring(1);
                if (imageVal.startsWith('http://') || imageVal.startsWith('https://')) {
                    imgUrl = imageVal;
                } else if (imageVal.startsWith('images/cars/')) {
                    imgUrl = imageVal;
                } else {
                    imgUrl = 'images/cars/' + imageVal;
                }
            } else {
                imgUrl = PLACEHOLDER_IMG;
            }
            card.innerHTML = `
                <div class="car-image-container">
                    <a href="${imgUrl}" target="_blank">
                        <img src="${imgUrl}" alt="${car.make} ${car.model}" class="car-image" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}';">
                    </a>
                </div>
                <div class="car-details">
                    <h2>${car.make} ${car.model} (${car.year})</h2>
                    <p class="car-desc">${car.description || ''}</p>
                    <p class="car-price">&#8377;${Number(car.price || 0).toLocaleString('en-IN')}</p>
                    <div class="wishlist-actions">
                        <button class="buy-btn" type="button">View Details</button>
                        <button class="wishlist-remove-btn" type="button" data-car-id="${car.id}">Remove</button>
                    </div>
                </div>
            `;
            const viewBtn = card.querySelector('.buy-btn');
            if (viewBtn) {
                viewBtn.addEventListener('click', () => {
                    window.location.href = `car-details.html?id=${encodeURIComponent(car.id)}`;
                });
            }
            const removeBtn = card.querySelector('.wishlist-remove-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', async () => {
                    removeBtn.disabled = true;
                    try {
                        const res = await fetch(`/user/wishlist/${car.id}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.message || 'Failed to remove.');
                        loadWishlist();
                    } catch (err) {
                        alert(err.message || 'Failed to remove.');
                        removeBtn.disabled = false;
                    }
                });
            }
            fragment.appendChild(card);
        });
        wishlistList.appendChild(fragment);
    }

    async function loadWishlist() {
        try {
            const res = await fetch('/user/wishlist');
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to load wishlist.');
            renderWishlist(Array.isArray(data) ? data : []);
        } catch (err) {
            wishlistMessage.textContent = err.message || 'Failed to load wishlist.';
            wishlistList.innerHTML = '';
        }
    }

    loadWishlist();
});

