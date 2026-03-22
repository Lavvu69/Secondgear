document.addEventListener('DOMContentLoaded', function () {
    const requestDetails = document.getElementById('requestDetails');
    const offerDetails = document.getElementById('offerDetails');
    const offerActions = document.getElementById('offerActions');
    const messagesList = document.getElementById('messagesList');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');
    const acceptOfferBtn = document.getElementById('acceptOfferBtn');
    const counterOfferBtn = document.getElementById('counterOfferBtn');
    const rejectOfferBtn = document.getElementById('rejectOfferBtn');
    const counterPriceInput = document.getElementById('counterPrice');
    const sellerMessageInput = document.getElementById('sellerMessage');

    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request_id');

    if (!requestId) {
        if (requestDetails) requestDetails.textContent = 'Missing request id.';
        if (offerDetails) offerDetails.textContent = 'Unable to load offer.';
        if (messagesList) messagesList.textContent = 'Unable to load messages.';
        return;
    }

    fetch('/user/session')
        .then(res => res.json())
        .then(data => {
            if (!data.loggedIn) {
                window.location.href = '/user';
            }
        })
        .catch(() => {
            window.location.href = '/user';
        });

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

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

    function getStatusInfo(req) {
        if (req.seller_response === 'rejected') {
            return { label: 'Rejected', className: 'status-rejected' };
        }
        if (req.seller_response === 'accepted') {
            return { label: 'Accepted', className: 'status-accepted' };
        }
        if (req.seller_response === 'countered') {
            return { label: 'Counter Sent', className: 'status-countered' };
        }
        if (req.admin_offer_price) {
            return { label: 'Awaiting Your Response', className: 'status-awaiting' };
        }
        return { label: 'Pending Admin Review', className: 'status-pending' };
    }

    function renderRequestDetails(req) {
        const status = getStatusInfo(req);
        const rows = [
            ['Vehicle', `${req.year || '-'} ${req.make || ''} ${req.model || ''}`],
            ['Type', req.type || '-'],
            ['KM Driven', req.km_driven ? `${req.km_driven} km` : '-'],
            ['Estimated Price', formatMoney(req.estimated_price)],
            ['Status', `<span class="status-pill ${status.className}">${status.label}</span>`],
            ['Submitted', formatDate(req.created_at)]
        ];

        requestDetails.innerHTML = rows.map(([label, value]) => `
            <div class="detail-row">
                <span class="detail-label">${label}</span>
                <span>${value}</span>
            </div>
        `).join('');
    }

    function renderOffer(req) {
        const offerPrice = req.admin_offer_price ? formatMoney(req.admin_offer_price) : 'Not offered yet';
        const agreedPrice = req.final_agreed_price ? formatMoney(req.final_agreed_price) : null;
        const adminMessage = req.admin_offer_message ? escapeHtml(req.admin_offer_message) : 'No message yet.';
        offerDetails.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Offer Price</span>
                <span>${offerPrice}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Admin Note</span>
                <span>${adminMessage}</span>
            </div>
            ${agreedPrice ? `
            <div class="detail-row">
                <span class="detail-label">Agreed Price</span>
                <span>${agreedPrice}</span>
            </div>` : ''}
        `;

        if (req.admin_offer_price && !req.seller_response) {
            offerActions.style.display = 'grid';
        } else {
            offerActions.style.display = 'none';
        }
    }

    function renderMessages(messages) {
        if (!messages || !messages.length) {
            messagesList.textContent = 'No messages yet.';
            return;
        }
        messagesList.innerHTML = messages.map(msg => `
            <div class="message-item">
                <div class="message-meta">
                    <span>${msg.sender === 'admin' ? 'Admin' : 'You'}</span>
                    <span>${formatDate(msg.created_at)}</span>
                </div>
                <div>${escapeHtml(msg.message)}</div>
            </div>
        `).join('');
    }

    function loadMessages() {
        fetch(`/user/sell-request/${encodeURIComponent(requestId)}/messages`)
            .then(res => res.json())
            .then(renderMessages)
            .catch(() => {
                messagesList.textContent = 'Unable to load messages.';
            });
    }

    function loadRequest() {
        fetch(`/user/sell-request/${encodeURIComponent(requestId)}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed');
                return res.json();
            })
            .then(data => {
                renderRequestDetails(data);
                renderOffer(data);
            })
            .catch(() => {
                requestDetails.textContent = 'Unable to load request.';
                offerDetails.textContent = 'Unable to load offer.';
            });
    }

    if (sendMessageBtn && messageInput) {
        sendMessageBtn.addEventListener('click', function () {
            const msg = messageInput.value.trim();
            if (!msg) return;
            sendMessageBtn.disabled = true;
            fetch(`/user/sell-request/${encodeURIComponent(requestId)}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            })
                .then(res => res.json())
                .then(() => {
                    messageInput.value = '';
                    loadMessages();
                })
                .catch(() => {
                    alert('Failed to send message.');
                })
                .finally(() => {
                    sendMessageBtn.disabled = false;
                });
        });
    }

    function respondToOffer(action) {
        const counterPrice = counterPriceInput ? counterPriceInput.value.trim() : '';
        const message = sellerMessageInput ? sellerMessageInput.value.trim() : '';
        if (action === 'counter' && !counterPrice) {
            alert('Please enter a counter price.');
            return;
        }
        fetch(`/user/sell-request/${encodeURIComponent(requestId)}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                counter_price: counterPrice ? Number(counterPrice) : null,
                message
            })
        })
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    alert(data.message || 'Failed to submit response.');
                    return;
                }
                if (sellerMessageInput) sellerMessageInput.value = '';
                if (counterPriceInput) counterPriceInput.value = '';
                loadRequest();
                loadMessages();
            })
            .catch(() => alert('Failed to submit response.'));
    }

    if (acceptOfferBtn) {
        acceptOfferBtn.addEventListener('click', function () {
            respondToOffer('accept');
        });
    }
    if (counterOfferBtn) {
        counterOfferBtn.addEventListener('click', function () {
            respondToOffer('counter');
        });
    }
    if (rejectOfferBtn) {
        rejectOfferBtn.addEventListener('click', function () {
            if (!confirm('Reject this offer?')) return;
            respondToOffer('reject');
        });
    }

    loadRequest();
    loadMessages();
});
