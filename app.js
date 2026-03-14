/**
 * 拷问 KaoWen — 纯前端版
 *
 * 无需 Flask 后端，直接从浏览器调用 OpenAI 兼容 API
 * API Key 仅保存在浏览器 localStorage 中
 */

// ── Provider presets ──
const PROVIDERS = {
  deepseek:    { url: 'https://api.deepseek.com/v1',           model: 'deepseek-chat' },
  openai:      { url: 'https://api.openai.com/v1',             model: 'gpt-5-mini' },
  siliconflow: { url: 'https://api.siliconflow.cn/v1',         model: 'Qwen/Qwen3-8B' },
  openrouter:  { url: 'https://openrouter.ai/api/v1',          model: 'deepseek/deepseek-chat' },
  groq:        { url: 'https://api.groq.com/openai/v1',        model: 'llama-3.3-70b-versatile' },
};

// ── 模型定价 (USD/1M tokens) ──
const PRICING = {
  'deepseek-chat':           { input: 0.14,  output: 0.28 },
  'deepseek-reasoner':       { input: 0.55,  output: 2.19 },
  'gpt-5-mini':              { input: 0.80,  output: 3.20 },
  'gpt-5':                   { input: 5.00,  output: 20.00 },
  'gpt-5-nano':              { input: 0.20,  output: 0.80 },
  'gpt-4o-mini':             { input: 0.15,  output: 0.60 },
  'gpt-4o':                  { input: 2.50,  output: 10.00 },
  'gpt-4.1-mini':            { input: 0.40,  output: 1.60 },
  'gpt-4.1-nano':            { input: 0.10,  output: 0.40 },
  'llama-3.3-70b-versatile': { input: 0.59,  output: 0.79 },
  'Qwen/Qwen3-8B':           { input: 0.0,   output: 0.0 },
  'deepseek/deepseek-chat':  { input: 0.14,  output: 0.28 },
};

// ── DOM refs ──
const textarea     = document.getElementById('decision-input');
const charCount    = document.getElementById('char-count');
const btnGo        = document.getElementById('btn-go');
const loadingEl    = document.getElementById('loading');
const resultsEl    = document.getElementById('results');
const errorEl      = document.getElementById('error-msg');
const settingsModal = document.getElementById('settings-modal');
const providerSel  = document.getElementById('provider');
const baseUrlInput = document.getElementById('base-url');
const apiKeyInput  = document.getElementById('api-key');
const modelInput   = document.getElementById('model-name');

// ── Build prompt ──
function buildPrompt(decision) {
  return `你是"拷问 KaoWen"决策压力测试系统。用户将描述一个他们正在纠结的决策，你需要扮演三个拷问官和一个主持人来审视这个决策。

## 你的角色（灵感来自多Agent辩论系统的ForumEngine机制）

### 拷问官1：风险猎人 🔴
- 人格：悲观主义者，专找隐患，像保险精算师一样思考
- 职责：找出决策中隐藏的风险、最坏情况、沉没成本、机会成本
- 语气：直接、不留情面、用数据说话

### 拷问官2：现实核查员 🟡
- 人格：怀疑论者，不信任未经验证的假设
- 职责：质疑用户的每一个假设、验证数据的真实性、指出认知偏差（如幸存者偏差、锚定效应、过度自信）
- 语气：冷静、追问式、苏格拉底式提问

### 拷问官3：机会侦察兵 🟢
- 人格：战略家，关注被忽略的可能性
- 职责：找出用户没想到的替代方案、优化路径、可以降低风险的折中方案
- 语气：建设性、启发式、"你考虑过...吗？"

### 主持人 🔵
- 职责（参照论坛主持人的6大职责）：
  1. 梳理三位拷问官的核心论点
  2. 找出共识和分歧
  3. 纠正任何事实错误或逻辑矛盾
  4. 给出一个综合评估（不是替用户做决定，而是帮用户看清全貌）
  5. 列出"做决策前你必须先搞清楚的3件事"

## 输出格式
严格按以下JSON格式输出，不要输出任何其他内容：

\`\`\`json
{
  "challengers": [
    {
      "id": "risk",
      "name": "风险猎人",
      "icon": "🔴",
      "points": [
        "第一个风险点（具体、有数据支撑）",
        "第二个风险点",
        "第三个风险点"
      ],
      "verdict": "一句话总结最核心的风险"
    },
    {
      "id": "reality",
      "name": "现实核查员",
      "icon": "🟡",
      "points": [
        "第一个质疑（指出具体的假设或认知偏差）",
        "第二个质疑",
        "第三个质疑"
      ],
      "verdict": "一句话总结最需要验证的假设"
    },
    {
      "id": "opportunity",
      "name": "机会侦察兵",
      "icon": "🟢",
      "points": [
        "第一个替代方案或优化建议",
        "第二个被忽略的可能性",
        "第三个降低风险的折中方案"
      ],
      "verdict": "一句话总结最值得探索的方向"
    }
  ],
  "moderator": {
    "summary": "综合三位拷问官的观点，对这个决策的整体评估（2-3句话）",
    "consensus": "三位拷问官的共识是什么",
    "conflict": "最大的分歧在哪里",
    "must_know": [
      "做决策前必须先搞清楚的事情1",
      "做决策前必须先搞清楚的事情2",
      "做决策前必须先搞清楚的事情3"
    ]
  }
}
\`\`\`

## 用户的决策：
${decision}`;
}

// ── Settings persistence (localStorage) ──
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('kaowen_settings') || '{}');
    if (s.provider) providerSel.value = s.provider;
    if (s.baseUrl)  baseUrlInput.value = s.baseUrl;
    if (s.apiKey)   apiKeyInput.value = s.apiKey;
    if (s.model)    modelInput.value = s.model;
  } catch (e) { /* ignore */ }
}

let pendingAnalyze = false;

function saveSettings() {
  const s = {
    provider: providerSel.value,
    baseUrl:  baseUrlInput.value.replace(/\/+$/, ''),
    apiKey:   apiKeyInput.value.trim(),
    model:    modelInput.value.trim(),
  };
  localStorage.setItem('kaowen_settings', JSON.stringify(s));
  closeSettings();
  if (pendingAnalyze) {
    pendingAnalyze = false;
    analyze();
  }
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('kaowen_settings') || '{}');
  } catch (e) { return {}; }
}

// ── Provider change → auto-fill ──
providerSel.addEventListener('change', () => {
  const key = providerSel.value;
  const p = PROVIDERS[key];
  if (p) {
    baseUrlInput.value = p.url;
    modelInput.value = p.model;
  }
});

// ── Settings modal ──
function openSettings() { settingsModal.classList.add('active'); }
function closeSettings() { settingsModal.classList.remove('active'); }

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('btn-save').addEventListener('click', saveSettings);
document.getElementById('btn-cancel').addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettings();
});

// ── Char count ──
textarea.addEventListener('input', () => {
  charCount.textContent = textarea.value.length + ' 字';
});

// ── Example chips ──
document.querySelectorAll('.example-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    textarea.value = chip.dataset.text;
    textarea.dispatchEvent(new Event('input'));
    textarea.focus();
  });
});

// ── Go button ──
btnGo.addEventListener('click', analyze);

// ── Loading animation ──
let loadingInterval = null;

function startLoading() {
  loadingEl.classList.add('active');
  resultsEl.classList.remove('active');
  errorEl.classList.remove('active');

  const steps = [1, 2, 3, 4];
  let current = 0;

  steps.forEach(s => {
    const el = document.getElementById('step-' + s);
    el.classList.remove('active', 'done');
    el.querySelector('.indicator').textContent = s;
  });

  function advance() {
    if (current > 0) {
      const prev = document.getElementById('step-' + steps[current - 1]);
      prev.classList.remove('active');
      prev.classList.add('done');
      prev.querySelector('.indicator').textContent = '✓';
    }
    if (current < steps.length) {
      document.getElementById('step-' + steps[current]).classList.add('active');
      current++;
    }
  }

  advance();
  loadingInterval = setInterval(() => {
    if (current < steps.length) advance();
  }, 3000);
}

function stopLoading() {
  clearInterval(loadingInterval);
  loadingEl.classList.remove('active');
}

// ── Core analysis — 直接调用 OpenAI 兼容 API ──
async function analyze() {
  const decision = textarea.value.trim();
  if (!decision) return;

  const settings = getSettings();
  if (!settings.apiKey || !settings.baseUrl) {
    pendingAnalyze = true;
    openSettings();
    return;
  }

  btnGo.disabled = true;
  btnGo.textContent = '拷问中...';
  startLoading();

  const t0 = performance.now();

  try {
    const baseUrl = settings.baseUrl.replace(/\/+$/, '');
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: buildPrompt(decision) }],
        max_completion_tokens: 3000,
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      const errMsg = body.error?.message || body.error || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    const content = body.choices?.[0]?.message?.content || '';

    // 估算成本
    const usage = body.usage;
    const p = PRICING[settings.model] || { input: 0, output: 0 };
    let cost = 0;
    if (usage) {
      cost = (
        (usage.prompt_tokens || 0) * p.input / 1_000_000
        + (usage.completion_tokens || 0) * p.output / 1_000_000
      );
    }

    // 解析 JSON
    let jsonStr = null;
    let m = content.match(/```json\s*([\s\S]*?)```/);
    if (m) {
      jsonStr = m[1];
    } else {
      m = content.match(/\{[\s\S]*"challengers"[\s\S]*\}/);
      if (m) jsonStr = m[0];
    }

    if (!jsonStr) {
      throw new Error('AI 返回格式异常，请重试');
    }

    const parsed = JSON.parse(jsonStr);

    stopLoading();
    renderResults(parsed, decision, elapsed, cost, {
      input: usage?.prompt_tokens || 0,
      output: usage?.completion_tokens || 0,
    });

  } catch (err) {
    stopLoading();
    errorEl.textContent = '拷问失败：' + err.message;
    errorEl.classList.add('active');
  } finally {
    btnGo.disabled = false;
    btnGo.textContent = '开始拷问';
  }
}

// ── Render results ──
function renderResults(data, decision, elapsed, cost, tokens) {
  const costStr = cost > 0 ? ` · $${cost.toFixed(4)}` : '';
  const tokenStr = tokens ? ` · ${tokens.input + tokens.output} tokens` : '';

  let html = `
    <div class="results-header">
      <h2>拷问结果</h2>
      <span class="results-meta">${elapsed}s${tokenStr}${costStr}</span>
    </div>
    <div class="decision-echo">${esc(decision)}</div>
  `;

  const roleDesc = {
    risk: '悲观主义者 · 专找隐患 · 像保险精算师一样思考',
    reality: '怀疑论者 · 质疑假设 · 苏格拉底式追问',
    opportunity: '战略家 · 发现被忽略的可能性 · 建设性视角',
  };

  for (const c of data.challengers) {
    html += `
      <div class="challenger ${c.id}">
        <div class="challenger-header">
          <div class="challenger-icon">${c.icon}</div>
          <div>
            <div class="challenger-name">${esc(c.name)}</div>
            <div class="challenger-role">${roleDesc[c.id] || ''}</div>
          </div>
        </div>
        <div class="challenger-content">
          <ul>
            ${c.points.map(p => `<li>${fmtPoint(p)}</li>`).join('')}
          </ul>
          <div class="verdict-key">${esc(c.verdict)}</div>
        </div>
      </div>
    `;
  }

  const mod = data.moderator;
  html += `
    <div class="moderator">
      <div class="moderator-label">主持人综合裁决</div>
      <div class="moderator-content">
        <p><strong>综合评估：</strong>${esc(mod.summary)}</p>
        <p><strong>共识：</strong>${esc(mod.consensus)}</p>
        <p><strong>最大分歧：</strong>${esc(mod.conflict)}</p>
        <p><strong>做决策前你必须先搞清楚：</strong></p>
        <ol>
          ${mod.must_know.map(item => `<li>${esc(item)}</li>`).join('')}
        </ol>
      </div>
    </div>
  `;

  html += `
    <div class="action-bar">
      <button class="btn-secondary" onclick="copyResults()">复制结果</button>
      <button class="btn-secondary" onclick="analyze()">换个角度重新拷问</button>
      <button class="btn-secondary" onclick="resetAll()">新的决策</button>
    </div>
  `;

  resultsEl.innerHTML = html;
  resultsEl.classList.add('active');
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Helpers ──
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function fmtPoint(text) {
  let s = esc(text);
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return s;
}

function copyResults() {
  const text = resultsEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = resultsEl.querySelector('.action-bar .btn-secondary');
    const orig = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

function resetAll() {
  textarea.value = '';
  textarea.dispatchEvent(new Event('input'));
  resultsEl.classList.remove('active');
  resultsEl.innerHTML = '';
  textarea.focus();
}

// ── Init ──
loadSettings();
