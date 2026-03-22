document.addEventListener('DOMContentLoaded', () => {
    const statusEl = document.getElementById('faqChatStatus');
    const messagesEl = document.getElementById('faqChatMessages');
    const form = document.getElementById('faqChatForm');
    const input = document.getElementById('faqChatInput');
    const sendBtn = document.getElementById('faqChatSend');

    let isLoggedIn = false;
    const history = [];
    const suggestions = document.createElement('div');
    suggestions.className = 'faq-chat-suggestions';

    function setEnabled(enabled) {
        if (input) input.disabled = !enabled;
        if (sendBtn) sendBtn.disabled = !enabled;
    }

    function addMessage(text, type) {
        if (!messagesEl) return;
        const bubble = document.createElement('div');
        bubble.className = `faq-chat-bubble ${type === 'user' ? 'faq-chat-user' : 'faq-chat-bot'}`;
        bubble.textContent = text;
        messagesEl.appendChild(bubble);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return bubble;
    }

    function renderSuggestions(list) {
        if (!messagesEl) return;
        suggestions.innerHTML = '';
        if (!Array.isArray(list) || list.length === 0) return;
        list.slice(0, 4).forEach(text => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = text;
            btn.addEventListener('click', () => {
                input.value = text;
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            });
            suggestions.appendChild(btn);
        });
        messagesEl.appendChild(suggestions);
    }

    async function checkSession() {
        try {
            const res = await fetch('/user/session');
            const data = await res.json().catch(() => ({}));
            isLoggedIn = !!data.loggedIn;
        } catch (err) {
            isLoggedIn = false;
        }

        if (isLoggedIn) {
            statusEl.textContent = 'You are logged in. Ask your question below.';
            setEnabled(true);
            await loadHistory();
            if (messagesEl && messagesEl.children.length === 0) {
                addMessage('Hi! Ask me anything about SecondGear or automobiles.', 'bot');
            }
        } else {
            statusEl.innerHTML = 'Please <a href="/user">log in</a> to use the chatbot.';
            setEnabled(false);
        }
    }

    async function loadHistory() {
        try {
            const res = await fetch('/chatbot/history');
            if (!res.ok) return;
            const items = await res.json();
            items.forEach(item => {
                addMessage(item.message, item.role === 'assistant' ? 'bot' : 'user');
                history.push({ role: item.role, text: item.message });
            });
        } catch (err) {
            // ignore history load errors
        }
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!isLoggedIn) return;
            const text = input.value.trim();
            if (!text) return;

            addMessage(text, 'user');
            history.push({ role: 'user', text });
            input.value = '';
            setEnabled(false);

            const typingBubble = addMessage('Thinking...', 'bot');
            try {
                const res = await fetch('/chatbot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text, history })
                });
                const data = await res.json().catch(() => ({}));
                const reply = data.reply || 'Sorry, I could not answer that.';
                if (typingBubble) typingBubble.remove();
                addMessage(reply, 'bot');
                history.push({ role: 'assistant', text: reply });
                renderSuggestions(data.suggestions || []);
            } catch (err) {
                if (typingBubble) typingBubble.remove();
                addMessage('Server error. Please try again later.', 'bot');
            } finally {
                setEnabled(true);
            }
        });
    }

    checkSession();
});
