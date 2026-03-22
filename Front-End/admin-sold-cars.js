// Fetch and display sold cars data
window.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('sold-cars-list');
    const searchInput = document.getElementById('sold-search-input');
    const exportBtn = document.getElementById('export-sold-cars-btn');
    const totalSoldEl = document.getElementById('stat-total-sold');
    const todaySoldEl = document.getElementById('stat-today-sold');
    const complaintModal = document.getElementById('complaintModal');
    const complaintCloseBtn = document.getElementById('complaintCloseBtn');
    const complaintCarLine = document.getElementById('complaintCarLine');
    const complaintStatusBadge = document.getElementById('complaintStatusBadge');
    const complaintCreatedAt = document.getElementById('complaintCreatedAt');
    const complaintSubject = document.getElementById('complaintSubject');
    const complaintMessage = document.getElementById('complaintMessage');
    const complaintAdminResponse = document.getElementById('complaintAdminResponse');
    const complaintResponseInput = document.getElementById('complaintResponseInput');
    const complaintStatusSelect = document.getElementById('complaintStatusSelect');
    const complaintSendBtn = document.getElementById('complaintSendBtn');
    const complaintFeedback = document.getElementById('complaintFeedback');
    let allSales = [];
    let visibleSales = [];
    let activeComplaintId = null;
    const complaintIndex = new Map();

    function normalize(value) {
        return String(value || '').toLowerCase();
    }

    function formatCsvCell(value) {
        const raw = String(value == null ? '' : value);
        return `"${raw.replace(/"/g, '""')}"`;
    }

    function toCsvRows(data) {
        const header = [
            'Car',
            'Buyer Name',
            'Contact',
            'Address',
            'Sold At',
            'Sold Price',
            'Payment Method'
        ];
        const rows = data.map(sale => ([
            sale.car,
            sale.buyerName,
            sale.contact,
            sale.address,
            new Date(sale.soldAt).toLocaleString(),
            Number(sale.soldPrice || 0).toFixed(2),
            sale.paymentMethod
        ]));
        return [header, ...rows].map(row => row.map(formatCsvCell).join(',')).join('\n');
    }

    function sortSales(data) {
        return [...data].sort((a, b) => {
            const aHas = a.complaint ? 1 : 0;
            const bHas = b.complaint ? 1 : 0;
            if (aHas !== bHas) return bHas - aHas;
            return new Date(b.soldAt) - new Date(a.soldAt);
        });
    }

    function formatStatusLabel(status) {
        const normalized = String(status || '').toLowerCase();
        if (normalized === 'responded') return 'Responded';
        if (normalized === 'closed') return 'Closed';
        return 'Open';
    }

    function openComplaintModal(sale) {
        if (!complaintModal || !sale || !sale.complaint) return;
        const complaint = sale.complaint;
        activeComplaintId = complaint.id;
        if (complaintCarLine) complaintCarLine.textContent = sale.car;
        if (complaintStatusBadge) {
            const status = String(complaint.status || 'open').toLowerCase();
            complaintStatusBadge.textContent = `Complaint: ${formatStatusLabel(status)}`;
            complaintStatusBadge.classList.remove('responded', 'closed');
            if (status === 'responded') complaintStatusBadge.classList.add('responded');
            if (status === 'closed') complaintStatusBadge.classList.add('closed');
        }
        if (complaintCreatedAt) {
            complaintCreatedAt.textContent = complaint.createdAt
                ? new Date(complaint.createdAt).toLocaleString()
                : '';
        }
        if (complaintSubject) complaintSubject.textContent = complaint.subject || '-';
        if (complaintMessage) complaintMessage.textContent = complaint.message || '-';
        if (complaintAdminResponse) complaintAdminResponse.textContent = complaint.adminResponse || 'No response yet.';
        if (complaintResponseInput) complaintResponseInput.value = '';
        if (complaintFeedback) complaintFeedback.textContent = '';
        complaintModal.style.display = 'flex';
    }

    function downloadCsv(data) {
        if (!data.length) {
            alert('No sold cars data to export.');
            return;
        }
        const csv = toCsvRows(data);
        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const today = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `sold-cars-${today}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function renderSales(data) {
        visibleSales = Array.isArray(data) ? data : [];
        if (exportBtn) exportBtn.disabled = visibleSales.length === 0;
        list.innerHTML = '';
        complaintIndex.clear();
        if (!data.length) {
            list.innerHTML = '<div class="sold-placeholder">No cars match your search.</div>';
            return;
        }

        data.forEach(sale => {
            const soldDate = new Date(sale.soldAt);
            const card = document.createElement('div');
            card.className = 'sold-car-card';
            const complaint = sale.complaint;
            if (complaint && complaint.id) {
                complaintIndex.set(String(complaint.id), sale);
            }
            const complaintChip = complaint
                ? `<div class="sold-complaint-chip">Complaint: ${formatStatusLabel(complaint.status)}</div>`
                : '';
            const complaintButton = complaint
                ? `<button type="button" class="sold-complaint-btn" data-complaint-id="${complaint.id}">View Complaint</button>`
                : '';
            card.innerHTML = `
                <div class="sold-car-head">
                    <div class="sold-car-title">${sale.car}</div>
                    <div class="sold-car-time-badge">${soldDate.toLocaleDateString()}</div>
                </div>
                ${sale.image ? `<img src="${sale.image}" alt="Car" class="sold-car-img">` : ''}
                <div class="sold-car-buyer"><b>Buyer:</b> ${sale.buyerName}</div>
                <div class="sold-car-contact"><b>Contact:</b> ${sale.contact}</div>
                <div class="sold-car-address"><b>Address:</b> ${sale.address}</div>
                <div class="sold-car-date"><b>Sold At:</b> ${soldDate.toLocaleString()}</div>
                <div class="sold-car-date"><b>Sold Price:</b> ₹${Number(sale.soldPrice || 0).toLocaleString('en-IN')}</div>
                <div class="sold-car-payment">Payment: ${sale.paymentMethod}</div>
                ${complaintChip}
                ${complaintButton}
            `;
            list.appendChild(card);
        });
    }

    function updateStats(data) {
        if (totalSoldEl) totalSoldEl.textContent = String(data.length);
        if (todaySoldEl) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const count = data.filter(item => {
                const d = new Date(item.soldAt);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime();
            }).length;
            todaySoldEl.textContent = String(count);
        }
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = normalize(searchInput.value.trim());
            if (!query) {
                renderSales(allSales);
                return;
            }
            const filtered = allSales.filter(sale =>
                normalize(sale.car).includes(query) ||
                normalize(sale.buyerName).includes(query) ||
                normalize(sale.contact).includes(query)
            );
            renderSales(sortSales(filtered));
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', () => downloadCsv(visibleSales));
    }

    if (list) {
        list.addEventListener('click', (event) => {
            const btn = event.target.closest('.sold-complaint-btn');
            if (!btn) return;
            const complaintId = btn.dataset.complaintId;
            const sale = complaintIndex.get(String(complaintId));
            if (sale) openComplaintModal(sale);
        });
    }

    if (complaintCloseBtn && complaintModal) {
        complaintCloseBtn.addEventListener('click', () => {
            complaintModal.style.display = 'none';
        });
    }

    if (complaintModal) {
        complaintModal.addEventListener('click', (event) => {
            if (event.target === complaintModal) {
                complaintModal.style.display = 'none';
            }
        });
    }

    if (complaintSendBtn) {
        complaintSendBtn.addEventListener('click', async () => {
            if (!activeComplaintId) return;
            const response = complaintResponseInput ? complaintResponseInput.value.trim() : '';
            const status = complaintStatusSelect ? complaintStatusSelect.value : 'responded';
            if (!response) {
                if (complaintFeedback) {
                    complaintFeedback.style.color = '#b91c1c';
                    complaintFeedback.textContent = 'Please enter a response.';
                }
                return;
            }
            complaintSendBtn.disabled = true;
            const originalText = complaintSendBtn.textContent;
            complaintSendBtn.textContent = 'Sending...';
            try {
                const res = await fetch(`/admin/purchase-complaints/${encodeURIComponent(activeComplaintId)}/respond`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ response, status })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || 'Failed to send response.');
                const sale = complaintIndex.get(String(activeComplaintId));
                if (sale && sale.complaint) {
                    sale.complaint.adminResponse = response;
                    sale.complaint.status = status;
                    sale.complaint.respondedAt = new Date().toISOString();
                }
                if (complaintFeedback) {
                    complaintFeedback.style.color = '#16a34a';
                    complaintFeedback.textContent = data.message || 'Response saved.';
                }
                renderSales(sortSales(allSales));
            } catch (err) {
                if (complaintFeedback) {
                    complaintFeedback.style.color = '#b91c1c';
                    complaintFeedback.textContent = err.message || 'Failed to send response.';
                }
            } finally {
                complaintSendBtn.disabled = false;
                complaintSendBtn.textContent = originalText;
            }
        });
    }

    fetch('/api/sold-cars')
        .then(res => res.json())
        .then(data => {
            allSales = sortSales(Array.isArray(data) ? data : []);
            list.innerHTML = '';
            if (!data.length) {
                updateStats([]);
                visibleSales = [];
                if (exportBtn) exportBtn.disabled = true;
                list.innerHTML = '<div class="sold-placeholder">No cars have been sold yet.</div>';
                return;
            }
            updateStats(allSales);
            renderSales(allSales);
        })
        .catch(err => {
            updateStats([]);
            visibleSales = [];
            if (exportBtn) exportBtn.disabled = true;
            list.innerHTML = '<div class="sold-placeholder error">Failed to load sold cars data.</div>';
        });
});

