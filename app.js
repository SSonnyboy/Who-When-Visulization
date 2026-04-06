// ==================== 全局变量 ====================
let allData = [];
let filteredData = [];
let currentPage = 1;
let pageSize = 20;
let charts = {};
let currentDataset = 'all'; // 'all', 'algorithm', 'handcrafted'
const translationCache = new Map();
const translationDictionary = {
    'where': '哪里',
    'can': '能否',
    'i': '我',
    'take': '参加',
    'martial arts': '武术',
    'classes': '课程',
    'within': '在…范围内',
    'five-minute': '五分钟',
    'after work': '下班后',
    'step': '步骤',
    'error': '错误',
    'agent': 'Agent',
    'mistake': '失误',
    'reason': '原因',
    'question': '问题',
    'system': '系统',
    'task': '任务',
    'plan': '计划',
    'analysis': '分析',
    'process': '流程'
};
const levelLabelMap = {
    '1': 'Level 1',
    '2': 'Level 2',
    '3': 'Level 3',
    'n': 'Level n (未定义)'
};
let showChineseTranslation = false;
let currentFlowItem = null;
let currentFlowLinkKey = null;

// ==================== 数据加载 ====================
async function loadData() {
    try {
        // 方法1：尝试加载预加载的合并数据文件（推荐）
        try {
            console.log('尝试加载预加载数据文件...');
            const response = await fetch('all-data-cn.json');
            if (response.ok) {
                allData = normalizeDataset(await response.json());
                filteredData = [...allData];
                console.log(`成功从预加载文件加载 ${allData.length} 个案例`);
                initializeDashboard();
                return;
            }
        } catch (e) {
            console.log('all-data-cn 未准备好，尝试加载原始数据版本...');
        }
        
        // 方法2：加载原始数据文件
        console.log('开始加载原始数据文件...');
        const algorithmFiles = Array.from({ length: 126 }, (_, i) => i + 1);
        const handcraftedFiles = Array.from({ length: 58 }, (_, i) => i + 1);
        
        // 加载所有数据文件
        const loadPromises = [];
        
        algorithmFiles.forEach(fileNum => {
            loadPromises.push(
                fetch(`../data/Algorithm-Generated/${fileNum}.json`)
                    .then(res => {
                        if (!res.ok) return null;
                        return res.json().then(data => ({ ...data, dataset: 'algorithm', id: `A${fileNum}` }));
                    })
                    .catch(() => null)
            );
        });
        
        handcraftedFiles.forEach(fileNum => {
            loadPromises.push(
                fetch(`../data/Hand-Crafted/${fileNum}.json`)
                    .then(res => {
                        if (!res.ok) return null;
                        return res.json().then(data => ({ ...data, dataset: 'handcrafted', id: `H${fileNum}` }));
                    })
                    .catch(() => null)
            );
        });
        
        const results = await Promise.all(loadPromises);
        allData = normalizeDataset(results.filter(item => item !== null));
        filteredData = [...allData];
        
        console.log(`成功从原始文件加载 ${allData.length} 个案例`);
        initializeDashboard();
    } catch (error) {
        console.error('Error loading data:', error);
        showError('无法加载数据，请检查数据文件路径或使用数据加载器生成all-data.json文件');
    }
}

// ==================== 数据集切换 ====================
function switchDataset(dataset) {
    currentDataset = dataset;
    
    // 更新数据集按钮状态
    document.querySelectorAll('.dataset-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.dataset === dataset) {
            btn.classList.add('active');
        }
    });
    
    // 过滤数据
    if (dataset === 'all') {
        filteredData = [...allData];
    } else {
        filteredData = allData.filter(d => d.dataset === dataset);
    }
    
    // 更新所有统计和图表
    updateStats();
    updateCharts();
    currentPage = 1;
    renderCasesList();
    updateAnalysisStats();
    populateFlowCaseSelector();
    
    console.log(`Switched to dataset: ${dataset}, ${filteredData.length} cases`);
}

// ==================== Dashboard初始化 ====================
function initializeDashboard() {
    updateStats();
    initializeCharts();
    populateFilters();
    renderCasesList();
    populateFlowCaseSelector();
    setupEventListeners();
    renderFlowTranslation(null);
}

// ==================== 流程可视化相关函数 ====================
function populateFlowCaseSelector() {
    const select = document.getElementById('flowCaseSelect');
    const searchInput = document.getElementById('flowSearch');
    const datasetSelect = document.getElementById('flowDatasetSelect');
    
    let displayData = allData;
    
    // 根据数据集筛选
    const datasetValue = datasetSelect.value;
    if (datasetValue !== 'all') {
        displayData = displayData.filter(d => d.dataset === datasetValue);
    }
    
    // 根据搜索词筛选
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        displayData = displayData.filter(d => 
            d.id.toLowerCase().includes(searchTerm) ||
            (d.question && d.question.toLowerCase().includes(searchTerm))
        );
    }
    
    // 清空选择器
    select.innerHTML = '<option value="">-- 请选择案例 --</option>';
    
    // 添加选项
    displayData.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        const datasetLabel = item.dataset === 'algorithm' ? '算法' : '手工';
        option.textContent = `${item.id} · ${datasetLabel} · ${item.levelLabel} · ${item.mistake_agent}`;
        option.title = `${item.question || '无描述'}`;
        select.appendChild(option);
    });
}

function getFlowActorName(step = {}) {
    return step.name || step.agent || step.role || 'Unknown';
}

function getFlowActorRole(step = {}) {
    return step.role || 'Agent';
}

function getFlowMessage(step = {}) {
    return step.content || step.message || '无内容';
}

function formatFlowStepLabel(step = {}, index = 0) {
    if (step.step !== undefined && step.step !== null && String(step.step).trim() !== '') {
        const raw = String(step.step).trim();
        return /^step\s+/i.test(raw) ? raw : `Step ${raw}`;
    }
    return `Step ${index}`;
}

function summarizeFlowText(text, maxLength = 34) {
    const compact = (text || '无内容').replace(/\s+/g, ' ').trim();
    if (compact.length <= maxLength) {
        return compact;
    }
    return `${compact.slice(0, maxLength)}…`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getTranslatedFlowMessage(item, index, fallbackText) {
    const translated = Array.isArray(item.history_cn) ? item.history_cn[index] : '';
    if (translated) {
        return translated;
    }
    return getChineseTranslation(fallbackText || '');
}

function buildFlowNetwork(item) {
    const history = Array.isArray(item.history) ? item.history : [];
    const parsedStep = parseInt(item.mistake_step, 10);
    const errorIndex = Number.isFinite(parsedStep) ? parsedStep : -1;
    const nodeMap = new Map();
    const linkMap = new Map();

    history.forEach((step, index) => {
        const id = getFlowActorName(step);
        if (!nodeMap.has(id)) {
            nodeMap.set(id, {
                id,
                label: id,
                roles: new Set(),
                firstIndex: index,
                occurrences: 0,
                incoming: 0,
                outgoing: 0,
                isError: false
            });
        }

        const node = nodeMap.get(id);
        node.roles.add(getFlowActorRole(step));
        node.occurrences += 1;
        if (errorIndex === index || item.mistake_agent === id) {
            node.isError = true;
        }
    });

    for (let index = 0; index < history.length - 1; index += 1) {
        const current = history[index];
        const next = history[index + 1];
        const source = getFlowActorName(current);
        const target = getFlowActorName(next);
        const key = `${source}__${target}`;

        if (!linkMap.has(key)) {
            linkMap.set(key, {
                key,
                source,
                target,
                transfers: [],
                isError: false
            });
        }

        const currentText = getFlowMessage(current);
        const nextText = getFlowMessage(next);
        const transfer = {
            key: `${key}__${index}`,
            stepIndex: index,
            nextStepIndex: index + 1,
            stepLabel: formatFlowStepLabel(current, index),
            nextStepLabel: formatFlowStepLabel(next, index + 1),
            source,
            target,
            sourceRole: getFlowActorRole(current),
            targetRole: getFlowActorRole(next),
            handoffText: currentText,
            handoffTextCN: getTranslatedFlowMessage(item, index, currentText),
            responseText: nextText,
            responseTextCN: getTranslatedFlowMessage(item, index + 1, nextText),
            summary: summarizeFlowText(currentText),
            isError: errorIndex === index
        };

        const link = linkMap.get(key);
        link.transfers.push(transfer);
        link.isError = link.isError || transfer.isError;
        nodeMap.get(source).outgoing += 1;
        nodeMap.get(target).incoming += 1;
    }

    const nodes = [...nodeMap.values()]
        .sort((a, b) => a.firstIndex - b.firstIndex)
        .map(node => ({
            ...node,
            roles: [...node.roles]
        }));

    const links = [...linkMap.values()];

    return {
        nodes,
        links,
        errorIndex
    };
}

function resolveSelectedFlowLink(flowData, preferredKey) {
    if (preferredKey && flowData.links.some(link => link.key === preferredKey)) {
        return preferredKey;
    }
    const errorLink = flowData.links.find(link => link.isError);
    return errorLink?.key || flowData.links[0]?.key || null;
}

function buildFlowLayout(flowData) {
    const nodeWidth = 190;
    const nodeHeight = 114;
    const laneWidth = 220;
    const paddingX = 70;
    const nodeTop = 208;
    const height = 360;
    const width = Math.max(720, paddingX * 2 + Math.max(flowData.nodes.length - 1, 0) * laneWidth + nodeWidth);
    const positions = {};

    flowData.nodes.forEach((node, index) => {
        const left = paddingX + index * laneWidth;
        positions[node.id] = {
            left,
            top: nodeTop,
            centerX: left + nodeWidth / 2,
            centerY: nodeTop + nodeHeight / 2,
            index
        };
    });

    const edges = flowData.links.map((link, index) => {
        const sourcePos = positions[link.source];
        const targetPos = positions[link.target];

        if (!sourcePos || !targetPos) {
            return null;
        }

        if (link.source === link.target) {
            const cx = sourcePos.centerX;
            const startX = cx + 34;
            const endX = cx - 34;
            const startY = sourcePos.top + 14;
            const endY = sourcePos.top + 14;
            const controlY = Math.max(24, sourcePos.top - 92);
            return {
                key: link.key,
                path: `M ${startX} ${startY} C ${cx + 92} ${controlY}, ${cx - 92} ${controlY}, ${endX} ${endY}`,
                labelLeft: cx - 34,
                labelTop: controlY + 8
            };
        }

        const startX = sourcePos.centerX;
        const endX = targetPos.centerX;
        const startY = sourcePos.top + 8;
        const endY = targetPos.top + 8;
        const distance = Math.abs(targetPos.index - sourcePos.index);
        const arcHeight = 80 + distance * 28 + (index % 3) * 12;
        const controlY = Math.max(26, nodeTop - arcHeight);

        return {
            key: link.key,
            path: `M ${startX} ${startY} Q ${(startX + endX) / 2} ${controlY} ${endX} ${endY}`,
            labelLeft: (startX + endX) / 2 - 34,
            labelTop: controlY + 8
        };
    }).filter(Boolean);

    return {
        width,
        height,
        nodeWidth,
        nodeHeight,
        positions,
        edges
    };
}

function renderFlowGraph(flowData, selectedLinkKey) {
    if (!flowData.nodes.length) {
        return '<div class="flow-graph-empty">暂无流程数据</div>';
    }

    const layout = buildFlowLayout(flowData);
    const edgeMap = new Map(layout.edges.map(edge => [edge.key, edge]));

    const svgPaths = flowData.links.map(link => {
        const edge = edgeMap.get(link.key);
        if (!edge) return '';
        const stateClass = [
            'flow-network-edge',
            link.isError ? 'error' : '',
            link.key === selectedLinkKey ? 'active' : ''
        ].filter(Boolean).join(' ');
        return `
            <path class="flow-network-edge-hitbox" d="${edge.path}" fill="none" data-flow-link-key="${link.key}"></path>
            <path class="${stateClass}" d="${edge.path}" fill="none" data-flow-link-key="${link.key}"></path>
        `;
    }).join('');

    const labels = flowData.links.map(link => {
        const edge = edgeMap.get(link.key);
        if (!edge) return '';
        const labelClass = [
            'flow-network-link-label',
            link.isError ? 'error' : '',
            link.key === selectedLinkKey ? 'active' : ''
        ].filter(Boolean).join(' ');
        return `
            <button
                type="button"
                class="${labelClass}"
                data-flow-link-key="${link.key}"
                style="left: ${edge.labelLeft}px; top: ${edge.labelTop}px;"
                title="${escapeHtml(`${link.source} -> ${link.target}`)}"
            >
                ${link.transfers.length}次
            </button>
        `;
    }).join('');

    const nodes = flowData.nodes.map(node => {
        const position = layout.positions[node.id];
        const roles = node.roles.join(' / ');
        const nodeClass = [
            'flow-network-node',
            node.isError ? 'error' : ''
        ].filter(Boolean).join(' ');
        return `
            <article
                class="${nodeClass}"
                style="left: ${position.left}px; top: ${position.top}px; width: ${layout.nodeWidth}px; min-height: ${layout.nodeHeight}px;"
            >
                <div class="flow-network-node-topline">
                    <span class="flow-network-node-count">${node.occurrences}次发言</span>
                    ${node.isError ? '<span class="flow-network-node-error">错误链</span>' : ''}
                </div>
                <h4 class="flow-network-node-name">${escapeHtml(node.label)}</h4>
                <div class="flow-network-node-role">${escapeHtml(roles || 'Agent')}</div>
                <div class="flow-network-node-metrics">
                    <span>出 ${node.outgoing}</span>
                    <span>入 ${node.incoming}</span>
                </div>
            </article>
        `;
    }).join('');

    return `
        <div class="flow-network-board">
            <div class="flow-network-guide">节点是 Agent，连线表示相邻步骤中的信息交付。点击连线查看该链路的输入内容。</div>
            <div class="flow-network-scroll">
                <div class="flow-network-canvas" style="width: ${layout.width}px; height: ${layout.height}px;">
                    <svg class="flow-network-svg" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="none">
                        ${svgPaths}
                    </svg>
                    <div class="flow-network-label-layer">
                        ${labels}
                    </div>
                    <div class="flow-network-node-layer">
                        ${nodes}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderFlowRoster(flowData) {
    return `
        <div class="flow-agent-roster">
            ${flowData.nodes.map(node => `
                <div class="flow-agent-chip ${node.isError ? 'error' : ''}">
                    <span class="flow-agent-chip-name">${escapeHtml(node.label)}</span>
                    <span class="flow-agent-chip-meta">${node.roles.map(role => escapeHtml(role)).join(' / ')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderFlowLinkDetail(flowData, selectedLinkKey) {
    if (!flowData.links.length) {
        return `
            <div class="flow-link-detail-empty">
                <div class="flow-link-detail-title">暂无交付链路</div>
                <p>当前案例只有单步信息或缺少相邻 Agent 交付。</p>
            </div>
        `;
    }

    const link = flowData.links.find(item => item.key === selectedLinkKey) || flowData.links[0];
    if (!link) {
        return '';
    }

    const transferCards = link.transfers.map(transfer => {
        const handoffText = showChineseTranslation ? transfer.handoffTextCN : transfer.handoffText;
        const responseText = showChineseTranslation ? transfer.responseTextCN : transfer.responseText;

        return `
            <article class="flow-transfer-card ${transfer.isError ? 'error' : ''}">
                <div class="flow-transfer-card-header">
                    <div>
                        <div class="flow-transfer-route">${escapeHtml(`${transfer.source} -> ${transfer.target}`)}</div>
                        <div class="flow-transfer-step">${escapeHtml(`${transfer.stepLabel} -> ${transfer.nextStepLabel}`)}</div>
                    </div>
                    ${transfer.isError ? '<span class="flow-transfer-badge">错误交付</span>' : ''}
                </div>
                <div class="flow-transfer-summary">${escapeHtml(transfer.summary)}</div>
                <div class="flow-transfer-block">
                    <div class="flow-transfer-label">交付内容</div>
                    <pre>${escapeHtml(handoffText || '无可展示内容')}</pre>
                </div>
                <div class="flow-transfer-block secondary">
                    <div class="flow-transfer-label">接收方下一步响应</div>
                    <pre>${escapeHtml(responseText || '无可展示内容')}</pre>
                </div>
            </article>
        `;
    }).join('');

    return `
        <div class="flow-link-detail-panel">
            <div class="flow-link-detail-header">
                <div>
                    <div class="flow-link-detail-kicker">当前选中链路</div>
                    <h4 class="flow-link-detail-title">${escapeHtml(`${link.source} -> ${link.target}`)}</h4>
                </div>
                <div class="flow-link-detail-meta">
                    <span>${link.transfers.length} 次交付</span>
                    ${link.isError ? '<span class="flow-link-detail-error">包含错误步骤</span>' : '<span>链路正常</span>'}
                </div>
            </div>
            <div class="flow-transfer-list">
                ${transferCards}
            </div>
        </div>
    `;
}

function bindFlowGraphEvents(container, caseId) {
    container.querySelectorAll('[data-flow-link-key]').forEach(element => {
        element.addEventListener('click', () => {
            const { flowLinkKey } = element.dataset;
            renderFlowVisualization(caseId, flowLinkKey);
        });
    });
}

function renderFlowVisualization(caseId, preferredLinkKey = null) {
    const item = allData.find(d => d.id === caseId);
    if (!item) return;

    const flowData = buildFlowNetwork(item);
    const selectedLinkKey = resolveSelectedFlowLink(flowData, preferredLinkKey);
    currentFlowItem = item;
    currentFlowLinkKey = selectedLinkKey;

    document.getElementById('flowCaseTitle').textContent = `案例 ${item.id}`;
    document.getElementById('flowCaseMeta').innerHTML = `
        <span class="flow-badge dataset-badge ${item.dataset}">${item.dataset === 'algorithm' ? '算法生成' : '手工标注'}</span>
        <span class="flow-badge level-badge ${item.levelClass}">${item.levelLabel}</span>
        <span class="flow-badge">错误: ${escapeHtml(item.mistake_agent)}</span>
        <span class="flow-badge">Agent节点: ${flowData.nodes.length}</span>
        <span class="flow-badge">交付链: ${flowData.links.length}</span>
    `;

    const taskPanel = document.getElementById('flowTaskPanel');
    const taskContent = document.getElementById('flowTaskContent');
    taskPanel.style.display = 'block';
    taskContent.textContent = item.question || '无任务描述';

    renderFlowTranslation(item);

    const container = document.getElementById('flowDiagramContainer');
    if (item.history && item.history.length > 0) {
        container.innerHTML = `
            ${renderFlowRoster(flowData)}
            <div class="flow-network-layout">
                ${renderFlowGraph(flowData, selectedLinkKey)}
                ${renderFlowLinkDetail(flowData, selectedLinkKey)}
            </div>
        `;
        bindFlowGraphEvents(container, caseId);
    } else {
        container.innerHTML = '<div class="text-center text-muted">此案例没有对话历史</div>';
    }

    const errorPanel = document.getElementById('flowErrorPanel');
    errorPanel.style.display = 'block';
    document.getElementById('errorAgent').textContent = item.mistake_agent || 'Unknown';
    document.getElementById('errorStep').textContent = `Step ${item.mistake_step || '0'}`;
    document.getElementById('errorReason').textContent = item.mistake_reason || '无错误原因描述';

    const answerPanel = document.getElementById('flowAnswerPanel');
    answerPanel.style.display = 'block';
    document.getElementById('flowAnswerContent').textContent = item.ground_truth || item.groundtruth || '无正确答案';
}

function renderFlowTranslation(item) {
    const panel = document.getElementById('flowTranslationPanel');
    if (!panel) return;
    if (!item) {
        panel.innerHTML = '<p class="text-muted">请先选择一个案例以查看翻译内容。</p>';
        return;
    }

    const question = item.question || '暂无任务描述';
    const questionCN = item.question_cn || '';
    const ground = item.ground_truth || item.groundtruth || '';
    const groundCN = item.ground_truth_cn || '';
    const mistakeReason = item.mistake_reason || '';
    const reasonCN = item.mistake_reason_cn || '';
    const translated = questionCN || getChineseTranslation(question);
    panel.innerHTML = `
        <div class="translation-row">
            <div class="translation-label">原始问题</div>
            <p>${escapeHtml(question)}</p>
        </div>
        <div class="translation-row translation-cn ${showChineseTranslation ? 'visible' : 'hidden'}">
            <div class="translation-label">中文翻译</div>
            <p>${escapeHtml(translated)}</p>
        </div>
        ${ground ? `
            <div class="translation-row">
                <div class="translation-label">正确答案</div>
                <p>${escapeHtml(ground)}</p>
            </div>
        ` : ''}
        ${groundCN && showChineseTranslation ? `
            <div class="translation-row translation-cn">
                <div class="translation-label">答案翻译</div>
                <p>${escapeHtml(groundCN)}</p>
            </div>
        ` : ''}
        ${mistakeReason ? `
            <div class="translation-row">
                <div class="translation-label">错误原因</div>
                <p>${escapeHtml(mistakeReason)}</p>
            </div>
        ` : ''}
        ${reasonCN && showChineseTranslation ? `
            <div class="translation-row translation-cn">
                <div class="translation-label">原因翻译</div>
                <p>${escapeHtml(reasonCN)}</p>
            </div>
        ` : ''}
        <div class="translation-note">${showChineseTranslation ? '自动翻译结果仅供参考，可能不够精准。' : '勾选“显示中文翻译”以展开自动翻译。'}</div>
    `;
}

function getChineseTranslation(text) {
    if (!text) return '暂无待翻译文本';
    if (translationCache.has(text)) {
        return translationCache.get(text);
    }

    let translated = text;
    Object.entries(translationDictionary).forEach(([key, value]) => {
        const regex = new RegExp(`\\b${escapeRegExp(key)}\\b`, 'gi');
        translated = translated.replace(regex, value);
    });

    if (translated === text) {
        translated = `（自动翻译未匹配）${text}`;
    } else {
        translated = `${translated}（词级替换）`;
    }

    translationCache.set(text, translated);
    return translated;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== 更新统计信息 ====================
function updateStats() {
    // 计算当前数据集的统计信息
    const displayData = currentDataset === 'all' ? allData : filteredData;
    
    // 更新统计卡片
    document.getElementById('totalCases').textContent = displayData.length;
    document.getElementById('algorithmCases').textContent = allData.filter(d => d.dataset === 'algorithm').length;
    document.getElementById('handcraftedCases').textContent = allData.filter(d => d.dataset === 'handcrafted').length;
    
    // 计算唯一Agent数量
    const uniqueAgents = new Set(displayData.map(d => d.mistake_agent));
    document.getElementById('uniqueAgents').textContent = uniqueAgents.size;
    
    // 更新数据集切换器中的计数
    document.querySelectorAll('.dataset-btn').forEach(btn => {
        const dataset = btn.dataset.dataset;
        let count = 0;
        if (dataset === 'all') {
            count = allData.length;
        } else if (dataset === 'algorithm') {
            count = allData.filter(d => d.dataset === 'algorithm').length;
        } else if (dataset === 'handcrafted') {
            count = allData.filter(d => d.dataset === 'handcrafted').length;
        }
        const countElement = btn.querySelector('.dataset-count');
        if (countElement) {
            countElement.textContent = count;
        }
    });
}

// ==================== 初始化图表 ====================
function initializeCharts() {
    updateCharts();
}

// ==================== 更新图表 ====================
function updateCharts() {
    const displayData = currentDataset === 'all' ? allData : filteredData;
    
    // 难度等级分布
    const levelData = getLevelDistribution(displayData);
    createChart('levelChart', 'doughnut', {
        labels: ['Level 1', 'Level 2', 'Level 3', 'Level n'],
        datasets: [{
            data: [levelData['1'], levelData['2'], levelData['3'], levelData['n']],
            backgroundColor: [
                'rgba(0, 242, 254, 0.8)',
                'rgba(240, 147, 251, 0.8)',
                'rgba(250, 112, 154, 0.8)',
                'rgba(255, 206, 84, 0.8)'
            ],
            borderColor: [
                'rgba(0, 242, 254, 1)',
                'rgba(240, 147, 251, 1)',
                'rgba(250, 112, 154, 1)',
                'rgba(255, 206, 84, 1)'
            ],
            borderWidth: 2
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#ffffff',
                    padding: 20,
                    font: {
                        size: 12
                    }
                }
            }
        }
    });
    
    // 错误Agent分布（Top 10）
    const agentData = getTopAgents(10, displayData);
    createChart('agentChart', 'bar', {
        labels: agentData.map(d => d.agent),
        datasets: [{
            label: '错误次数',
            data: agentData.map(d => d.count),
            backgroundColor: 'rgba(102, 126, 234, 0.8)',
            borderColor: 'rgba(102, 126, 234, 1)',
            borderWidth: 2,
            borderRadius: 8
        }]
    }, {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: '#ffffff'
                }
            },
            y: {
                grid: {
                    display: false
                },
                ticks: {
                    color: '#ffffff'
                }
            }
        }
    });
    
    // 错误步骤分布
    const stepData = getStepDistribution(displayData);
    const sortedSteps = Object.keys(stepData).sort((a, b) => parseInt(a) - parseInt(b));
    createChart('stepChart', 'line', {
        labels: sortedSteps.map(s => `Step ${s}`),
        datasets: [{
            label: '错误次数',
            data: sortedSteps.map(s => stepData[s]),
            borderColor: 'rgba(245, 87, 108, 1)',
            backgroundColor: 'rgba(245, 87, 108, 0.2)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: 'rgba(245, 87, 108, 1)',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: '#ffffff',
                    maxRotation: 45,
                    minRotation: 45
                }
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: '#ffffff'
                }
            }
        }
    });
    
    // 数据集类型分布
    const algorithmCount = allData.filter(d => d.dataset === 'algorithm').length;
    const handcraftedCount = allData.filter(d => d.dataset === 'handcrafted').length;
    createChart('datasetChart', 'pie', {
        labels: ['算法生成', '手工标注'],
        datasets: [{
            data: [algorithmCount, handcraftedCount],
            backgroundColor: [
                'rgba(79, 172, 254, 0.8)',
                'rgba(245, 87, 108, 0.8)'
            ],
            borderColor: [
                'rgba(79, 172, 254, 1)',
                'rgba(245, 87, 108, 1)'
            ],
            borderWidth: 2
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#ffffff',
                    padding: 20,
                    font: {
                        size: 12
                    }
                }
            }
        }
    });
}

// ==================== 创建图表 ====================
function createChart(canvasId, type, data, options) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    charts[canvasId] = new Chart(ctx, {
        type: type,
        data: data,
        options: {
            ...options,
            plugins: {
                ...options.plugins,
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8
                }
            }
        }
    });
}

// ==================== 数据分析函数 ====================
function getLevelDistribution(data = allData) {
    const distribution = { '1': 0, '2': 0, '3': 0, 'n': 0 };
    data.forEach(item => {
        const level = String(item.level || '1');
        if (distribution[level] !== undefined) {
            distribution[level]++;
        }
    });
    return distribution;
}

function getTopAgents(limit, data = allData) {
    const agentCounts = {};
    data.forEach(item => {
        const agent = item.mistake_agent || 'Unknown';
        agentCounts[agent] = (agentCounts[agent] || 0) + 1;
    });
    
    return Object.entries(agentCounts)
        .map(([agent, count]) => ({ agent, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

function getStepDistribution(data = allData) {
    const stepCounts = {};
    data.forEach(item => {
        const step = String(item.mistake_step || '0');
        stepCounts[step] = (stepCounts[step] || 0) + 1;
    });
    return stepCounts;
}

function normalizeDataset(items) {
    return items.map(item => normalizeCaseFields(item));
}

function normalizeCaseFields(item = {}) {
    const normalized = { ...item };
    let levelRaw = normalized.level ?? normalized.difficulty ?? normalized.level_tag ?? normalized.levelTag;
    levelRaw = levelRaw ? String(levelRaw).trim() : '';
    if (!levelRaw) {
        levelRaw = normalized.dataset === 'handcrafted' ? 'n' : '1';
    }
    if (!levelLabelMap[levelRaw]) {
        levelRaw = 'n';
    }
    normalized.level = levelRaw;
    normalized.levelLabel = levelLabelMap[levelRaw] || `Level ${levelRaw}`;
    normalized.levelClass = `level-${normalized.level}`;
    normalized.question = normalized.question || normalized.prompt || normalized.task || '';
    normalized.ground_truth = normalized.ground_truth || normalized.answer || normalized.groundtruth || '';
    normalized.mistake_agent = normalized.mistake_agent || 'Unknown';
    normalized.mistake_step = normalized.mistake_step || normalized.step || '0';
    normalized.dataset = normalized.dataset || 'algorithm';
    normalized.history = Array.isArray(normalized.history) ? normalized.history : [];
    return normalized;
}

// ==================== 填充筛选器 ====================
function populateFilters() {
    populateAgentFilter();
    populateStepFilter();
    populateLevelFilter();
}

function populateAgentFilter() {
    const agentFilter = document.getElementById('agentFilter');
    agentFilter.innerHTML = '<option value="all">全部</option>';
    const uniqueAgents = [...new Set(allData.map(d => d.mistake_agent))].sort();
    uniqueAgents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent;
        option.textContent = agent;
        agentFilter.appendChild(option);
    });
}

function populateStepFilter() {
    const stepFilter = document.getElementById('stepFilter');
    stepFilter.innerHTML = '<option value="all">全部</option>';
    const uniqueSteps = [...new Set(allData.map(d => d.mistake_step))].sort((a, b) => parseInt(a) - parseInt(b));
    uniqueSteps.forEach(step => {
        const option = document.createElement('option');
        option.value = step;
        option.textContent = `Step ${step}`;
        stepFilter.appendChild(option);
    });
}

function populateLevelFilter() {
    const levelFilter = document.getElementById('levelFilter');
    const previousValue = levelFilter.value || 'all';
    levelFilter.innerHTML = '<option value="all">全部</option>';
    const uniqueLevels = [...new Set(allData.map(d => d.level))].sort((a, b) => {
        if (a === 'n') return 1;
        if (b === 'n') return -1;
        return Number(a) - Number(b);
    });
    uniqueLevels.forEach(level => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = levelLabelMap[level] || `Level ${level}`;
        if (level === previousValue) {
            option.selected = true;
        }
        levelFilter.appendChild(option);
    });
}

// ==================== 筛选功能 ====================
function applyFilters() {
    const datasetFilter = document.getElementById('datasetFilter').value;
    const levelFilter = document.getElementById('levelFilter').value;
    const agentFilter = document.getElementById('agentFilter').value;
    const stepFilter = document.getElementById('stepFilter').value;
    
    filteredData = allData.filter(item => {
        if (datasetFilter !== 'all' && item.dataset !== datasetFilter) return false;
        if (levelFilter !== 'all' && String(item.level) !== levelFilter) return false;
        if (agentFilter !== 'all' && item.mistake_agent !== agentFilter) return false;
        if (stepFilter !== 'all' && String(item.mistake_step) !== stepFilter) return false;
        return true;
    });
    
    currentPage = 1;
    updateAnalysisStats();
    renderCasesList();
}

function resetFilters() {
    document.getElementById('datasetFilter').value = 'all';
    document.getElementById('levelFilter').value = 'all';
    document.getElementById('agentFilter').value = 'all';
    document.getElementById('stepFilter').value = 'all';
    
    filteredData = [...allData];
    currentPage = 1;
    updateAnalysisStats();
    renderCasesList();
}

function updateAnalysisStats() {
    document.getElementById('filteredCount').textContent = filteredData.length;
    
    if (filteredData.length > 0) {
        const avgStep = (filteredData.reduce((sum, item) => sum + parseInt(item.mistake_step || 0), 0) / filteredData.length).toFixed(2);
        document.getElementById('avgStep').textContent = avgStep;
        
        const topAgent = getTopAgents(1)[0];
        document.getElementById('topAgent').textContent = topAgent.agent;
        
        // 更新错误原因分析
        updateErrorReasons();
    } else {
        document.getElementById('avgStep').textContent = '--';
        document.getElementById('topAgent').textContent = '--';
        document.getElementById('errorReasons').innerHTML = '<p class="text-center text-muted">没有匹配的数据</p>';
    }
}

function updateErrorReasons() {
    const errorReasonsContainer = document.getElementById('errorReasons');
    const reasonGroups = {};
    
    filteredData.forEach(item => {
        const agent = item.mistake_agent || 'Unknown';
        const reason = item.mistake_reason || 'No reason provided';
        
        if (!reasonGroups[agent]) {
            reasonGroups[agent] = [];
        }
        reasonGroups[agent].push(reason);
    });
    
    let html = '';
    Object.entries(reasonGroups).forEach(([agent, reasons]) => {
        html += `
            <div class="error-reason-item">
                <div class="error-reason-agent">${agent}</div>
                <div class="error-reason-text">${reasons[0]}</div>
                ${reasons.length > 1 ? `<div class="error-reason-text" style="font-size: 0.85rem; margin-top: 4px;">等 ${reasons.length} 个相似错误</div>` : ''}
            </div>
        `;
    });
    
    errorReasonsContainer.innerHTML = html || '<p class="text-center text-muted">没有错误原因数据</p>';
}

// ==================== 案例列表渲染 ====================
function renderCasesList() {
    const tableBody = document.getElementById('casesTableBody');
    const searchQuery = document.getElementById('caseSearch').value.toLowerCase();
    
    let displayData = filteredData;
    
    // 应用搜索过滤
    if (searchQuery) {
        displayData = displayData.filter(item => 
            item.id.toLowerCase().includes(searchQuery) ||
            (item.question && item.question.toLowerCase().includes(searchQuery)) ||
            (item.mistake_agent && item.mistake_agent.toLowerCase().includes(searchQuery))
        );
    }
    
    // 分页
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = displayData.slice(startIndex, endIndex);
    
    // 渲染表格
    let html = '';
    pageData.forEach(item => {
        html += `
            <div class="table-row" data-id="${item.id}">
                <div class="table-cell">${item.id}</div>
                <div class="table-cell">
                    <span class="dataset-badge ${item.dataset}">${item.dataset === 'algorithm' ? '算法生成' : '手工标注'}</span>
                </div>
                <div class="table-cell">
                    <span class="level-badge ${item.levelClass}">${item.levelLabel}</span>
                </div>
                <div class="table-cell">${item.mistake_agent || 'Unknown'}</div>
                <div class="table-cell">Step ${item.mistake_step || '0'}</div>
                <div class="table-cell">
                    <button class="view-btn" onclick="viewCase('${item.id}')">查看</button>
                </div>
            </div>
        `;
    });
    
    tableBody.innerHTML = html || '<div class="text-center text-muted" style="grid-column: 1/-1; padding: 2rem;">没有找到匹配的案例</div>';
    
    // 渲染分页
    renderPagination(displayData.length);
}

function renderPagination(totalItems) {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(totalItems / pageSize);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // 上一页
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">上一页</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span class="page-btn" style="border: none; background: none;">...</span>`;
        }
    }
    
    // 下一页
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">下一页</button>`;
    
    pagination.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    renderCasesList();
}

// ==================== 案例详情 ====================
function viewCase(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;
    
    // 高亮选中的行
    document.querySelectorAll('.table-row').forEach(row => {
        row.classList.remove('selected');
        if (row.dataset.id === id) {
            row.classList.add('selected');
        }
    });
    
    // 渲染案例详情
    const detailContainer = document.getElementById('caseDetail');
    detailContainer.innerHTML = `
        <div class="case-detail-content">
            <div class="case-header">
                <div class="case-id">案例 ID: ${item.id}</div>
                <h2 class="case-question">${item.question || '无问题描述'}</h2>
                <div class="case-meta">
                    <span class="dataset-badge ${item.dataset}">${item.dataset === 'algorithm' ? '算法生成' : '手工标注'}</span>
                    <span class="level-badge ${item.levelClass}">${item.levelLabel}</span>
                </div>
            </div>
            
            <div class="case-info">
                <div class="case-info-section">
                    <h3 class="case-info-title">正确答案</h3>
                    <div class="case-info-content">${item.ground_truth || item.groundtruth || '无'}</div>
                </div>
                
                <div class="case-info-section">
                    <h3 class="case-info-title">错误Agent</h3>
                    <div class="case-info-content">${item.mistake_agent || 'Unknown'}</div>
                </div>
                
                <div class="case-info-section">
                    <h3 class="case-info-title">错误步骤</h3>
                    <div class="case-info-content">Step ${item.mistake_step || '0'}</div>
                </div>
                
                <div class="error-highlight">
                    <div class="error-highlight-title">错误原因</div>
                    <div class="case-info-content">${item.mistake_reason || '无错误原因描述'}</div>
                </div>
                
                ${item.history && item.history.length > 0 ? `
                    <button class="conversation-btn" onclick="showConversation('${item.id}')">
                        📊 查看完整对话流程
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// ==================== 对话流程 ====================
function showConversation(id) {
    const item = allData.find(d => d.id === id);
    if (!item || !item.history) return;
    
    const modal = document.getElementById('conversationModal');
    const flowContainer = document.getElementById('conversationFlow');
    
    let html = '';
    const historyCn = item.history_cn || [];
    item.history.forEach((step, index) => {
        const isError = parseInt(item.mistake_step) === index;
        const agent = step.name || step.role || 'Unknown';
        const message = step.content || step.message || '无内容';
        const translated = historyCn[index] || '';
        
        html += `
            <div class="conversation-step ${isError ? 'error' : ''}">
                <div class="step-number ${isError ? 'error' : ''}">${index}</div>
                <div class="step-content">
                    <div class="step-agent">${agent} ${isError ? '❌ 错误步骤' : ''}</div>
                    <div class="step-message">${message.substring(0, 500)}${message.length > 500 ? '...' : ''}</div>
                    ${translated ? `<div class="step-translation">${translated}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    flowContainer.innerHTML = html;
    modal.classList.add('active');
}

// ==================== 事件监听器 ====================
function setupEventListeners() {
    // 导航切换
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            switchSection(section);
        });
    });
    
    // 数据集切换
    document.querySelectorAll('.dataset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dataset = btn.dataset.dataset;
            switchDataset(dataset);
        });
    });
    
    // 筛选按钮
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    
    // 搜索输入
    document.getElementById('caseSearch').addEventListener('input', () => {
        currentPage = 1;
        renderCasesList();
    });
    
    // 页面大小选择
    document.getElementById('pageSize').addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        renderCasesList();
    });
    
    // 流程可视化搜索
    document.getElementById('flowSearch').addEventListener('input', () => {
        populateFlowCaseSelector();
    });
    
    // 流程可视化数据集选择
    document.getElementById('flowDatasetSelect').addEventListener('change', () => {
        populateFlowCaseSelector();
    });
    
    // 流程可视化案例选择
    document.getElementById('flowCaseSelect').addEventListener('change', (e) => {
        const caseId = e.target.value;
        if (caseId) {
            renderFlowVisualization(caseId);
        } else {
            // 清空可视化
            document.getElementById('flowCaseTitle').textContent = '请选择一个案例';
            document.getElementById('flowCaseMeta').innerHTML = '';
            document.getElementById('flowTaskPanel').style.display = 'none';
            document.getElementById('flowDiagramContainer').innerHTML = `
                <div class="flow-empty">
                    <div class="flow-empty-icon">🔄</div>
                    <h3>选择案例开始可视化</h3>
                    <p>从上方选择器中选择一个案例，查看完整的Agent执行流程</p>
                </div>
            `;
            document.getElementById('flowErrorPanel').style.display = 'none';
            document.getElementById('flowAnswerPanel').style.display = 'none';
            currentFlowItem = null;
            currentFlowLinkKey = null;
            renderFlowTranslation(null);
        }
    });

    const translationToggle = document.getElementById('translationToggle');
    if (translationToggle) {
        translationToggle.addEventListener('change', (e) => {
            showChineseTranslation = e.target.checked;
            renderFlowTranslation(currentFlowItem);
            if (currentFlowItem) {
                renderFlowVisualization(currentFlowItem.id, currentFlowLinkKey);
            }
        });
    }
    
    // 模态框关闭
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('conversationModal').classList.remove('active');
    });
    
    // 点击模态框外部关闭
    document.getElementById('conversationModal').addEventListener('click', (e) => {
        if (e.target.id === 'conversationModal') {
            document.getElementById('conversationModal').classList.remove('active');
        }
    });
}

function switchSection(sectionId) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.section === sectionId) {
            item.classList.add('active');
        }
    });
    
    // 更新section显示
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
        if (section.id === sectionId) {
            section.classList.add('active');
        }
    });
}

// ==================== 错误处理 ====================
function showError(message) {
    console.error(message);
    // 可以在这里添加UI错误提示
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    loadData();
});
