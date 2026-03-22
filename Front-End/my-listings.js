document.addEventListener('DOMContentLoaded', function () {
    const pendingList = document.getElementById('pendingList');
    const activeList = document.getElementById('activeList');
    const soldList = document.getElementById('soldList');
    const rejectedList = document.getElementById('rejectedList');
    const verifiedSellerBadge = document.getElementById('verifiedSellerBadge');
    let isVerifiedSeller = false;
    let listingsCache = null;

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtDate(raw) {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString();
    }

    function renderCards(target, items, type) {
        if (!target) return;
        if (!items || !items.length) {
            target.innerHTML = '<p class="listing-empty">No records found.</p>';
            return;
        }

        target.innerHTML = items.map(item => {
            const title = `${item.make || ''} ${item.model || ''} (${item.year || '-'})`;
            const price = item.price || item.estimated_price ? `₹${Number(item.price || item.estimated_price).toLocaleString('en-IN')}` : 'N/A';
            const created = item.created_at ? fmtDate(item.created_at) : '-';
            const soldAt = item.purchase_date ? fmtDate(item.purchase_date) : '';
            const image = item.image_url || 'images/cars/default.jpg';

            const chips = [];
            if (item.type) chips.push(`<span class="listing-chip">${escapeHtml(item.type)}</span>`);
            if (item.km_driven) chips.push(`<span class="listing-chip">${escapeHtml(item.km_driven)} km</span>`);
            if (isVerifiedSeller) chips.push('<span class="listing-chip verified">Verified Seller</span>');
            if (type === 'pending') {
                let statusLabel = 'Pending Review';
                if (item.seller_response === 'rejected') statusLabel = 'Rejected';
                else if (item.seller_response === 'accepted') statusLabel = 'Accepted';
                else if (item.seller_response === 'countered') statusLabel = 'Countered';
                else if (item.admin_offer_price) statusLabel = 'Awaiting Your Response';
                chips.push(`<span class="listing-chip">${escapeHtml(statusLabel)}</span>`);
            }
            if (type === 'active') chips.push('<span class="listing-chip">Live</span>');
            if (type === 'sold') chips.push('<span class="listing-chip">Sold</span>');
            if (type === 'rejected') chips.push('<span class="listing-chip">Rejected</span>');

            return `
                <article class="listing-card">
                    <div class="listing-head">
                        <img class="listing-thumb" src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
                        <div>
                            <p class="listing-title">${escapeHtml(title)}</p>
                            <p class="listing-meta">Price: ${escapeHtml(price)}</p>
                            <p class="listing-meta">${type === 'sold' ? `Sold on: ${escapeHtml(soldAt)}` : `Created: ${escapeHtml(created)}`}</p>
                        </div>
                    </div>
                    <div class="listing-detail">
                        ${chips.join('')}
                    </div>
                    ${type === 'pending' ? `
                        <div class="listing-actions">
                            <a class="listing-link-btn" href="sell-status.html?request_id=${encodeURIComponent(item.id)}">Open Status</a>
                        </div>
                    ` : ''}
                </article>
            `;
        }).join('');
    }

    fetch('/user/profile')
        .then(res => {
            if (!res.ok) throw new Error('Not logged in');
            return res.json();
        })
        .then(user => {
            const profileSection = document.getElementById('profile-section');
            const welcomeMessage = document.getElementById('welcome-message');
            const profileUsername = document.getElementById('profile-username');
            const logoutBtn = document.getElementById('logout-btn');
            if (profileSection && welcomeMessage && profileUsername && logoutBtn) {
                profileSection.style.display = 'flex';
                welcomeMessage.textContent = 'Welcome to SecondGear,';
                profileUsername.textContent = user.first_name || user.email || 'User';
                logoutBtn.style.display = 'inline-block';
                logoutBtn.onclick = async function () {
                    await fetch('/user/logout', { method: 'POST' });
                    window.location.href = '/user';
                };
            }
            fetch('/user/verification/status')
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (!verifiedSellerBadge) return;
                    if (data && data.is_verified) {
                        isVerifiedSeller = true;
                        verifiedSellerBadge.style.display = 'inline-flex';
                    } else {
                        isVerifiedSeller = false;
                        verifiedSellerBadge.style.display = 'none';
                    }
                    if (listingsCache) {
                        renderCards(pendingList, listingsCache.pending, 'pending');
                        renderCards(activeList, listingsCache.active, 'active');
                        renderCards(soldList, listingsCache.sold, 'sold');
                        renderCards(rejectedList, listingsCache.rejected, 'rejected');
                    }
                })
                .catch(() => {});
        })
        .catch(() => {
            window.location.href = '/user';
        });

    fetch('/user/my-listings')
        .then(res => {
            if (!res.ok) throw new Error('Failed to load listings');
            return res.json();
        })
        .then(data => {
            listingsCache = data;
            renderCards(pendingList, data.pending, 'pending');
            renderCards(activeList, data.active, 'active');
            renderCards(soldList, data.sold, 'sold');
            renderCards(rejectedList, data.rejected, 'rejected');
        })
        .catch(() => {
            if (pendingList) pendingList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
            if (activeList) activeList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
            if (soldList) soldList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
            if (rejectedList) rejectedList.innerHTML = '<p class="listing-empty">Unable to load listings.</p>';
        });
});
