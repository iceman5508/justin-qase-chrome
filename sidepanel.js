let activeCommand = '/ask'; 
let conversationHistory = []; 
let isConnected = false;
let sockets = new Map(); 
let activeSocketPort = null; 

const NOTIFICATION_TIMEOUT = 2000; 

const fileSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
const zapSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const termSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;

const ConnectionUI = {
    update: () => {
        const isOnline = sockets.size > 0;
        const statusDiv = document.getElementById('connectionStatus');
        const statusText = statusDiv?.querySelector('.status-text');
        const sendBtn = document.getElementById('sendBtn');
        
        isConnected = isOnline;

        if (isOnline) {
            statusDiv?.classList.add('online');
            if (statusText) statusText.innerText = `Connected (${sockets.size} Workspace${sockets.size > 1 ? 's' : ''})`;
            if (sendBtn && sendBtn.innerText !== 'Stop talking...') {
                sendBtn.innerText = 'Submit';
                sendBtn.disabled = false;
            }
        } else {
            statusDiv?.classList.remove('online');
            if (statusText) statusText.innerText = 'Offline';
            if (sendBtn && sendBtn.innerText !== 'Stop talking...') {
                sendBtn.innerText = 'Start VS Code Sandbox!';
                sendBtn.disabled = true;
            }
        }
    }
};

function connectToMesh(port) {
    if (sockets.has(port)) return;

    let ws = new WebSocket(`ws://localhost:${port}`);
    
    ws.onopen = () => { 
        sockets.set(port, ws);
        ConnectionUI.update(); 
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'window_focused' && data.focused) {
            activeSocketPort = port;
            return; 
        }

        if (port !== activeSocketPort && activeSocketPort !== null) return;

        const msgIndex = conversationHistory.length - 1;

        if (data.type === 'progress') {
            const sendBtn = document.getElementById('sendBtn');
            sendBtn.innerText = `[ ${data.text} ]`;
        } 
        else if (data.type === 'chunk') {
            conversationHistory[msgIndex].content += data.text;
            renderChat();
        } 
        else if (data.type === 'button') {
            const encodedCmd = encodeURIComponent(data.cmd);
            const btnHtml = `\n\n<div class="terminal-block"><div class="terminal-cmd">$ ${data.cmd}</div><button class="terminal-btn" data-cmd="${encodedCmd}">${termSvg} ${data.label}</button></div>\n\n`;
            conversationHistory[msgIndex].content += btnHtml;
            renderChat();
        }
        else if (data.type === 'done') {
            chrome.storage.local.set({ justinHistory: conversationHistory });
            const sendBtn = document.getElementById('sendBtn');
            sendBtn.innerText = "Submit";
            sendBtn.disabled = false;
        }
        else if (data.type === 'textEdit') {
            // Targeted edit from the VS Code tool dispatch — use oldString/newString
            // rather than a full file overwrite so Chrome parity matches VS Code behaviour
            const encodedOld = encodeURIComponent(data.oldString);
            const encodedNew = encodeURIComponent(data.newString);
            const encodedPath = encodeURIComponent(data.filePath);
            const card = `\n\n<div class="code-block"><div class="code-header"><span style="display:flex;align-items:center;color:#fff">${fileSvg} ${data.filePath}</span><button class="apply-file-btn" data-edit-path="${encodedPath}" data-edit-old="${encodedOld}" data-edit-new="${encodedNew}">${zapSvg} Apply Edit</button></div><pre><code>${escapeHtml(data.newString)}</code></pre></div>\n\n`;
            conversationHistory[msgIndex].content += card;
            renderChat();
        }
    };

    ws.onclose = () => {
        sockets.delete(port);
        if (activeSocketPort === port) activeSocketPort = null;
        ConnectionUI.update();
        setTimeout(() => connectToMesh(port), 3000); 
    };

    ws.onerror = () => { ws.close(); };
}

function bootMesh() {
    for (let i = 4891; i <= 4895; i++) {
        connectToMesh(i);
    }
}

function applyTheme(theme) {
    if (theme === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'dark');
}

chrome.storage.onChanged.addListener((changes) => {
    if (changes.justinTheme) applyTheme(changes.justinTheme.newValue);
});

document.addEventListener('DOMContentLoaded', () => {
    bootMesh(); 
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

function parseMarkdown(text) {
    const rawHtml = DOMPurify.sanitize(marked.parse(text));
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    doc.querySelectorAll('p').forEach(p => {
        // Legacy [TERMINAL: cmd] text protocol — kept for backwards compatibility with
        // old cached responses. New responses use the 'button' WebSocket message type.
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

        // Legacy [FILE: path] text protocol — kept for backwards compatibility with
        // old cached responses. New responses use the apply_file button type.
        let prev = pre.previousElementSibling;
        let filename = null;
        if (prev && prev.tagName === 'P') {
            const fileMatch = prev.innerText.match(/\[FILE:\s*([^\]]+)\]/);
            if (fileMatch) { filename = fileMatch[1].trim(); prev.remove(); }
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block';
        const header = document.createElement('div');
        header.className = 'code-header';
        
        if (filename) {
            header.innerHTML = `<span style="display:flex; align-items:center; color: #fff;">${fileSvg} ${filename}</span><button class="apply-file-btn" data-filename="${filename}" data-code="${encodedCode}">${zapSvg} Apply</button>`;
        } else {
            header.innerHTML = `<span style="color: #fff; text-transform: uppercase;">${language}</span><button class="insert-btn" data-code="${encodedCode}">Insert</button>`;
        }
        
        wrapper.appendChild(header);
        wrapper.appendChild(pre.cloneNode(true));
        pre.replaceWith(wrapper);
    });

    return doc.body.innerHTML;
}

function sendToVSCode(payload, btn, loadingText, successText) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = loadingText;
    
    let targetWs = sockets.get(activeSocketPort);
    if (!targetWs && sockets.size > 0) targetWs = sockets.values().next().value; 
    
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify(payload));
        btn.innerHTML = successText;
        btn.style.backgroundColor = '#10b981'; 
        setTimeout(() => { btn.innerHTML = originalHtml; btn.style.backgroundColor = ''; }, 2000);
    } else {
        btn.innerHTML = 'Error';
        btn.style.backgroundColor = '#ef4444'; 
        setTimeout(() => { btn.innerHTML = originalHtml; btn.style.backgroundColor = ''; }, 2000);
    }
}

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.getElementById('responseBox').addEventListener('click', (e) => {
    const termBtn = e.target.closest('.terminal-btn');
    if (termBtn) return sendToVSCode({ action: 'execute_terminal', cmd: decodeURIComponent(termBtn.getAttribute('data-cmd')) }, termBtn, 'Staging...', 'Staged!');

    const applyBtn = e.target.closest('.apply-file-btn');
    if (applyBtn) {
        // Targeted edit (from justin_write_file via textEdit message) — use apply_edit
        if (applyBtn.hasAttribute('data-edit-path')) {
            return sendToVSCode({
                action: 'apply_edit',
                filePath: decodeURIComponent(applyBtn.getAttribute('data-edit-path')),
                oldString: decodeURIComponent(applyBtn.getAttribute('data-edit-old')),
                newString: decodeURIComponent(applyBtn.getAttribute('data-edit-new'))
            }, applyBtn, 'Applying...', 'Applied!');
        }
        // Legacy full-file overwrite (manually crafted apply_file blocks)
        return sendToVSCode({ action: 'apply_file', filename: applyBtn.getAttribute('data-filename'), code: decodeURIComponent(applyBtn.getAttribute('data-code')) }, applyBtn, 'Applying...', 'File Saved!');
    }

    if (e.target.classList.contains('insert-btn')) return sendToVSCode({ action: 'insert', code: decodeURIComponent(e.target.getAttribute('data-code')) }, e.target, 'Inserting...', 'Inserted!');

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
        navigator.clipboard.writeText(decodeURIComponent(copyBtn.getAttribute('data-raw'))).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span style="color: #10b981;">Copied!</span>';
            setTimeout(() => { copyBtn.innerHTML = originalHTML; }, NOTIFICATION_TIMEOUT);
        });
    }
});

function switchTool(commandStr) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btnToActive = document.querySelector(`.tool-btn[data-cmd="${commandStr}"]`);
    if (btnToActive) btnToActive.classList.add('active');
    
    activeCommand = commandStr;
    const input = document.getElementById('taskInput');
    if (activeCommand === '/review') input.placeholder = "(Optional) Tell Justin what specific file or issue to focus on...";
    else if (activeCommand === '/debug') input.placeholder = "Paste your error log or describe the bug here...";
    else if (activeCommand === '/story') input.placeholder = "Paste your ticket description here...";
    else input.placeholder = "Ask Justin a general question or paste context here...";
}

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { switchTool(e.target.getAttribute('data-cmd')); });
});

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;

        if (activeCommand === '/review') {
            const isGithubPR = tab.url.match(/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/);
            const isKallitheaPR = tab.url.includes('/pull-request/'); 
            
            if (isGithubPR || isKallitheaPR) {
                const diffExtension = isGithubPR ? '.diff' : '.patch'; 
                const originalHtml = document.getElementById('scrapeBtn').innerHTML;
                document.getElementById('scrapeBtn').innerHTML = 'Fetching Diff...';

                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    args: [diffExtension],
                    func: async (ext) => {
                        try {
                            const cleanUrl = window.location.href.split('?')[0].split('#')[0];
                          const response = await fetch(cleanUrl + ext, { 
                                credentials: 'include',
                                headers: {
                                    // Tell GitHub we specifically want the text diff, NOT the HTML page
                                    'Accept': 'application/vnd.github.v3.diff, text/plain, */*',
                                    'Cache-Control': 'no-cache'
                                }
                            });
                            
                            if (response.ok) {
                                return await response.text();
                            }
                            return null;
                        } catch (e) {
                            return null;
                        }
                    }
                }, (results) => {
                    document.getElementById('scrapeBtn').innerHTML = originalHtml;
                    
                    if (results && results[0] && results[0].result) {
                        const rawDiff = results[0].result;
                        let truncatedDiff = rawDiff.length > 25000 ? rawDiff.substring(0, 25000) + '\n...[DIFF TRUNCATED]' : rawDiff;
                        document.getElementById('taskInput').value = `Please review these uncommitted changes from my PR:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;
                    } else {
                        document.getElementById('taskInput').value = `Review this PR: ${tab.url}`;
                    }
                });
                return;
            }
        }

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
        }, (results) => { if (results && results[0] && results[0].result) document.getElementById('taskInput').value = results[0].result; });
    } catch (error) {}
});

document.getElementById('inspectBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.startsWith('http')) { alert("Cannot inspect this system page."); return; }

        const inspectBtn = document.getElementById('inspectBtn');
        const originalHtml = inspectBtn.innerHTML;

        // Guard: don't start a second inspector if one is already active
        if (inspectBtn.dataset.picking === 'true') return;
        inspectBtn.dataset.picking = 'true';
        inspectBtn.innerHTML = `<span style="color:#fff;font-weight:bold;">Picking… (Esc to cancel)</span>`;
        inspectBtn.style.backgroundColor = 'var(--accent-blue)';

        const resetBtn = () => {
            inspectBtn.innerHTML = originalHtml;
            inspectBtn.style.backgroundColor = '';
            inspectBtn.dataset.picking = 'false';
        };

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                if (window.__justinPicking) return;
                window.__justinPicking = true;

                const overlay = document.createElement('div');
                overlay.style = "position:fixed;pointer-events:none;z-index:2147483647;background:rgba(14,165,233,0.2);border:2px solid #0ea5e9;border-radius:2px;transition:all 0.05s;";
                document.body.appendChild(overlay);

                const cleanup = (cancelled) => {
                    document.removeEventListener('mousemove', moveHandler);
                    document.removeEventListener('click', clickHandler, true);
                    document.removeEventListener('keydown', keyHandler, true);
                    overlay.remove();
                    window.__justinPicking = false;
                    if (cancelled) chrome.runtime.sendMessage({ action: 'ELEMENT_PICK_CANCELLED' });
                };

                const moveHandler = (e) => {
                    const r = e.target.getBoundingClientRect();
                    overlay.style.top=r.top+'px'; overlay.style.left=r.left+'px'; overlay.style.width=r.width+'px'; overlay.style.height=r.height+'px';
                };

                const keyHandler = (e) => {
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(true); }
                };

                const clickHandler = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    cleanup(false);

                    let target = e.target;
                    let frameworkComponent = "Unknown Component";
                    
                    let curr = target;
                    while (curr && curr !== document.body) {
                        if (curr.__vueParentComponent) {
                            frameworkComponent = curr.__vueParentComponent.type.__file || curr.__vueParentComponent.type.name || "Vue Component";
                            break;
                        }
                        const reactKey = Object.keys(curr).find(k => k.startsWith('__reactFiber$'));
                        if (reactKey && curr[reactKey].return?.elementType?.name) {
                            frameworkComponent = curr[reactKey].return.elementType.name;
                            break;
                        }
                        curr = curr.parentElement;
                    }

                    let clone = target.cloneNode(true);
                    clone.querySelectorAll('svg, path').forEach(el => el.replaceWith('[SVG]'));
                    let htmlSnippet = clone.outerHTML.substring(0, 1000);

                    chrome.runtime.sendMessage({ 
                        action: 'ELEMENT_PICKED', 
                        data: `/debug I clicked an element inside what appears to be the \`${frameworkComponent}\` component.\n\nHere is the raw HTML:\n\`\`\`html\n${htmlSnippet}\n\`\`\`\n\nUse \`copilot_codebase\` to search for this component in the workspace, then read the file with \`justin_read_file\` before editing.` 
                    });
                };

                document.addEventListener('mousemove', moveHandler);
                document.addEventListener('keydown', keyHandler, true);
                document.addEventListener('click', clickHandler, true); 
            }
        });

        // Button resets only when the pick completes or is cancelled — handled via message listener below
        const cancelListener = (message) => {
            if (message.action === 'ELEMENT_PICKED' || message.action === 'ELEMENT_PICK_CANCELLED') {
                resetBtn();
                chrome.runtime.onMessage.removeListener(cancelListener);
            }
        };
        chrome.runtime.onMessage.addListener(cancelListener);

    } catch (error) { document.getElementById('inspectBtn').dataset.picking = 'false'; }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'ELEMENT_PICKED') {
        switchTool('/debug');
        document.getElementById('taskInput').value = message.data;
    }
    // ELEMENT_PICK_CANCELLED is handled inline in the inspectBtn listener — nothing to do here
});

document.getElementById('sendBtn').addEventListener('click', async () => {
    const sendBtn = document.getElementById('sendBtn');
    const taskText = document.getElementById('taskInput').value.trim();
    if (!taskText && activeCommand !== '/review') { alert("Please enter some details."); return; }

    if (activeCommand === '/review' && taskText.includes('github.com') && !taskText.includes('/pull/')) {
        alert("To review remote code, please provide a direct link to a Pull Request (e.g., .../pull/1), not the base repository.");
        return;
    }

    const fullPrompt = `${activeCommand} ${taskText}`.trim();
    conversationHistory.push({ role: 'user', content: fullPrompt }, { role: 'assistant', content: "" });
    renderChat();
    
    document.getElementById('taskInput').value = ''; 
    sendBtn.innerText = "Triggering VS Code...";
    sendBtn.disabled = true;

    let targetWs = sockets.get(activeSocketPort);
    if (!targetWs && sockets.size > 0) targetWs = sockets.values().next().value; 

    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ action: 'prompt', text: fullPrompt }));
    } else { 
        alert("VS Code is not connected."); 
        sendBtn.innerText = "Start VS Code Sandbox!"; 
    }
});