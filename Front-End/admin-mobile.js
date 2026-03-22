document.addEventListener('DOMContentLoaded', () => {
  const adminRoot = document.querySelector('.admin-section, .dashboard-container');
  if (!adminRoot) return;

  const tables = adminRoot.querySelectorAll('table');
  tables.forEach((table) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
      th.textContent.trim()
    );

    if (!headers.length) return;
    table.classList.add('mobile-cards');

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      cells.forEach((cell, i) => {
        if (!cell.getAttribute('data-label')) {
          cell.setAttribute('data-label', headers[i] || '');
        }
      });
    });
  });
});
