document.addEventListener('DOMContentLoaded', async function() {
    const requestsList = document.getElementById('chatRequestsList');
    const conversationsList = document.getElementById('chatConversationsList');
    const refreshRequestsBtn = document.getElementById('refreshRequestsBtn');
    const refreshConversationsBtn = document.getElementById('refreshConversationsBtn');
    const chatTitle = document.getElementById('chatTitle');
    const chatSubtitle = document.getElementById('chatSubtitle');
    const chatStatusBadge = document.getElementById('chatStatusBadge');
    const chatCloseBtn = document.getElementById('chatCloseBtn');
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatMessageInput = document.getElementById('chatMessageInput');

    let currentUserId = null;
    let currentConversationId = null;
    let pollTimer = null;
    let currentConversationClosed = false;
    let currentConversationClosedBy = null;

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function ensureSession() {
        const res = await fetch('/user/session');
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.loggedIn ? data.user : null;
    }

    function renderRequests(items) {
        if (!requestsList) return;
        if (!items || !items.length) {
            requestsList.innerHTML = '<p class="chat-empty">No chat requests yet.</p>';
            return;
        }
        requestsList.innerHTML = items.map(req => {
            const carLabel = `${req.make || ''} ${req.model || ''} (${req.year || '-'})`.trim();
            const buyerLabel = `${req.buyer_first_name || ''} ${req.buyer_last_name || ''}`.trim();
            const sellerLabel = `${req.seller_first_name || ''} ${req.seller_last_name || ''}`.trim();
            const status = req.status ? req.status.replace(/_/g, ' ') : 'unknown';
            const isSeller = Number(req.seller_id) === Number(currentUserId);
            const canRespond = isSeller && req.status === 'admin_approved';
            const canOpen = req.status === 'seller_accepted' && req.conversation_id;
            return `
                <div class="chat-card">
                    <h4>${escapeHtml(carLabel)}</h4>
                    <p>Buyer: ${escapeHtml(buyerLabel || 'Buyer')}</p>
                    <p>Seller: ${escapeHtml(sellerLabel || 'Seller')}</p>
                    <p>Status: ${escapeHtml(status)}</p>
                    <div class="chat-card-actions">
                        ${canRespond ? `
                            <button class="accept" data-action="accept" data-id="${req.id}">Accept</button>
                            <button class="decline" data-action="decline" data-id="${req.id}">Decline</button>
                        ` : ''}
                        ${canOpen ? `<button class="open" data-open="${req.conversation_id}">Open Chat</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderConversations(items) {
        if (!conversationsList) return;
        if (!items || !items.length) {
            conversationsList.innerHTML = '<p class="chat-empty">No conversations yet.</p>';
            return;
        }
        conversationsList.innerHTML = items.map(conv => {
            const isBuyer = Number(conv.buyer_id) === Number(currentUserId);
            const otherName = isBuyer
                ? `${conv.seller_first_name || ''} ${conv.seller_last_name || ''}`.trim()
                : `${conv.buyer_first_name || ''} ${conv.buyer_last_name || ''}`.trim();
            const carLabel = `${conv.make || ''} ${conv.model || ''} (${conv.year || '-'})`.trim();
            const unread = Number(conv.unread_count || 0);
            const isClosed = Number(conv.is_closed || 0) === 1;
            return `
                <div class="chat-card">
                    <h4>${escapeHtml(otherName || 'User')}</h4>
                    <p>${escapeHtml(carLabel)}</p>
                    <p>${escapeHtml(conv.last_message || 'No messages yet.')}</p>
                    ${isClosed ? `<p><strong>Closed</strong></p>` : ''}
                    ${unread ? `<p><strong>${unread} unread</strong></p>` : ''}
                    <div class="chat-card-actions">
                        <button class="open" data-open="${conv.id}">Open Chat</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function loadRequests() {
        try {
            const res = await fetch('/chat/requests');
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to load requests');
            renderRequests(data);
        } catch (err) {
            if (requestsList) {
                requestsList.innerHTML = `<p class="chat-empty">${escapeHtml(err.message || 'Failed to load requests')}</p>`;
            }
        }
    }

    async function loadConversations() {
        try {
            const res = await fetch('/chat/conversations');
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to load conversations');
            renderConversations(data);
        } catch (err) {
            if (conversationsList) {
                conversationsList.innerHTML = `<p class="chat-empty">${escapeHtml(err.message || 'Failed to load conversations')}</p>`;
            }
        }
    }

    async function loadMessages(conversationId) {
        try {
            const res = await fetch(`/chat/conversations/${conversationId}/messages`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to load messages');
            if (chatMessages) {
                const messages = Array.isArray(data) ? data : (data.messages || []);
                const isClosed = Array.isArray(data) ? false : !!data.closed;
                currentConversationClosed = isClosed;
                currentConversationClosedBy = Array.isArray(data) ? null : data.closed_by;
                if (!messages.length) {
                    chatMessages.innerHTML = '<p class="chat-empty">No messages yet.</p>';
                } else {
                    chatMessages.innerHTML = messages.map(msg => {
                        const isMine = Number(msg.sender_id) === Number(currentUserId);
                        return `<div class="chat-bubble ${isMine ? 'me' : 'them'}">${escapeHtml(msg.message)}</div>`;
                    }).join('');
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
            if (chatStatusBadge) {
                if (currentConversationClosed) {
                    chatStatusBadge.textContent = 'Closed';
                    chatStatusBadge.style.display = 'inline-flex';
                    chatStatusBadge.style.background = '#fee2e2';
                    chatStatusBadge.style.color = '#b91c1c';
                    chatStatusBadge.style.borderColor = '#fca5a5';
                } else {
                    chatStatusBadge.textContent = 'Active';
                    chatStatusBadge.style.display = 'inline-flex';
                    chatStatusBadge.style.background = '';
                    chatStatusBadge.style.color = '';
                    chatStatusBadge.style.borderColor = '';
                }
            }
            if (chatForm) {
                chatForm.style.display = currentConversationClosed ? 'none' : 'flex';
            }
            if (chatCloseBtn) {
                chatCloseBtn.style.display = currentConversationClosed ? 'none' : 'inline-flex';
            }
            await fetch(`/chat/conversations/${conversationId}/read`, { method: 'POST' });
        } catch (err) {
            if (chatMessages) {
                chatMessages.innerHTML = `<p class="chat-empty">${escapeHtml(err.message || 'Failed to load messages')}</p>`;
            }
        }
    }

    function setActiveConversation(conversationId, label) {
        currentConversationId = conversationId;
        currentConversationClosed = false;
        currentConversationClosedBy = null;
        if (chatTitle) chatTitle.textContent = label || 'Conversation';
        if (chatSubtitle) chatSubtitle.textContent = 'Start chatting below.';
        if (chatStatusBadge) {
            chatStatusBadge.textContent = 'Active';
            chatStatusBadge.style.display = 'inline-flex';
        }
        if (chatForm) chatForm.style.display = 'flex';
        if (chatCloseBtn) chatCloseBtn.style.display = 'inline-flex';
        loadMessages(conversationId);
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (currentConversationId) loadMessages(currentConversationId);
        }, 8000);
    }

    if (requestsList) {
        requestsList.addEventListener('click', async function(e) {
            const action = e.target.getAttribute('data-action');
            const id = e.target.getAttribute('data-id');
            const openId = e.target.getAttribute('data-open');
            if (openId) {
                setActiveConversation(openId, 'Conversation');
                return;
            }
            if (!action || !id) return;
            const note = action === 'accept'
                ? (prompt('Optional note to buyer:') || '')
                : (prompt('Optional decline note:') || '');
            const res = await fetch(`/chat/requests/${id}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, seller_note: note })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.message || 'Failed to respond.');
                return;
            }
            await loadRequests();
            await loadConversations();
            if (data.conversation_id) {
                setActiveConversation(data.conversation_id, 'Conversation');
            }
        });
    }

    if (conversationsList) {
        conversationsList.addEventListener('click', function(e) {
            const openId = e.target.getAttribute('data-open');
            if (!openId) return;
            setActiveConversation(openId, 'Conversation');
        });
    }

    if (chatForm) {
        chatForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (!currentConversationId) return;
            if (currentConversationClosed) {
                alert('This chat is closed. You can still read messages, but cannot send new ones.');
                return;
            }
            const text = chatMessageInput.value.trim();
            if (!text) return;
            chatMessageInput.value = '';
            const res = await fetch(`/chat/conversations/${currentConversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.message || 'Failed to send message.');
                return;
            }
            loadMessages(currentConversationId);
            loadConversations();
        });
    }

    if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', async function() {
            if (!currentConversationId) return;
            if (!confirm('Close this chat? Both users will be able to read messages but cannot send new ones.')) return;
            const res = await fetch(`/chat/conversations/${currentConversationId}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: '' })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.message || 'Failed to close chat.');
                return;
            }
            await loadConversations();
            await loadMessages(currentConversationId);
        });
    }

    if (refreshRequestsBtn) {
        refreshRequestsBtn.addEventListener('click', loadRequests);
    }
    if (refreshConversationsBtn) {
        refreshConversationsBtn.addEventListener('click', loadConversations);
    }

    const user = await ensureSession();
    if (!user) {
        window.location.href = '/user';
        return;
    }
    currentUserId = user.id;
    loadRequests();
    loadConversations();
});
