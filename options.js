document.addEventListener('DOMContentLoaded', () => {
    const themeSelect = document.getElementById('themeSelect');
    const statusMsg = document.getElementById('statusMsg');

    // Load saved theme
    chrome.storage.local.get(['justinTheme'], (result) => {
        if (result.justinTheme) {
            themeSelect.value = result.justinTheme;
        }
    });

    // Save theme on change
    themeSelect.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        chrome.storage.local.set({ justinTheme: selectedTheme }, () => {
            statusMsg.textContent = 'Settings saved!';
            setTimeout(() => { statusMsg.textContent = ''; }, 2000);
        });
    });
});