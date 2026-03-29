let activeCommand = '/ask'; 
let conversationHistory = []; 
let isConnected = false;
let activeStreamController = null; 

const NOTIFICATION_TIMEOUT = 2000; 

// --- SVG Icons for Buttons ---
const fileSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
const zapSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const termSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;

// --- 1. CONNECTION STATE MACHINE ---
const ConnectionUI = {
    update: (online) => {
        const statusDiv = document.getElementById('connectionStatus');
        const statusText = statusDiv?.querySelector('.status-text');
        const sendBtn = document.getElementById('sendBtn');
        
        isConnected = online;

        if (online) {
            statusDiv?.classList.add('online');
            if (statusText) statusText.innerText = 'Connected to VS Code';
            if (sendBtn && !activeStreamController) {
                sendBtn.innerText = 'Submit';
                sendBtn.disabled = false;
            }
        } else {
            statusDiv?.classList.remove('online');
            if (statusText) statusText.innerText = 'Offline';
            if (sendBtn && !activeStreamController) {
                sendBtn.innerText = 'Start VS Code Sandbox!';
                sendBtn.disabled = true;
            }
        }
    }
};

// Recursive heartbeat avoids overlapping requests and eliminates the need for setInterval
async function monitorConnection() {
    try {
        const response = await fetch('http://localhost:4891/ping', { 
            method: 'GET',
            signal: AbortSignal.timeout(2000) 
        });
        ConnectionUI.update(response.ok);
    } catch (e) {
        ConnectionUI.update(false);
    }
    setTimeout(monitorConnection, 5000);
}

// --- 2. THEME ENGINE & INIT ---
function applyTheme(theme) {
    if (theme === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'dark');
}

chrome.storage.onChanged.addListener((changes) => {
    if (changes.justinTheme) applyTheme(changes.justinTheme.newValue);
});

document.addEventListener('DOMContentLoaded', () => {
    monitorConnection();

    chrome.storage.local.get(['justinHistory', 'justinTheme'], function(result) {
        applyTheme(result.justinTheme || 'dark'); 
        if (result.justinHistory && result.justinHistory.length > 0) {
            conversationHistory = result.justinHistory;
            renderChat();
        }
    });
});

document.getElementById('clearBtn').addEventListener('click', () => {
    conversationHistory = [];
    chrome.storage.local.remove('justinHistory');
    renderChat();
});

// --- 3. RENDER ENGINE ---
function renderChat() {
    const box = document.getElementById('responseBox');
    box.innerHTML = '';
    
    if (conversationHistory.length === 0) {
        document.getElementById('responseHeader').style.display = 'none';
        return;
    }
    document.getElementById('responseHeader').style.display = 'flex';

    conversationHistory.forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-msg msg-${msg.role}`;
        
        if (msg.role === 'assistant') {
            const encodedRawMd = encodeURIComponent(msg.content);
            const bubbleHeader = `
                <div class="bubble-header">
                    <span class="bubble-name">Justin-Qase</span>
                    <button class="copy-btn" data-raw="${encodedRawMd}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy MD
                    </button>
                </div>
            `;
            div.innerHTML = bubbleHeader + parseMarkdown(msg.content);
        } else {
            // Clean Command Parsing for User messages
            const commandLabels = { '/ask': 'Ask', '/review': 'Review', '/debug': 'Debug', '/story': 'Story' };
            const cmdMatch = msg.content.match(/^(\/\w+)\s*/);
            
            if (cmdMatch && commandLabels[cmdMatch[1]]) {
                const label = commandLabels[cmdMatch[1]];
                const bodyText = msg.content.slice(cmdMatch[0].length).trim();
                div.innerHTML = `<span class="cmd-badge">${label}</span>${bodyText ? `<span class="cmd-body">${bodyText}</span>` : ''}`;
            } else {
                div.innerText = msg.content;
            }
        }
        box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
}

// --- 4. BULLETPROOF MARKDOWN PARSER (XSS SECURED) ---
function parseMarkdown(text) {
    const rawHtml = DOMPurify.sanitize(marked.parse(text));
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    doc.querySelectorAll('p').forEach(p => {
        const termMatch = p.innerText.match(/\[TERMINAL:\s*([^\]]+)\]/);
        if (termMatch) {
            const cleanCmd = termMatch[1].trim();
            const encodedCmd = encodeURIComponent(cleanCmd);
            const div = document.createElement('div');
            div.className = 'terminal-block';
            div.innerHTML = `
                <div class="terminal-cmd">$ ${cleanCmd}</div>
                <button class="terminal-btn" data-cmd="${encodedCmd}">${termSvg} Stage in Terminal</button>
            `;
            p.replaceWith(div);
        }
    });

    doc.querySelectorAll('pre').forEach(pre => {
        const codeEl = pre.querySelector('code');
        if (!codeEl) return;
        
        const rawCode = codeEl.innerText;
        const encodedCode = encodeURIComponent(rawCode);
        
        let language = 'CODE';
        codeEl.classList.forEach(cls => {
            if (cls.startsWith('language-')) language = cls.replace('language-', '');
        });

        let prev = pre.previousElementSibling;
        let filename = null;
        if (prev && prev.tagName === 'P') {
            const fileMatch = prev.innerText.match(/\[FILE:\s*([^\]]+)\]/);
            if (fileMatch) {
                filename = fileMatch[1].trim();
                prev.remove(); 
            }
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block';
        const header = document.createElement('div');
        header.className = 'code-header';
        
        if (filename) {
            header.innerHTML = `
                <span style="display:flex; align-items:center; color: #fff;">${fileSvg} ${filename}</span>
                <button class="apply-file-btn" data-filename="${filename}" data-code="${encodedCode}">
                    ${zapSvg} Apply
                </button>
            `;
        } else {
            header.innerHTML = `
                <span style="color: #fff; text-transform: uppercase;">${language}</span>
                <button class="insert-btn" data-code="${encodedCode}">Insert</button>
            `;
        }
        
        wrapper.appendChild(header);
        wrapper.appendChild(pre.cloneNode(true));
        pre.replaceWith(wrapper);
    });

    return doc.body.innerHTML;
}

// --- 5. ACTION BUTTON CONTROLLER ---
async function sendToVSCode(payload, btn, loadingText, successText) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = loadingText;
    try {
        const response = await fetch('http://localhost:4891', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            btn.innerHTML = successText;
            btn.style.backgroundColor = '#10b981'; 
            setTimeout(() => { btn.innerHTML = originalHtml; btn.style.backgroundColor = ''; }, NOTIFICATION_TIMEOUT);
        } else { throw new Error("Failed"); }
    } catch (error) {
        btn.innerHTML = 'Error';
        btn.style.backgroundColor = '#ef4444'; 
        setTimeout(() => { btn.innerHTML = originalHtml; btn.style.backgroundColor = ''; }, NOTIFICATION_TIMEOUT);
        console.error("VS Code API Error:", error);
    }
}

document.getElementById('responseBox').addEventListener('click', (e) => {
    const termBtn = e.target.closest('.terminal-btn');
    if (termBtn) {
        const cmdToRun = decodeURIComponent(termBtn.getAttribute('data-cmd'));
        sendToVSCode({ command: 'terminal', terminalCommand: cmdToRun }, termBtn, 'Staging...', 'Staged!');
        return; 
    }

    const applyBtn = e.target.closest('.apply-file-btn');
    if (applyBtn) {
        const codeToInsert = decodeURIComponent(applyBtn.getAttribute('data-code'));
        const targetFile = applyBtn.getAttribute('data-filename');
        sendToVSCode({ command: 'apply_file', filename: targetFile, code: codeToInsert }, applyBtn, 'Applying...', 'File Saved!');
        return;
    }

    if (e.target.classList.contains('insert-btn')) {
        const btn = e.target;
        const codeToInsert = decodeURIComponent(btn.getAttribute('data-code'));
        sendToVSCode({ command: 'insert', code: codeToInsert }, btn, 'Inserting...', 'Inserted!');
        return;
    }

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
        const rawMd = decodeURIComponent(copyBtn.getAttribute('data-raw'));
        navigator.clipboard.writeText(rawMd).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span style="color: #10b981;">Copied!</span>';
            setTimeout(() => { copyBtn.innerHTML = originalHTML; }, NOTIFICATION_TIMEOUT);
        }).catch(err => console.error("Clipboard error:", err));
    }
});

// --- 6. TOOLS & SCRAPERS ---
function switchTool(commandStr) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btnToActive = document.querySelector(`.tool-btn[data-cmd="${commandStr}"]`);
    if (btnToActive) btnToActive.classList.add('active');
    
    activeCommand = commandStr;
    const input = document.getElementById('taskInput');
    if (activeCommand === '/review') input.placeholder = "(Optional) Tell Justin what specific file or issue to focus on...";
    else if (activeCommand === '/debug') input.placeholder = "Paste your error log or describe the bug here...";
    else if (activeCommand === '/story') input.placeholder = "Paste your Jira or Azure DevOps ticket here...";
    else input.placeholder = "Ask Justin a general question or paste context here...";
}

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { switchTool(e.target.getAttribute('data-cmd')); });
});

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const selection = window.getSelection().toString();
                if (selection) return `Ticket Title: ${document.title}\n\nSelected Text:\n${selection}`;
                const jiraDesc = document.querySelector('[data-test-id="issue.views.field.rich-text.description"]');
                if (jiraDesc) return `Ticket: ${document.title}\n\nDescription:\n${jiraDesc.innerText}`;
                const adoDesc = document.querySelector('.work-item-form-main') || document.querySelector('.html-field');
                if (adoDesc) return `Ticket: ${document.title}\n\nDescription:\n${adoDesc.innerText}`;
                return `Ticket: ${document.title}\n\n(Could not find description. Please highlight and click 'Auto-Read' again!)`;
            }
        }, (results) => {
            if (results && results[0] && results[0].result) { document.getElementById('taskInput').value = results[0].result; }
        });
    } catch (error) {}
});

document.getElementById('inspectBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.startsWith('http')) { alert("Cannot inspect this system page."); return; }

        const inspectBtn = document.getElementById('inspectBtn');
        const originalHtml = inspectBtn.innerHTML;
        inspectBtn.innerHTML = `<span style="color: #fff; font-weight: bold;">Hover over the page!</span>`;

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__justinPicking) return;
                window.__justinPicking = true;

                const overlay = document.createElement('div');
                overlay.id = 'justin-inspect-overlay';
                overlay.style.position = 'fixed';
                overlay.style.pointerEvents = 'none'; 
                overlay.style.zIndex = '2147483647'; 
                overlay.style.backgroundColor = 'rgba(14, 165, 233, 0.2)'; 
                overlay.style.border = '2px solid #0ea5e9';
                document.body.appendChild(overlay);

                const moveHandler = (e) => {
                    const rect = e.target.getBoundingClientRect();
                    overlay.style.top = rect.top + 'px';
                    overlay.style.left = rect.left + 'px';
                    overlay.style.width = rect.width + 'px';
                    overlay.style.height = rect.height + 'px';
                };

                const clickHandler = (e) => {
                    e.preventDefault(); 
                    e.stopPropagation();
                    
                    document.removeEventListener('mousemove', moveHandler);
                    document.removeEventListener('click', clickHandler, true);
                    overlay.remove();
                    window.__justinPicking = false;

                    const currentUrl = window.location.href;
                    const currentPath = window.location.pathname;

                    let clone = e.target.cloneNode(true);
                    clone.querySelectorAll('svg, path, circle, rect, polygon').forEach(el => {
                        const span = document.createElement('span');
                        span.innerText = '[SVG ICON REMOVED]';
                        el.replaceWith(span);
                    });
                    clone.querySelectorAll('img').forEach(img => {
                        if (img.src && img.src.startsWith('data:image')) img.setAttribute('src', '[BASE64 DATA REMOVED]');
                    });
                    clone.querySelectorAll('*').forEach(el => {
                        if (el.hasAttribute('style') && el.getAttribute('style').length > 50) {
                            el.setAttribute('style', '[INLINE STYLES REMOVED]');
                        }
                    });

                    let htmlSnippet = clone.outerHTML;
                    if (htmlSnippet.length > 2000) { htmlSnippet = htmlSnippet.substring(0, 2000) + '\n...[TRUNCATED]'; }

                    chrome.runtime.sendMessage({ 
                        action: 'ELEMENT_PICKED', 
                        data: `I clicked a visual element on my live web app. 
                        
Current URL: ${currentUrl}
Current Route: ${currentPath}

Using my Project Architecture Map, cross-reference this routing path with my directory structure to figure out which page component I am looking at. Then, look at the HTML snippet below and tell me exactly which file (and roughly what line or sub-component) I need to open to edit this element:

\`\`\`html
${htmlSnippet}
\`\`\`` 
                    });
                };

                document.addEventListener('mousemove', moveHandler);
                document.addEventListener('click', clickHandler, true); 
            }
        });
        setTimeout(() => { inspectBtn.innerHTML = originalHtml; }, NOTIFICATION_TIMEOUT);
    } catch (error) {}
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'ELEMENT_PICKED') {
        switchTool('/debug');
        document.getElementById('taskInput').value = message.data;
    }
});

// --- 7. STREAMING CLIENT ---
document.getElementById('sendBtn').addEventListener('click', async () => {
    const sendBtn = document.getElementById('sendBtn');

    if (sendBtn.innerText === 'Stop talking...') {
        if (activeStreamController) {
            activeStreamController.abort();
            activeStreamController = null;
        }
        sendBtn.innerText = "Submit";
        sendBtn.disabled = false;
        return;
    }

    const taskText = document.getElementById('taskInput').value.trim();
    if (!taskText && activeCommand !== '/review') { alert("Please enter some details."); return; }

    const fullPrompt = `${activeCommand} ${taskText}`.trim();
    conversationHistory.push({ role: 'user', content: fullPrompt });
    conversationHistory.push({ role: 'assistant', content: "" });
    const msgIndex = conversationHistory.length - 1;
    
    renderChat();
    document.getElementById('taskInput').value = ''; 

    sendBtn.innerText = "Stop talking...";
    activeStreamController = new AbortController();

    const streamTimeout = setTimeout(() => {
        if (activeStreamController) {
            activeStreamController.abort();
            activeStreamController = null;
        }
        conversationHistory[msgIndex].content += "\n\n*[Timed out waiting for VS Code chat response]*";
        renderChat();
        chrome.storage.local.set({ justinHistory: conversationHistory });
        if (isConnected) {
            sendBtn.innerText = "Submit";
            sendBtn.disabled = false;
        }
    }, 90000);

    try {
        const response = await fetch('http://localhost:4891', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: fullPrompt, history: conversationHistory.slice(0, -2) }),
            signal: activeStreamController.signal
        });

        if (!response.ok) throw new Error("Connection failed");
        ConnectionUI.update(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
                const message = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                
                if (message.startsWith('data: ')) {
                    const dataStr = message.slice(6);
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === 'chunk') {
                            conversationHistory[msgIndex].content += data.text;
                            renderChat(); 
                        } else if (data.type === 'done') {
                            chrome.storage.local.set({ justinHistory: conversationHistory });
                        }
                    } catch(e) { } 
                }
                boundary = buffer.indexOf('\n\n');
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted by user.');
            conversationHistory[msgIndex].content += "\n\n*[Interrupted by user]*";
            renderChat();
            chrome.storage.local.set({ justinHistory: conversationHistory });
        } else {
            ConnectionUI.update(false);
            console.error(error);
        }
    } finally {
        clearTimeout(streamTimeout);
        activeStreamController = null;
        if (isConnected) {
            sendBtn.innerText = "Submit";
            sendBtn.disabled = false;
        } else {
            sendBtn.innerText = "Start VS Code Sandbox!";
            sendBtn.disabled = true;
        }
    }
});