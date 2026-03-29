let activeCommand = '/ask'; 
let conversationHistory = []; 

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['justinHistory'], function(result) {
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
            div.innerText = msg.content;
        }
        box.appendChild(div);
    });
    
    box.scrollTop = box.scrollHeight;
}

function parseMarkdown(text) {
    let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    html = html.replace(/\[TERMINAL:\s*([^\]]+)\]/g, function(match, cmd) {
        const cleanCmd = cmd.trim();
        const encodedCmd = encodeURIComponent(cleanCmd);
        const termSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;
        return `<div class="terminal-block">
                    <div class="terminal-cmd">$ ${cleanCmd}</div>
                    <button class="terminal-btn" data-cmd="${encodedCmd}">${termSvg} Run in VS Code</button>
                </div>`;
    });

    html = html.replace(/\[FILE:\s*([^\]]+)\]\s*```(\w*)\n([\s\S]*?)```/g, function(match, filename, language, code) {
        const rawCode = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const encodedCode = encodeURIComponent(rawCode);
        const cleanFile = filename.trim();
        const fileSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
        const zapSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
        const header = `
            <div class="code-header">
                <span style="display:flex; align-items:center;">${fileSvg} ${cleanFile}</span>
                <button class="apply-file-btn" style="display:flex; align-items:center;" data-filename="${cleanFile}" data-code="${encodedCode}">
                    ${zapSvg} Apply File
                </button>
            </div>`;
        return `<div class="code-block">${header}<pre><code>${code}</code></pre></div>`;
    });

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, language, code) {
        const langLabel = language ? `<span>${language}</span>` : '<span>CODE</span>';
        const rawCode = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const encodedCode = encodeURIComponent(rawCode);
        const header = `<div class="code-header">${langLabel}<button class="insert-btn" data-code="${encodedCode}">Insert at Cursor</button></div>`;
        return `<div class="code-block">${header}<pre><code>${code}</code></pre></div>`;
    });

    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    return html;
}

document.getElementById('responseBox').addEventListener('click', async (e) => {
    
    const termBtn = e.target.closest('.terminal-btn');
    if (termBtn) {
        const cmdToRun = decodeURIComponent(termBtn.getAttribute('data-cmd'));
        const originalHtml = termBtn.innerHTML;
        termBtn.innerHTML = 'Running...';
        try {
            const response = await fetch('http://localhost:4891', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'terminal', terminalCommand: cmdToRun })
            });
            if (response.ok) {
                termBtn.innerHTML = 'Executed!';
                termBtn.style.backgroundColor = '#4CAF50'; 
                setTimeout(() => { termBtn.innerHTML = originalHtml; termBtn.style.backgroundColor = '#795e26'; }, 2000);
            } else { throw new Error("Failed"); }
        } catch (error) {
            termBtn.innerHTML = 'Error';
            termBtn.style.backgroundColor = '#f44336'; 
            alert("Failed to run command. Make sure VS Code is open.");
        }
        return; 
    }

    const applyBtn = e.target.closest('.apply-file-btn');
    if (applyBtn) {
        const codeToInsert = decodeURIComponent(applyBtn.getAttribute('data-code'));
        const targetFile = applyBtn.getAttribute('data-filename');
        const originalHtml = applyBtn.innerHTML;
        applyBtn.innerHTML = 'Applying...';
        try {
            const response = await fetch('http://localhost:4891', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'apply_file', filename: targetFile, code: codeToInsert })
            });
            if (response.ok) {
                applyBtn.innerHTML = 'File Saved!';
                applyBtn.style.backgroundColor = '#4CAF50'; 
                setTimeout(() => { applyBtn.innerHTML = originalHtml; applyBtn.style.backgroundColor = '#D32F2F'; }, 2000);
            } else { throw new Error("Failed"); }
        } catch (error) {
            applyBtn.innerHTML = 'Error';
            applyBtn.style.backgroundColor = '#f44336'; 
            alert("Failed to write file. Make sure VS Code is open to a workspace directory.");
        }
        return;
    }

    if (e.target.classList.contains('insert-btn')) {
        const codeToInsert = decodeURIComponent(e.target.getAttribute('data-code'));
        const btn = e.target;
        btn.innerText = 'Inserting...';
        try {
            const response = await fetch('http://localhost:4891', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'insert', code: codeToInsert })
            });
            if (response.ok) {
                btn.innerText = 'Inserted!';
                btn.style.backgroundColor = '#4CAF50'; 
                setTimeout(() => { btn.innerText = 'Insert at Cursor'; btn.style.backgroundColor = '#0e639c'; }, 2000);
            } else { throw new Error("Failed"); }
        } catch (error) {
            btn.innerText = 'Error';
            btn.style.backgroundColor = '#f44336'; 
            alert("Failed to insert code. Is your VS Code Sandbox open and active?");
        }
        return;
    }

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
        const rawMd = decodeURIComponent(copyBtn.getAttribute('data-raw'));
        try {
            await navigator.clipboard.writeText(rawMd);
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span style="color: #4CAF50;">Copied!</span>';
            setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 2000);
        } catch (err) { alert("Failed to copy to clipboard."); }
    }
});

// Switch tool visually and logically
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
    btn.addEventListener('click', (e) => {
        switchTool(e.target.getAttribute('data-cmd'));
    });
});

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) { alert("Chrome is hiding this page from me."); return; }
        if (!tab.url.startsWith('http')) { alert("I can't read this specific type of page."); return; }

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const selection = window.getSelection().toString();
                if (selection) return `Ticket Title: ${document.title}\n\nSelected Text:\n${selection}`;
                const jiraDesc = document.querySelector('[data-test-id="issue.views.field.rich-text.description"]');
                if (jiraDesc) return `Ticket: ${document.title}\n\nDescription:\n${jiraDesc.innerText}`;
                const adoDesc = document.querySelector('.work-item-form-main') || document.querySelector('.html-field');
                if (adoDesc) return `Ticket: ${document.title}\n\nDescription:\n${adoDesc.innerText}`;
                return `Ticket: ${document.title}\n\n(Could not automatically find the description. Please highlight and click 'Auto-Read' again!)`;
            }
        }, (results) => {
            if (chrome.runtime.lastError) { alert("Chrome blocked me from reading this page."); return; }
            if (results && results[0] && results[0].result) { document.getElementById('taskInput').value = results[0].result; }
        });
    } catch (error) { console.error("Scraping error:", error); }
});

// --- NEW: THE ELEMENT PICKER LOGIC ---
document.getElementById('inspectBtn').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.startsWith('http')) { 
            alert("Cannot inspect this system page."); 
            return; 
        }

        // Change the button text so the user knows it's working
        const inspectBtn = document.getElementById('inspectBtn');
        const originalHtml = inspectBtn.innerHTML;
        inspectBtn.innerHTML = `<span style="color: #fff; font-weight: bold;">Hover over the page!</span>`;

        // Inject the tracking script into the active tab
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Prevent duplicate injections
                if (window.__justinPicking) return;
                window.__justinPicking = true;

                // Create the highlighting box
                const overlay = document.createElement('div');
                overlay.id = 'justin-inspect-overlay';
                overlay.style.position = 'fixed';
                overlay.style.pointerEvents = 'none'; // Lets clicks pass through to the element
                overlay.style.zIndex = '2147483647'; // Maximum possible z-index
                overlay.style.backgroundColor = 'rgba(78, 201, 176, 0.3)'; // VS Code Green tint
                overlay.style.border = '2px solid #4EC9B0';
                overlay.style.transition = 'top 0.05s, left 0.05s, width 0.05s, height 0.05s';
                document.body.appendChild(overlay);

                // Make the box follow the mouse
                const moveHandler = (e) => {
                    const target = e.target;
                    const rect = target.getBoundingClientRect();
                    overlay.style.top = rect.top + 'px';
                    overlay.style.left = rect.left + 'px';
                    overlay.style.width = rect.width + 'px';
                    overlay.style.height = rect.height + 'px';
                };

                // When they finally click an element
                const clickHandler = (e) => {
                    e.preventDefault(); // Stop links from actually opening
                    e.stopPropagation();
                    
                    // Cleanup our mess
                    document.removeEventListener('mousemove', moveHandler);
                    document.removeEventListener('click', clickHandler, true);
                    overlay.remove();
                    window.__justinPicking = false;

                    const target = e.target;
                    let htmlSnippet = target.outerHTML;
                    
                    // Cap the size so we don't blow up the AI token limit if they click the entire <body> tag
                    if (htmlSnippet.length > 2000) {
                        htmlSnippet = htmlSnippet.substring(0, 2000) + '\n...[TRUNCATED]';
                    }

                    // Beam it back to the Side Panel!
                    chrome.runtime.sendMessage({ 
                        action: 'ELEMENT_PICKED', 
                        data: `I clicked this element on the page. Look at my open files, find where this lives in the codebase, and tell me how to fix/edit it:\n\n\`\`\`html\n${htmlSnippet}\n\`\`\`` 
                    });
                };

                document.addEventListener('mousemove', moveHandler);
                document.addEventListener('click', clickHandler, true); // True = capturing phase, intercepts early
            }
        });

        // Reset the button visual after 2 seconds
        setTimeout(() => { inspectBtn.innerHTML = originalHtml; }, 2000);

    } catch (error) { 
        console.error("Inspect error:", error); 
    }
});

// --- NEW: LISTEN FOR THE ELEMENT DATA ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ELEMENT_PICKED') {
        // Automatically switch Justin's tool to 'Debug' mode
        switchTool('/debug');
        // Drop the HTML snippet straight into the prompt box!
        document.getElementById('taskInput').value = message.data;
    }
});


document.getElementById('sendBtn').addEventListener('click', async () => {
  const taskText = document.getElementById('taskInput').value.trim();
  const sendBtn = document.getElementById('sendBtn');

  if (!taskText && activeCommand !== '/review') { alert("Please enter some details for Justin to work with."); return; }

  const fullPrompt = `${activeCommand} ${taskText}`.trim();

  conversationHistory.push({ role: 'user', content: fullPrompt });
  renderChat();
  document.getElementById('taskInput').value = ''; 

  sendBtn.disabled = true;
  sendBtn.innerText = "Justin is thinking...";
  
  try {
      const response = await fetch('http://localhost:4891', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: fullPrompt, history: conversationHistory.slice(0, -1) })
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
          conversationHistory.push({ role: 'assistant', content: data.text });
          renderChat();
          chrome.storage.local.set({ justinHistory: conversationHistory });
      } else {
          alert("Error: " + (data.message || "Failed to get response"));
      }
  } catch (error) {
      console.error(error);
      alert("Error connecting to VS Code. Make sure Justin is awake on port 4891!");
  } finally {
      sendBtn.disabled = false;
      sendBtn.innerText = "Submit";
  }
});