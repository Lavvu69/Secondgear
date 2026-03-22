document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('sellRequestModal');
    const modalBody = document.getElementById('srModalBody');
    const modalClose = document.getElementById('srModalClose');
    const requestsMap = new Map();

    function formatMoney(value) {
        const num = Number(value);
        if (Number.isNaN(num)) return '-';
        return `₹${num.toLocaleString('en-IN')}`;
    }

    function formatDate(raw) {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getStatusInfo(req) {
        if (req.seller_response === 'rejected') return { label: 'Seller Rejected', className: 'status-rejected' };
        if (req.seller_response === 'accepted') return { label: 'Seller Accepted', className: 'status-accepted' };
        if (req.seller_response === 'countered') return { label: 'Seller Countered', className: 'status-countered' };
        if (req.admin_offer_price) return { label: 'Awaiting Seller', className: 'status-awaiting' };
        return { label: 'Pending Review', className: 'status-pending' };
    }

    function renderRequests(requests) {
        const tbody = document.querySelector('#sellRequestsTable tbody');
        tbody.innerHTML = '';
        requests.forEach(req => {
            requestsMap.set(String(req.id), req);
            const status = getStatusInfo(req);
            const adminOffer = req.admin_offer_price ? formatMoney(req.admin_offer_price) : '-';
            const sellerResponse = req.seller_response ? req.seller_response : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${req.id}</td>
                <td>${req.email || ''}</td>
                <td>${req.make}</td>
                <td>${req.model}</td>
                <td>${req.year}</td>
                <td>${req.km_driven}</td>
                <td>${req.type}</td>
                <td><span class="usd-price">${formatMoney(req.estimated_price)}</span></td>
                <td>${adminOffer}</td>
                <td>${sellerResponse}</td>
                <td><span class="status-badge ${status.className}">${status.label}</span></td>
                <td>
                    <button class="action-btn btn-primary" data-action="manage" data-id="${req.id}">Manage</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function openModal(id) {
        const req = requestsMap.get(String(id));
        if (!req) return;
        const status = getStatusInfo(req);
        const image = req.image_url || req.image || 'images/cars/default.jpg';
        const sellerCounter = req.seller_counter_price ? formatMoney(req.seller_counter_price) : '-';
        const adminOfferValue = req.admin_offer_price ? req.admin_offer_price : '';
        const adminOfferMessage = req.admin_offer_message || '';

        modalBody.innerHTML = `
            <div class="sr-header">
                <div>
                    <h2>Sell Request #${req.id}</h2>
                    <div class="sr-detail-grid">
                        <div class="sr-detail"><strong>Vehicle:</strong> ${req.year} ${req.make} ${req.model}</div>
                        <div class="sr-detail"><strong>Type:</strong> ${req.type || '-'}</div>
                        <div class="sr-detail"><strong>KM Driven:</strong> ${req.km_driven || '-'} km</div>
                        <div class="sr-detail"><strong>Estimated:</strong> ${formatMoney(req.estimated_price)}</div>
                        <div class="sr-detail"><strong>Status:</strong> <span class="status-badge ${status.className}">${status.label}</span></div>
                        <div class="sr-detail"><strong>Submitted:</strong> ${formatDate(req.created_at)}</div>
                        <div class="sr-detail"><strong>Seller Counter:</strong> ${sellerCounter}</div>
                    </div>
                </div>
                <div class="sr-image">
                    <img src="${image}" alt="Vehicle">
                </div>
            </div>
            <div class="sr-section">
                <h3>Admin Offer</h3>
                <div class="sr-form-row">
                    <input id="srOfferPrice" type="number" min="1" step="1" placeholder="Offer price (INR)" value="${adminOfferValue}">
                    <textarea id="srOfferMessage" rows="2" placeholder="Add a note for the seller...">${adminOfferMessage}</textarea>
                    <div class="sr-action-row">
                        <button class="action-btn btn-success" data-action="send-offer" data-id="${req.id}">Send Offer</button>
                        <button class="action-btn btn-secondary" data-action="send-message" data-id="${req.id}">Ask Question</button>
                    </div>
                </div>
            </div>
            <div class="sr-section">
                <h3>Messages</h3>
                <div id="srMessagesList" class="sr-messages">Loading...</div>
                <div class="sr-form-row" style="margin-top:8px;">
                    <textarea id="srMessageInput" rows="2" placeholder="Write a message to the seller..."></textarea>
                    <div class="sr-action-row">
                        <button class="action-btn btn-primary" data-action="send-message-only" data-id="${req.id}">Send Message</button>
                    </div>
                </div>
            </div>
            <div class="sr-section">
                <h3>Deal Actions</h3>
                <div class="sr-action-row">
                    ${req.seller_response === 'countered' ? `
                        <button class="action-btn btn-success" data-action="accept-counter" data-id="${req.id}">Accept Counter</button>
                        <button class="action-btn btn-danger" data-action="reject-counter" data-id="${req.id}">Reject Counter</button>
                    ` : ''}
                    ${req.seller_response === 'accepted' ? `
                        <button class="action-btn btn-success" data-action="publish" data-id="${req.id}">Publish Listing</button>
                    ` : ''}
                    ${req.seller_response === 'rejected' ? `
                        <button class="action-btn btn-danger" data-action="delete-rejected" data-id="${req.id}">Delete Rejected</button>
                    ` : ''}
                    ${req.seller_response ? '' : `
                        <button class="action-btn btn-danger" data-action="reject-request" data-id="${req.id}">Reject Request</button>
                    `}
                </div>
            </div>
        `;

        loadMessages(id);
        if (modal) modal.style.display = 'flex';
    }

    function closeModal() {
        if (modal) modal.style.display = 'none';
    }

    function loadRequests() {
        return fetch('/admin/sell-requests')
            .then(res => res.json())
            .then(renderRequests);
    }

    function loadMessages(id) {
        const list = document.getElementById('srMessagesList');
        if (!list) return;
        fetch(`/admin/sell-request/${id}/messages`)
            .then(res => res.json())
            .then(messages => {
                if (!messages || !messages.length) {
                    list.textContent = 'No messages yet.';
                    return;
                }
                list.innerHTML = messages.map(msg => `
                    <div class="sr-message-item">
                        <div class="sr-message-meta">
                            <span>${msg.sender === 'admin' ? 'Admin' : 'Seller'}</span>
                            <span>${formatDate(msg.created_at)}</span>
                        </div>
                        <div>${escapeHtml(msg.message)}</div>
                    </div>
                `).join('');
            })
            .catch(() => {
                list.textContent = 'Unable to load messages.';
            });
    }

    function loadRejectedRequests() {
        fetch('/admin/rejected-requests')
            .then(res => res.json())
            .then(requests => {
                const tbody = document.querySelector('#rejectedRequestsTable tbody');
                tbody.innerHTML = '';
                requests.forEach(req => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${req.id}</td>
                        <td>${req.make}</td>
                        <td>${req.model}</td>
                        <td>${req.year}</td>
                        <td>${req.km_driven}</td>
                        <td>${req.type}</td>
                        <td><span class="usd-price">₹${Number(req.estimated_price).toLocaleString('en-IN')}</span></td>
                        <td><span class="status-badge status-rejected">${req.status}</span></td>
                        <td>${new Date(req.created_at).toLocaleString()}</td>
                    `;
                    tbody.appendChild(tr);
                });
            });
    }

    const table = document.querySelector('#sellRequestsTable');
    if (table) {
        table.addEventListener('click', function(e) {
            const btn = e.target.closest('button[data-action="manage"]');
            if (!btn) return;
            const id = btn.getAttribute('data-id');
            openModal(id);
        });
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });
    }

    if (modalBody) {
        modalBody.addEventListener('click', function(e) {
            const target = e.target;
            if (!target || !target.dataset) return;
            const action = target.dataset.action;
            const id = target.dataset.id;
            if (!action || !id) return;

            if (action === 'send-offer') {
                const priceInput = document.getElementById('srOfferPrice');
                const messageInput = document.getElementById('srOfferMessage');
                const priceVal = priceInput ? priceInput.value : '';
                const msgVal = messageInput ? messageInput.value : '';
                if (!priceVal) {
                    alert('Enter an offer price.');
                    return;
                }
                fetch(`/admin/sell-request/${id}/offer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ price: Number(priceVal), message: msgVal })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (!data.success) {
                            alert(data.message || 'Failed to send offer.');
                            return;
                        }
                        loadRequests().then(() => openModal(id));
                    })
                    .catch(() => alert('Failed to send offer.'));
                return;
            }

            if (action === 'send-message' || action === 'send-message-only') {
                const messageInput = action === 'send-message' ? document.getElementById('srOfferMessage') : document.getElementById('srMessageInput');
                const msgVal = messageInput ? messageInput.value.trim() : '';
                if (!msgVal) {
                    alert('Enter a message.');
                    return;
                }
                fetch(`/admin/sell-request/${id}/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msgVal })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (!data.success) {
                            alert(data.message || 'Failed to send message.');
                            return;
                        }
                        if (messageInput) messageInput.value = '';
                        loadMessages(id);
                    })
                    .catch(() => alert('Failed to send message.'));
                return;
            }

            if (action === 'accept-counter' || action === 'reject-counter') {
                fetch(`/admin/sell-request/${id}/counter-response`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: action === 'accept-counter' ? 'accept' : 'reject' })
                })
                    .then(res => res.json())
                    .then(data => {
                        if (!data.success) {
                            alert(data.message || 'Failed to respond to counter.');
                            return;
                        }
                        loadRequests().then(() => openModal(id));
                    })
                    .catch(() => alert('Failed to respond to counter.'));
                return;
            }

            if (action === 'publish') {
                window.location.href = `admin-confirm-sell.html?id=${id}`;
                return;
            }

            if (action === 'delete-rejected') {
                if (!confirm('Delete this rejected request?')) return;
                fetch(`/admin/sell-request/${id}/delete`, { method: 'POST' })
                    .then(res => res.json())
                    .then(data => {
                        if (!data.success) {
                            alert(data.message || 'Failed to delete request.');
                            return;
                        }
                        closeModal();
                        loadRequests();
                    })
                    .catch(() => alert('Failed to delete request.'));
                return;
            }

            if (action === 'reject-request') {
                if (!confirm('Reject this sell request?')) return;
                fetch(`/admin/sell-request/${id}/reject`, { method: 'POST' })
                    .then(res => res.json())
                    .then(data => {
                        if (!data.success) {
                            alert(data.message || 'Failed to reject request.');
                            return;
                        }
                        closeModal();
                        loadRequests();
                        loadRejectedRequests();
                    })
                    .catch(() => alert('Failed to reject request.'));
            }
        });
    }

    loadRequests();
    loadRejectedRequests();
});


function confirmRequest(id) {
    // Redirect to a page or open a modal to upload image and set price
    window.location.href = `admin-confirm-sell.html?id=${id}`;
}

function rejectRequest(id) {
    fetch(`/admin/sell-request/${id}/reject`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            alert('Request rejected');
            // Remove the row from the table without reloading
            const rows = document.querySelectorAll('#sellRequestsTable tbody tr');
            for (const row of rows) {
                if (row.children[0] && row.children[0].textContent == id) {
                    row.remove();
                    break;
                }
            }
            // Refresh rejected requests table
            fetch('/admin/rejected-requests')
                .then(res => res.json())
                .then(requests => {
                    const tbody = document.querySelector('#rejectedRequestsTable tbody');
                    tbody.innerHTML = '';
                    requests.forEach(req => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${req.id}</td>
                            <td>${req.make}</td>
                            <td>${req.model}</td>
                            <td>${req.year}</td>
                            <td>${req.km_driven}</td>
                            <td>${req.type}</td>
                            <td><span class="usd-price">₹${Number(req.estimated_price).toLocaleString('en-IN')}</span></td>
                            <td><span class="status-badge status-rejected">${req.status}</span></td>
                            <td>${new Date(req.created_at).toLocaleString()}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                });
        }
    });
}
