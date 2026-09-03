(function () {
  "use strict";

  const STORAGE_KEY = "ai-pm-workbench-prototypes-v1";
  const ASSET_DB = "ai-pm-workbench-assets-v1";
  const MAX_HISTORY = 80;
  const MAX_VERSIONS = 20;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  const COMPONENTS = {
    section: { label: "页面区块", icon: "square-dashed", category: "布局", container: true, props: { label: "页面区块" } },
    stack: { label: "纵向容器", icon: "rows-3", category: "布局", container: true, props: { label: "纵向容器" } },
    row: { label: "横向容器", icon: "columns-3", category: "布局", container: true, props: { label: "横向容器" } },
    grid: { label: "网格", icon: "grid-2x2", category: "布局", container: true, props: { label: "网格", columns: 2 } },
    divider: { label: "分隔线", icon: "minus", category: "布局", props: {} },
    spacer: { label: "间距", icon: "move-vertical", category: "布局", props: { height: 24 } },
    topnav: { label: "顶部导航", icon: "panel-top", category: "导航", props: { text: "产品名称", items: "首页,功能,帮助" } },
    sidenav: { label: "侧边导航", icon: "panel-left", category: "导航", props: { text: "工作台", items: "概览,项目,设置" } },
    breadcrumbs: { label: "面包屑", icon: "chevrons-right", category: "导航", props: { items: "首页,当前页面" } },
    tabs: { label: "标签页", icon: "panel-top-open", category: "导航", props: { items: "概览,详情,记录" } },
    heading: { label: "标题", icon: "heading", category: "内容", props: { text: "页面标题", level: 2 } },
    text: { label: "正文", icon: "text", category: "内容", props: { text: "在这里填写内容说明。" } },
    image: { label: "图片", icon: "image", category: "内容", props: { src: "", assetId: "", alt: "图片" } },
    icon: { label: "图标", icon: "star", category: "内容", props: { text: "◆" } },
    badge: { label: "徽标", icon: "badge", category: "内容", props: { text: "标签" } },
    card: { label: "卡片", icon: "square", category: "内容", container: true, props: { label: "卡片" } },
    list: { label: "列表", icon: "list", category: "内容", props: { items: "列表项一,列表项二,列表项三" } },
    table: { label: "表格", icon: "table-2", category: "内容", props: { columns: "名称,状态,负责人", rows: "需求评审,进行中,产品组\n原型设计,待开始,设计组" } },
    input: { label: "输入框", icon: "text-cursor-input", category: "表单", props: { label: "字段名称", placeholder: "请输入" } },
    textarea: { label: "文本域", icon: "rectangle-ellipsis", category: "表单", props: { label: "详细说明", placeholder: "请输入详细内容" } },
    select: { label: "下拉框", icon: "list-filter", category: "表单", props: { label: "选择项", items: "选项一,选项二,选项三" } },
    radio: { label: "单选", icon: "circle-dot", category: "表单", props: { label: "单选项" } },
    checkbox: { label: "复选", icon: "square-check", category: "表单", props: { label: "复选项" } },
    switch: { label: "开关", icon: "toggle-right", category: "表单", props: { label: "启用设置" } },
    button: { label: "按钮", icon: "mouse-pointer-click", category: "操作与反馈", props: { text: "主要操作", variant: "primary" } },
    alert: { label: "提示条", icon: "info", category: "操作与反馈", props: { text: "这是一条重要提示。" } },
    modal: { label: "弹窗", icon: "panel-top-close", category: "操作与反馈", container: true, overlay: true, props: { label: "弹窗" } },
    drawer: { label: "抽屉", icon: "panel-right", category: "操作与反馈", container: true, overlay: true, props: { label: "抽屉" } }
  };

  const CONTAINER_TYPES = new Set(Object.keys(COMPONENTS).filter((type) => COMPONENTS[type].container));
  const assetCache = new Map();
  const histories = new Map();
  let selectedNodeId = null;
  let activeLeftTab = "pages";
  let activeRightTab = "content";
  let zoom = 75;
  let saveTimer;
  let versionTimer;
  let draggedNodeId = null;
  let previewState = { pageId: null, stack: [], overlays: new Set(), hidden: new Set() };

  function id(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
  }

  function safeColor(value, fallback = "") {
    return /^#[0-9a-f]{3,8}$/i.test(String(value || "")) ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
  }

  function notify(message) {
    const toast = document.getElementById("toast");
    document.getElementById("toastText").textContent = message;
    toast.classList.add("show");
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function createNode(type, overrides = {}) {
    const definition = COMPONENTS[type] || COMPONENTS.text;
    return {
      id: id("node"),
      type,
      props: { ...clone(definition.props), ...(overrides.props || {}) },
      style: {
        width: "full",
        align: "stretch",
        background: "",
        color: "",
        fontSize: type === "heading" ? 26 : 14,
        padding: definition.container ? 16 : 0,
        gap: 12,
        radius: type === "card" ? 7 : 0,
        border: type === "card",
        ...(overrides.style || {})
      },
      interactions: clone(overrides.interactions || []),
      children: definition.container ? clone(overrides.children || []) : []
    };
  }

  function makePage(name, device, templateId = "blank") {
    const template = BUILTIN_PAGE_TEMPLATES.find((item) => item.id === templateId) || BUILTIN_PAGE_TEMPLATES[0];
    const page = template.create();
    page.id = id("page");
    page.name = name || page.name;
    page.device = device || page.device;
    page.createdAt = new Date().toISOString();
    page.updatedAt = page.createdAt;
    return page;
  }

  function pageShell(name, device, children) {
    const now = new Date().toISOString();
    return { id: id("page"), name, device, rootNode: createNode("stack", { props: { label: "页面" }, style: { padding: 0, gap: 0 }, children }), createdAt: now, updatedAt: now };
  }

  function blankPage() {
    return pageShell("未命名页面", "desktop", [createNode("section", { children: [createNode("heading"), createNode("text")] })]);
  }

  function mobilePage() {
    return pageShell("移动应用首页", "mobile", [
      createNode("topnav", { props: { text: "应用名称", items: "消息,我的" } }),
      createNode("section", { style: { background: "#f4f6f1", padding: 20, gap: 14 }, children: [
        createNode("heading", { props: { text: "今天想完成什么？", level: 1 }, style: { fontSize: 28 } }),
        createNode("text", { props: { text: "查看当前任务并快速开始。" }, style: { color: "#687066" } }),
        createNode("card", { children: [createNode("badge", { props: { text: "进行中" } }), createNode("heading", { props: { text: "核心任务", level: 3 }, style: { fontSize: 18 } }), createNode("text", { props: { text: "任务说明与当前进度。" } }), createNode("button", { props: { text: "继续处理", variant: "primary" }, interactions: [] })] })
      ] })
    ]);
  }

  function saasPage() {
    return pageShell("SaaS 管理后台", "desktop", [
      createNode("topnav", { props: { text: "企业工作台", items: "帮助,通知,账户" } }),
      createNode("row", { style: { padding: 0, gap: 0, align: "stretch" }, children: [
        createNode("sidenav", { props: { text: "管理中心", items: "概览,项目,成员,设置" }, style: { width: "auto" } }),
        createNode("section", { children: [createNode("breadcrumbs"), createNode("heading", { props: { text: "项目概览", level: 1 } }), createNode("grid", { props: { columns: 3 }, children: [
          createNode("card", { children: [createNode("text", { props: { text: "进行中项目" } }), createNode("heading", { props: { text: "24", level: 2 } })] }),
          createNode("card", { children: [createNode("text", { props: { text: "待处理任务" } }), createNode("heading", { props: { text: "8", level: 2 } })] }),
          createNode("card", { children: [createNode("text", { props: { text: "本周完成" } }), createNode("heading", { props: { text: "36", level: 2 } })] })
        ] }), createNode("table")], style: { width: "full" } })
      ] })
    ]);
  }

  function ecommercePage() {
    return pageShell("商品详情页", "desktop", [
      createNode("topnav", { props: { text: "品牌商城", items: "首页,分类,购物车" } }),
      createNode("section", { children: [createNode("breadcrumbs", { props: { items: "首页,商品分类,商品名称" } }), createNode("row", { children: [
        createNode("image", { props: { alt: "商品主图", src: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80" }, style: { width: "half" } }),
        createNode("stack", { style: { width: "half", padding: 20, gap: 16 }, children: [createNode("badge", { props: { text: "新品" } }), createNode("heading", { props: { text: "高品质日常商品", level: 1 }, style: { fontSize: 30 } }), createNode("text", { props: { text: "清晰展示商品卖点、规格、价格与配送信息。" } }), createNode("heading", { props: { text: "¥ 299", level: 2 }, style: { color: "#c84e2d" } }), createNode("select", { props: { label: "选择规格", items: "标准款,升级款" } }), createNode("button", { props: { text: "立即购买", variant: "primary" } })] })
      ] })] })
    ]);
  }

  const BUILTIN_PAGE_TEMPLATES = [
    { id: "blank", name: "空白页面", description: "基础标题与正文", create: blankPage },
    { id: "mobile", name: "移动应用", description: "手机首页与任务卡片", create: mobilePage },
    { id: "saas", name: "SaaS 后台", description: "导航、指标与数据表格", create: saasPage },
    { id: "ecommerce", name: "电商详情", description: "商品图片、规格与购买操作", create: ecommercePage }
  ];

  function initialWorkspace() {
    return { projects: [], activeProjectId: null, templates: [] };
  }

  function normalizeWorkspace(raw) {
    if (!raw || !Array.isArray(raw.projects)) return initialWorkspace();
    return {
      projects: raw.projects.filter(Boolean).map((project) => ({
        ...project,
        pages: Array.isArray(project.pages) ? project.pages : [],
        versions: Array.isArray(project.versions) ? project.versions.slice(0, MAX_VERSIONS) : [],
        theme: project.theme || { primary: "#5f861d", background: "#ffffff" }
      })),
      activeProjectId: raw.projects.some((project) => project.id === raw.activeProjectId) ? raw.activeProjectId : raw.projects[0]?.id || null,
      templates: Array.isArray(raw.templates) ? raw.templates : []
    };
  }

  function loadWorkspace() {
    try {
      return normalizeWorkspace(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (error) {
      return initialWorkspace();
    }
  }

  let workspace = loadWorkspace();

  function activeProject() {
    return workspace.projects.find((project) => project.id === workspace.activeProjectId) || null;
  }

  function activePage() {
    const project = activeProject();
    return project?.pages.find((page) => page.id === project.activePageId) || project?.pages[0] || null;
  }

  function projectSnapshot(project) {
    return clone({ name: project.name, prdRef: project.prdRef, startPageId: project.startPageId, activePageId: project.activePageId, pages: project.pages, theme: project.theme });
  }

  function createVersion(project, label) {
    return { id: id("proto-version"), label, createdAt: new Date().toISOString(), snapshot: projectSnapshot(project) };
  }

  function persistNow() {
    const project = activeProject();
    if (project) project.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  }

  function schedulePersist() {
    const state = document.getElementById("protoSaveState");
    if (state) state.textContent = "正在保存...";
    window.clearTimeout(saveTimer);
    window.clearTimeout(versionTimer);
    saveTimer = window.setTimeout(() => {
      persistNow();
      if (state) state.textContent = `已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    }, 350);
    versionTimer = window.setTimeout(maybeAutoVersion, 1200);
  }

  function maybeAutoVersion() {
    const project = activeProject();
    if (!project) return;
    const latest = project.versions[0];
    const latestTime = latest ? new Date(latest.createdAt).getTime() : 0;
    if (Date.now() - latestTime < 5 * 60 * 1000) return;
    if (latest && JSON.stringify(latest.snapshot) === JSON.stringify(projectSnapshot(project))) return;
    project.versions.unshift(createVersion(project, "自动版本"));
    project.versions = project.versions.slice(0, MAX_VERSIONS);
    persistNow();
  }

  function saveVersion(label, force = true) {
    const project = activeProject();
    if (!project) return false;
    const snapshot = projectSnapshot(project);
    if (!force && project.versions[0] && JSON.stringify(project.versions[0].snapshot) === JSON.stringify(snapshot)) return false;
    project.versions.unshift({ id: id("proto-version"), label, createdAt: new Date().toISOString(), snapshot });
    project.versions = project.versions.slice(0, MAX_VERSIONS);
    persistNow();
    return true;
  }

  function historyFor(projectId) {
    if (!histories.has(projectId)) histories.set(projectId, { undo: [], redo: [], lastAt: 0 });
    return histories.get(projectId);
  }

  function commit(mutator, options = {}) {
    const project = activeProject();
    if (!project) return;
    const history = historyFor(project.id);
    const before = JSON.stringify(projectSnapshot(project));
    const now = Date.now();
    if (options.history !== false && (options.forceHistory || !history.undo.length || now - history.lastAt > 650)) {
      if (history.undo[history.undo.length - 1] !== before) history.undo.push(before);
      if (history.undo.length > MAX_HISTORY) history.undo.shift();
    }
    mutator(project);
    project.updatedAt = new Date().toISOString();
    if (options.history !== false) {
      history.redo = [];
      history.lastAt = now;
    }
    schedulePersist();
    if (options.render !== false) renderAll();
  }

  function applyProjectSnapshot(project, snapshot) {
    project.name = snapshot.name;
    project.prdRef = snapshot.prdRef;
    project.startPageId = snapshot.startPageId;
    project.activePageId = snapshot.activePageId;
    project.pages = clone(snapshot.pages);
    project.theme = clone(snapshot.theme);
    if (!project.pages.some((page) => page.id === project.activePageId)) project.activePageId = project.pages[0]?.id || null;
  }

  function undo() {
    const project = activeProject();
    if (!project) return;
    const history = historyFor(project.id);
    if (!history.undo.length) return;
    history.redo.push(JSON.stringify(projectSnapshot(project)));
    applyProjectSnapshot(project, JSON.parse(history.undo.pop()));
    history.lastAt = 0;
    selectedNodeId = null;
    schedulePersist();
    renderAll();
    notify("已撤销");
  }

  function redo() {
    const project = activeProject();
    if (!project) return;
    const history = historyFor(project.id);
    if (!history.redo.length) return;
    history.undo.push(JSON.stringify(projectSnapshot(project)));
    applyProjectSnapshot(project, JSON.parse(history.redo.pop()));
    history.lastAt = 0;
    selectedNodeId = null;
    schedulePersist();
    renderAll();
    notify("已重做");
  }

  function findNode(root, nodeId, parent = null) {
    if (!root) return null;
    if (root.id === nodeId) return { node: root, parent };
    for (const child of root.children || []) {
      const found = findNode(child, nodeId, root);
      if (found) return found;
    }
    return null;
  }

  function currentNode() {
    return findNode(activePage()?.rootNode, selectedNodeId)?.node || null;
  }

  function nodeContains(root, nodeId) {
    return Boolean(findNode(root, nodeId));
  }

  function cloneNodeWithIds(node, idMap = new Map()) {
    const copy = clone(node);
    function renew(item) {
      const oldId = item.id;
      item.id = id("node");
      idMap.set(oldId, item.id);
      (item.children || []).forEach(renew);
    }
    renew(copy);
    function retarget(item) {
      (item.interactions || []).forEach((interaction) => {
        if (idMap.has(interaction.targetId)) interaction.targetId = idMap.get(interaction.targetId);
      });
      (item.children || []).forEach(retarget);
    }
    retarget(copy);
    return copy;
  }

  function allNodes(root, result = []) {
    if (!root) return result;
    result.push(root);
    (root.children || []).forEach((child) => allNodes(child, result));
    return result;
  }

  function openAssetDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(ASSET_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("assets", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putAsset(record) {
    const db = await openAssetDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    assetCache.set(record.id, record.dataUrl);
  }

  async function getAsset(assetId) {
    if (!assetId) return "";
    if (assetCache.has(assetId)) return assetCache.get(assetId);
    const db = await openAssetDb();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction("assets", "readonly").objectStore("assets").get(assetId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (record?.dataUrl) assetCache.set(assetId, record.dataUrl);
    return record?.dataUrl || "";
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function makeIconButton(icon, label, idValue = "") {
    return `<button class="icon-button" ${idValue ? `id="${idValue}"` : ""} type="button" aria-label="${label}" title="${label}"><i data-lucide="${icon}"></i></button>`;
  }

  function buildShell() {
    const sidebar = document.getElementById("sidebar");
    const footer = sidebar.querySelector(".sidebar-footer");
    const library = document.createElement("section");
    library.className = "proto-project-library";
    library.id = "protoProjectLibrary";
    library.hidden = true;
    library.innerHTML = `
      <header class="library-header">
        <span class="library-title">原型项目</span>
        <div class="library-actions">${makeIconButton("folder-plus", "新建原型项目", "newPrototypeProjectButton")}</div>
      </header>
      <div class="proto-project-tree" id="protoProjectTree"></div>`;
    sidebar.insertBefore(library, footer);

    const main = document.createElement("main");
    main.className = "prototype-workspace";
    main.id = "prototypeWorkspace";
    main.hidden = true;
    main.innerHTML = `
      <header class="proto-topbar">
        <div class="proto-title-block">
          ${makeIconButton("menu", "打开工作流", "protoGlobalMenu")}
          <div class="proto-title-copy"><div class="proto-project-title" id="protoProjectTitle">原型设计</div><div class="proto-save-state" id="protoSaveState">已保存到本机</div></div>
        </div>
        <div class="proto-toolbar">
          <div class="proto-mobile-panels">${makeIconButton("panel-left", "打开页面和组件", "protoOpenLeft")}${makeIconButton("panel-right", "打开属性", "protoOpenRight")}</div>
          ${makeIconButton("undo-2", "撤销", "protoUndo")}${makeIconButton("redo-2", "重做", "protoRedo")}
          <div class="proto-toolbar-separator"></div>
          <div class="proto-segmented" aria-label="页面设备"><button id="protoDesktop" type="button" title="桌面画布"><i data-lucide="monitor"></i></button><button id="protoMobile" type="button" title="手机画布"><i data-lucide="smartphone"></i></button></div>
          ${makeIconButton("zoom-out", "缩小", "protoZoomOut")}<span class="proto-zoom" id="protoZoom">75%</span>${makeIconButton("zoom-in", "放大", "protoZoomIn")}
          <div class="proto-toolbar-separator"></div>
          ${makeIconButton("git-fork", "页面关系", "protoRelations")}${makeIconButton("history", "版本历史", "protoVersions")}${makeIconButton("layout-template", "页面模板", "protoTemplates")}${makeIconButton("settings-2", "模型设置", "protoModelSettings")}
          <button class="button" id="protoPreview" type="button"><i data-lucide="play"></i><span>预览</span></button>
          <button class="button primary" id="protoExportMenu" type="button"><i data-lucide="download"></i><span>导出</span></button>
        </div>
      </header>
      <div class="proto-editor" id="protoEditor">
        <aside class="proto-side proto-side-left">
          <div class="proto-panel-tabs"><button class="proto-panel-tab active" data-left-tab="pages" type="button">页面</button><button class="proto-panel-tab" data-left-tab="layers" type="button">图层</button><button class="proto-panel-tab" data-left-tab="components" type="button">组件</button></div>
          <div class="proto-panel-body"><div class="proto-panel-view active" id="protoPagesPanel"></div><div class="proto-panel-view" id="protoLayersPanel"></div><div class="proto-panel-view" id="protoComponentsPanel"></div></div>
        </aside>
        <section class="proto-canvas-area" id="protoCanvasArea"><div class="proto-canvas-stage" id="protoCanvasStage"></div></section>
        <aside class="proto-side proto-side-right">
          <div class="proto-panel-tabs"><button class="proto-panel-tab active" data-right-tab="content" type="button">内容</button><button class="proto-panel-tab" data-right-tab="style" type="button">样式</button><button class="proto-panel-tab" data-right-tab="interaction" type="button">交互</button><button class="proto-panel-tab" data-right-tab="requirement" type="button">需求</button></div>
          <div class="proto-panel-body" id="protoProperties"></div>
        </aside>
      </div>`;
    document.querySelector(".app-shell").appendChild(main);

    document.body.insertAdjacentHTML("beforeend", `
      <div class="modal-backdrop" id="protoDialog" aria-hidden="true"><form class="modal library-modal" id="protoDialogForm" role="dialog" aria-modal="true"><header class="modal-header"><h2 class="modal-title" id="protoDialogTitle"></h2>${makeIconButton("x", "关闭", "protoDialogClose")}</header><div class="modal-body"><p class="dialog-description" id="protoDialogDescription"></p><div class="modal-field-stack" id="protoDialogFields"></div></div><footer class="modal-footer"><button class="button" id="protoDialogCancel" type="button">取消</button><button class="button primary" id="protoDialogConfirm" type="submit">确认</button></footer></form></div>
      <div class="modal-backdrop" id="protoTemplateModal" aria-hidden="true"><section class="modal" role="dialog" aria-modal="true"><header class="modal-header"><h2 class="modal-title">页面模板</h2>${makeIconButton("x", "关闭页面模板", "protoTemplateClose")}</header><div class="modal-body"><section class="modal-section"><h3 class="modal-section-title">内置模板</h3><div class="template-grid" id="protoBuiltinTemplates"></div></section><section class="modal-section"><h3 class="modal-section-title">我的模板</h3><div class="modal-list" id="protoCustomTemplates"></div></section></div><footer class="modal-footer"><button class="button" id="protoTemplateCancel" type="button">关闭</button><button class="button primary" id="protoSaveTemplate" type="button"><i data-lucide="bookmark-plus"></i>将当前页面存为模板</button></footer></section></div>
      <div class="modal-backdrop" id="protoVersionModal" aria-hidden="true"><section class="modal compact" role="dialog" aria-modal="true"><header class="modal-header"><h2 class="modal-title">原型版本历史</h2>${makeIconButton("x", "关闭版本历史", "protoVersionClose")}</header><div class="modal-body"><div class="modal-list" id="protoVersionList"></div></div><footer class="modal-footer"><button class="button" id="protoVersionCancel" type="button">关闭</button><button class="button primary" id="protoSaveVersion" type="button"><i data-lucide="save"></i>保存当前版本</button></footer></section></div>
      <div class="modal-backdrop" id="protoRelationModal" aria-hidden="true"><section class="modal compact" role="dialog" aria-modal="true"><header class="modal-header"><h2 class="modal-title">页面关系</h2>${makeIconButton("x", "关闭页面关系", "protoRelationClose")}</header><div class="modal-body"><div class="proto-relation-list" id="protoRelationList"></div></div><footer class="modal-footer"><button class="button" id="protoRelationCancel" type="button">关闭</button></footer></section></div>
      <div class="proto-preview-backdrop" id="protoPreviewModal"><header class="proto-preview-bar"><strong id="protoPreviewTitle">原型预览</strong><div class="proto-preview-actions">${makeIconButton("arrow-left", "返回", "protoPreviewBack")}${makeIconButton("x", "关闭预览", "protoPreviewClose")}</div></header><div class="proto-preview-stage" id="protoPreviewStage"></div></div>`);
  }

  function interactionAttributes(node) {
    const interaction = node.interactions?.[0];
    if (!interaction || !interaction.action || interaction.action === "none") return "";
    return ` data-action="${escapeHtml(interaction.action)}" data-target="${escapeHtml(interaction.targetId || "")}"`;
  }

  function nodeStyle(node) {
    const style = node.style || {};
    const declarations = [];
    if (safeColor(style.background)) declarations.push(`background:${style.background};--node-background:${style.background}`);
    if (safeColor(style.color)) declarations.push(`color:${style.color}`);
    declarations.push(`--node-font-size:${clamp(style.fontSize, 8, 64)}px`);
    declarations.push(`--node-padding:${clamp(style.padding, 0, 80)}px`);
    declarations.push(`--node-gap:${clamp(style.gap, 0, 48)}px`);
    declarations.push(`--node-align:${["stretch", "start", "center", "end"].includes(style.align) ? style.align : "stretch"}`);
    declarations.push(`font-weight:${[400, 500, 600, 700].includes(Number(style.fontWeight)) ? style.fontWeight : 400}`);
    declarations.push(`text-align:${["left", "center", "right"].includes(style.textAlign) ? style.textAlign : "left"}`);
    declarations.push(`border-radius:${clamp(style.radius, 0, 30)}px`);
    if (style.border && !["card", "input", "textarea", "select", "table"].includes(node.type)) declarations.push(`border:1px solid ${safeColor(style.borderColor, "#d9ddd5")}`);
    return declarations.join(";");
  }

  function nodeWidthClass(node) {
    return `proto-width-${["full", "half", "third", "auto"].includes(node.style?.width) ? node.style.width : "full"}`;
  }

  function listValues(value) {
    return String(value || "").split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  }

  function renderChildren(node, mode) {
    if (!node.children?.length) return mode === "editor" ? '<div class="proto-empty-container">添加或拖入组件</div>' : "";
    return node.children.map((child) => renderNode(child, mode)).join("");
  }

  function renderNodeContent(node, mode) {
    const props = node.props || {};
    const children = () => renderChildren(node, mode);
    if (node.type === "section") return `<section class="proto-render-section">${children()}</section>`;
    if (node.type === "stack") return `<div class="proto-render-stack">${children()}</div>`;
    if (node.type === "row") return `<div class="proto-render-row">${children()}</div>`;
    if (node.type === "grid") return `<div class="proto-render-grid" style="--node-columns:${clamp(props.columns, 1, 4)}">${children()}</div>`;
    if (node.type === "card") return `<div class="proto-render-card">${children()}</div>`;
    if (node.type === "divider") return '<hr class="proto-render-divider">';
    if (node.type === "spacer") return `<div class="proto-render-spacer" style="--node-height:${clamp(props.height, 4, 160)}px"></div>`;
    if (node.type === "topnav") return `<nav class="proto-render-nav"><strong>${escapeHtml(props.text)}</strong><div class="proto-nav-links">${listValues(props.items).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></nav>`;
    if (node.type === "sidenav") return `<nav class="proto-render-sidebar"><strong>${escapeHtml(props.text)}</strong>${listValues(props.items).map((item, index) => `<span class="${index === 0 ? "active" : ""}">${escapeHtml(item)}</span>`).join("")}</nav>`;
    if (node.type === "breadcrumbs") return `<div class="proto-render-breadcrumbs">${listValues(props.items).map(escapeHtml).join(" / ")}</div>`;
    if (node.type === "tabs") return `<div class="proto-tabs">${listValues(props.items).map((item, index) => `<span class="${index === 0 ? "active" : ""}">${escapeHtml(item)}</span>`).join("")}</div>`;
    if (node.type === "heading") {
      const level = clamp(props.level, 1, 6);
      return `<h${level} class="proto-render-heading">${escapeHtml(props.text)}</h${level}>`;
    }
    if (node.type === "text") return `<p class="proto-render-text">${escapeHtml(props.text)}</p>`;
    if (node.type === "image") {
      const source = (props.assetId && assetCache.get(props.assetId)) || props.src || "";
      if (props.assetId && !assetCache.has(props.assetId)) getAsset(props.assetId).then(() => renderAll()).catch(() => {});
      return source ? `<img class="proto-render-image" src="${escapeHtml(source)}" alt="${escapeHtml(props.alt || "")}" crossorigin="anonymous">` : `<div class="proto-image-placeholder">${escapeHtml(props.alt || "图片占位")}</div>`;
    }
    if (node.type === "icon") return `<div style="font-size:32px;line-height:1">${escapeHtml(props.text || "◆")}</div>`;
    if (node.type === "badge") return `<span class="proto-render-badge">${escapeHtml(props.text)}</span>`;
    if (node.type === "list") return `<ul class="proto-render-list">${listValues(props.items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    if (node.type === "table") {
      const columns = listValues(props.columns);
      const rows = String(props.rows || "").split("\n").filter(Boolean).map((row) => row.split(/[,，]/));
      return `<table class="proto-render-table"><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    if (node.type === "input") return `<label class="proto-form-label">${escapeHtml(props.label)}<input class="proto-render-input" placeholder="${escapeHtml(props.placeholder)}"></label>`;
    if (node.type === "textarea") return `<label class="proto-form-label">${escapeHtml(props.label)}<textarea class="proto-render-textarea" placeholder="${escapeHtml(props.placeholder)}"></textarea></label>`;
    if (node.type === "select") return `<label class="proto-form-label">${escapeHtml(props.label)}<select class="proto-render-select">${listValues(props.items).map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select></label>`;
    if (node.type === "radio") return `<label class="proto-check-row"><input type="radio" name="preview-radio">${escapeHtml(props.label)}</label>`;
    if (node.type === "checkbox") return `<label class="proto-check-row"><input type="checkbox">${escapeHtml(props.label)}</label>`;
    if (node.type === "switch") return `<div class="proto-check-row"><span class="proto-switch"></span>${escapeHtml(props.label)}</div>`;
    if (node.type === "button") return `<button class="proto-render-button ${props.variant === "secondary" ? "secondary" : ""}" type="button">${escapeHtml(props.text)}</button>`;
    if (node.type === "alert") return `<div class="proto-render-alert">${escapeHtml(props.text)}</div>`;
    if (node.type === "modal" || node.type === "drawer") return `<div class="proto-overlay-label">${node.type === "modal" ? "弹窗" : "抽屉"} · ${escapeHtml(props.label)}</div><div class="proto-render-${node.type}">${children()}</div>`;
    return `<p class="proto-render-text">${escapeHtml(props.text || COMPONENTS[node.type]?.label || "组件")}</p>`;
  }

  function renderNode(node, mode = "editor") {
    const definition = COMPONENTS[node.type] || COMPONENTS.text;
    const selected = mode === "editor" && node.id === selectedNodeId;
    const overlay = definition.overlay && mode !== "editor";
    const attributes = interactionAttributes(node);
    const wrapperClass = `proto-node ${nodeWidthClass(node)}${selected ? " selected" : ""}${overlay ? " proto-preview-overlay" : ""}`;
    return `<div class="${wrapperClass}" data-node-id="${escapeHtml(node.id)}" data-node-type="${escapeHtml(node.type)}" style="${nodeStyle(node)}"${mode === "editor" ? ' draggable="true"' : ""}${attributes}${overlay ? " hidden" : ""}><span class="proto-node-tag">${escapeHtml(definition.label)}</span>${renderNodeContent(node, mode)}</div>`;
  }

  function renderProjectLibrary() {
    const tree = document.getElementById("protoProjectTree");
    tree.replaceChildren();
    if (!workspace.projects.length) {
      tree.appendChild(Object.assign(document.createElement("div"), { className: "proto-library-empty", textContent: "暂无原型项目" }));
      return;
    }
    workspace.projects.forEach((project) => {
      const row = document.createElement("div");
      row.className = `proto-project-row${project.id === workspace.activeProjectId ? " active" : ""}`;
      row.innerHTML = `<button class="proto-project-main" type="button" data-project-open="${project.id}"><i data-lucide="panels-top-left"></i><span>${escapeHtml(project.name)}</span></button><div class="proto-project-actions">${makeIconButton("pencil", "重命名原型")}${makeIconButton("trash-2", "删除原型")}</div>`;
      row.querySelector("[data-project-open]").addEventListener("click", () => selectProject(project.id));
      const actions = row.querySelectorAll(".proto-project-actions button");
      actions[0].addEventListener("click", () => renameProject(project));
      actions[1].addEventListener("click", () => deleteProject(project));
      tree.appendChild(row);
    });
  }

  function renderPagesPanel() {
    const panel = document.getElementById("protoPagesPanel");
    const project = activeProject();
    panel.innerHTML = `<div class="proto-panel-heading"><strong>页面</strong>${makeIconButton("file-plus-2", "新建页面", "protoNewPage")}</div><div class="proto-page-list" id="protoPageList"></div>`;
    const list = panel.querySelector("#protoPageList");
    (project?.pages || []).forEach((page, index) => {
      const row = document.createElement("div");
      row.className = `proto-page-row${page.id === project.activePageId ? " active" : ""}`;
      row.innerHTML = `<button class="proto-page-main" type="button"><i data-lucide="${page.device === "mobile" ? "smartphone" : "monitor"}"></i><span>${escapeHtml(page.name)}</span>${page.id === project.startPageId ? '<i class="proto-start-mark" data-lucide="home"></i>' : ""}</button><div class="proto-row-actions">${makeIconButton("copy", "复制页面")}${makeIconButton("arrow-up", "上移页面")}${makeIconButton("arrow-down", "下移页面")}${makeIconButton("ellipsis", "页面操作")}</div>`;
      row.querySelector(".proto-page-main").addEventListener("click", () => selectPage(page.id));
      const buttons = row.querySelectorAll(".proto-row-actions button");
      buttons[0].addEventListener("click", () => duplicatePage(page));
      buttons[1].addEventListener("click", () => reorderPage(index, -1));
      buttons[2].addEventListener("click", () => reorderPage(index, 1));
      buttons[3].addEventListener("click", () => pageActions(page));
      list.appendChild(row);
    });
    panel.querySelector("#protoNewPage").addEventListener("click", openNewPageDialog);
  }

  function layerRows(node, depth = 0) {
    const definition = COMPONENTS[node.type] || COMPONENTS.text;
    return `<div class="proto-layer-row${node.id === selectedNodeId ? " active" : ""}"><button class="proto-layer-main" type="button" data-layer-id="${node.id}" style="padding-left:${7 + depth * 10}px"><i data-lucide="${definition.icon}"></i><span>${escapeHtml(node.props?.label || node.props?.text || definition.label)}</span></button></div>${(node.children || []).map((child) => layerRows(child, depth + 1)).join("")}`;
  }

  function renderLayersPanel() {
    const panel = document.getElementById("protoLayersPanel");
    const page = activePage();
    panel.innerHTML = `<div class="proto-panel-heading"><strong>图层</strong></div><div class="proto-layer-list">${page ? layerRows(page.rootNode) : ""}</div>`;
    panel.querySelectorAll("[data-layer-id]").forEach((button) => button.addEventListener("click", () => {
      selectedNodeId = button.dataset.layerId;
      renderCanvas();
      renderLayersPanel();
      renderProperties();
    }));
  }

  function renderComponentsPanel() {
    const panel = document.getElementById("protoComponentsPanel");
    const groups = [...new Set(Object.values(COMPONENTS).map((item) => item.category))];
    panel.innerHTML = groups.map((group) => `<section class="proto-component-group"><div class="proto-component-label">${group}</div><div class="proto-component-grid">${Object.entries(COMPONENTS).filter(([, definition]) => definition.category === group).map(([type, definition]) => `<button class="proto-component-button" data-add-component="${type}" type="button"><i data-lucide="${definition.icon}"></i><span>${definition.label}</span></button>`).join("")}</div></section>`).join("");
    panel.querySelectorAll("[data-add-component]").forEach((button) => button.addEventListener("click", () => addComponent(button.dataset.addComponent)));
  }

  function renderCanvas() {
    const stage = document.getElementById("protoCanvasStage");
    const project = activeProject();
    const page = activePage();
    if (!project || !page) {
      stage.innerHTML = `<div class="proto-library-empty"><strong>创建第一个原型项目</strong><br>从空白页面或模板开始设计。</div>`;
      return;
    }
    const width = page.device === "mobile" ? 390 : 1100;
    stage.innerHTML = `<div class="proto-device-shell" style="transform:scale(${zoom / 100})"><div class="proto-device-label"><span>${escapeHtml(page.name)}</span><span>${width}px · ${zoom}%</span></div><div class="proto-page-frame device-${page.device}" id="protoPageFrame" style="background:${safeColor(project.theme?.background, "#ffffff")}"><div class="proto-page-root">${renderNode(page.rootNode, "editor")}</div></div></div>`;
    bindCanvasInteractions();
  }

  function updateToolbar() {
    const project = activeProject();
    const page = activePage();
    document.getElementById("protoProjectTitle").textContent = project?.name || "原型设计";
    document.getElementById("protoZoom").textContent = `${zoom}%`;
    const history = project ? historyFor(project.id) : { undo: [], redo: [] };
    document.getElementById("protoUndo").disabled = !history.undo.length;
    document.getElementById("protoRedo").disabled = !history.redo.length;
    document.getElementById("protoDesktop").classList.toggle("active", page?.device === "desktop");
    document.getElementById("protoMobile").classList.toggle("active", page?.device === "mobile");
    ["protoDesktop", "protoMobile", "protoRelations", "protoVersions", "protoTemplates", "protoPreview", "protoExportMenu"].forEach((item) => { document.getElementById(item).disabled = !project; });
  }

  function renderAll() {
    renderProjectLibrary();
    renderPagesPanel();
    renderLayersPanel();
    renderComponentsPanel();
    renderCanvas();
    renderProperties();
    updateToolbar();
    window.lucide?.createIcons();
  }

  function optionMarkup(options, value) {
    return options.map((option) => {
      const item = typeof option === "string" ? { value: option, label: option } : option;
      return `<option value="${escapeHtml(item.value)}"${String(item.value) === String(value ?? "") ? " selected" : ""}>${escapeHtml(item.label)}</option>`;
    }).join("");
  }

  function propertyField(label, path, key, value, config = {}) {
    const type = config.type || "text";
    if (type === "select") {
      return `<div class="proto-field"><label>${escapeHtml(label)}</label><select data-property-path="${path}" data-property-key="${key}">${optionMarkup(config.options || [], value)}</select></div>`;
    }
    if (type === "textarea") {
      return `<div class="proto-field"><label>${escapeHtml(label)}</label><textarea data-property-path="${path}" data-property-key="${key}" placeholder="${escapeHtml(config.placeholder || "")}">${escapeHtml(value)}</textarea></div>`;
    }
    if (type === "checkbox") {
      return `<label class="proto-property-check"><input data-property-path="${path}" data-property-key="${key}" type="checkbox"${value ? " checked" : ""}><span>${escapeHtml(label)}</span></label>`;
    }
    return `<div class="proto-field"><label>${escapeHtml(label)}</label><input data-property-path="${path}" data-property-key="${key}" type="${type}" value="${escapeHtml(value)}"${config.min !== undefined ? ` min="${config.min}"` : ""}${config.max !== undefined ? ` max="${config.max}"` : ""}${config.step !== undefined ? ` step="${config.step}"` : ""} placeholder="${escapeHtml(config.placeholder || "")}"></div>`;
  }

  function renderContentProperties(node) {
    const props = node.props || {};
    const fields = [];
    const multiline = new Set(["text", "rows"]);
    const labels = {
      text: "文字内容", label: "名称", placeholder: "占位提示", items: "选项（逗号或换行分隔）",
      columns: "列标题（逗号分隔）", rows: "表格行（每行一条）", src: "图片 URL", alt: "图片说明",
      level: "标题层级", height: "高度", variant: "组件样式"
    };
    Object.keys(props).filter((key) => key !== "assetId" && labels[key]).forEach((key) => {
      if (key === "level") fields.push(propertyField(labels[key], "props", key, props[key], { type: "select", options: [1, 2, 3, 4, 5, 6] }));
      else if (key === "variant") fields.push(propertyField(labels[key], "props", key, props[key], { type: "select", options: [{ value: "primary", label: "主要" }, { value: "secondary", label: "次要" }] }));
      else if (key === "height") fields.push(propertyField(labels[key], "props", key, props[key], { type: "number", min: 4, max: 160 }));
      else if (key === "columns" && node.type === "grid") fields.push(propertyField("网格列数", "props", key, props[key], { type: "number", min: 1, max: 4 }));
      else fields.push(propertyField(labels[key], "props", key, props[key], { type: multiline.has(key) ? "textarea" : "text" }));
    });
    if (node.type === "image") {
      fields.push(`<div class="proto-field"><label>上传本地图片</label><label class="proto-upload-button"><i data-lucide="upload"></i><span>选择 PNG、JPEG 或 WebP</span><input id="protoImageUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><small>单张不超过 5 MB，本地保存于当前浏览器。</small></div>`);
    }
    if (!fields.length) fields.push('<div class="proto-property-empty">该组件没有可编辑的内容属性。</div>');
    return `<section class="proto-property-section"><div class="proto-property-title">${escapeHtml(COMPONENTS[node.type]?.label || "组件")}内容</div>${fields.join("")}</section>`;
  }

  function renderStyleProperties(node) {
    const style = node.style || {};
    return `<section class="proto-property-section">
      <div class="proto-property-title">布局与外观</div>
      ${propertyField("宽度", "style", "width", style.width, { type: "select", options: [{ value: "full", label: "全宽" }, { value: "half", label: "二分之一" }, { value: "third", label: "三分之一" }, { value: "auto", label: "自适应" }] })}
      ${propertyField("内容对齐", "style", "align", style.align, { type: "select", options: [{ value: "stretch", label: "拉伸" }, { value: "start", label: "顶部 / 左侧" }, { value: "center", label: "居中" }, { value: "end", label: "底部 / 右侧" }] })}
      ${propertyField("文字对齐", "style", "textAlign", style.textAlign || "left", { type: "select", options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }] })}
      ${propertyField("字号", "style", "fontSize", style.fontSize, { type: "number", min: 8, max: 64 })}
      ${propertyField("字重", "style", "fontWeight", style.fontWeight || 400, { type: "select", options: [400, 500, 600, 700] })}
      ${propertyField("内边距", "style", "padding", style.padding, { type: "number", min: 0, max: 80 })}
      ${propertyField("组件间距", "style", "gap", style.gap, { type: "number", min: 0, max: 48 })}
      ${propertyField("背景色", "style", "background", style.background || "#ffffff", { type: "color" })}
      ${propertyField("文字色", "style", "color", style.color || "#1f2420", { type: "color" })}
      ${propertyField("圆角", "style", "radius", style.radius, { type: "number", min: 0, max: 30 })}
      ${propertyField("显示边框", "style", "border", Boolean(style.border), { type: "checkbox" })}
      ${propertyField("边框色", "style", "borderColor", style.borderColor || "#d9ddd5", { type: "color" })}
    </section>`;
  }

  function interactionTargetOptions(action, node) {
    const project = activeProject();
    if (action === "navigate-page") return (project?.pages || []).map((page) => ({ value: page.id, label: page.name }));
    if (action === "open-overlay" || action === "close-overlay") return allNodes(activePage()?.rootNode).filter((item) => ["modal", "drawer"].includes(item.type)).map((item) => ({ value: item.id, label: item.props?.label || COMPONENTS[item.type].label }));
    if (action === "toggle-tabs") return allNodes(activePage()?.rootNode).filter((item) => item.type === "tabs").map((item) => ({ value: item.id, label: item.props?.label || "标签页" }));
    if (action === "toggle-node") return allNodes(activePage()?.rootNode).filter((item) => item.id !== node.id).map((item) => ({ value: item.id, label: item.props?.label || item.props?.text || COMPONENTS[item.type]?.label || "组件" }));
    return [];
  }

  function renderInteractionProperties(node) {
    const interaction = node.interactions?.[0] || { action: "none", targetId: "" };
    const actions = [
      { value: "none", label: "无交互" }, { value: "navigate-page", label: "跳转页面" }, { value: "back", label: "返回上一页" },
      { value: "open-overlay", label: "打开弹窗 / 抽屉" }, { value: "close-overlay", label: "关闭弹窗 / 抽屉" },
      { value: "toggle-tabs", label: "切换标签页" }, { value: "toggle-node", label: "显示 / 隐藏组件" }
    ];
    const targets = interactionTargetOptions(interaction.action, node);
    return `<section class="proto-property-section"><div class="proto-property-title">点击交互</div>
      ${propertyField("动作", "interaction", "action", interaction.action, { type: "select", options: actions })}
      ${targets.length ? propertyField("目标", "interaction", "targetId", interaction.targetId, { type: "select", options: [{ value: "", label: "请选择目标" }, ...targets] }) : '<p class="proto-property-hint">该动作不需要选择目标。</p>'}
    </section>`;
  }

  function prdReferenceStatus(project) {
    if (!project?.prdRef) return null;
    const file = window.AIPMPrdApi?.getFile(project.prdRef.fileId);
    if (!file) return { missing: true, text: "关联的 PRD 已不存在。原型内容不会被修改。" };
    const changed = file.updatedAt !== project.prdRef.updatedAt || (file.versions?.[0]?.id || null) !== project.prdRef.versionId;
    return { file, changed, text: changed ? "关联 PRD 已有更新，当前原型仍保留创建时的内容。" : "关联 PRD 与创建时版本一致。" };
  }

  function renderRequirementProperties(node) {
    const project = activeProject();
    const status = prdReferenceStatus(project);
    const prd = status?.file;
    const summary = prd ? String(prd.content || "").slice(0, 1000) : "";
    return `<section class="proto-property-section"><div class="proto-property-title">关联需求</div>
      ${status ? `<div class="proto-prd-state${status.changed || status.missing ? " changed" : ""}">${escapeHtml(status.text)}</div>` : '<div class="proto-prd-state">当前原型未关联 PRD。</div>'}
      ${prd ? `<div class="proto-prd-summary"><strong>${escapeHtml(project.prdRef.fileName || prd.name)}</strong>\n${escapeHtml(summary)}</div>` : ""}
      ${propertyField("组件需求说明", "props", "requirement", node.props?.requirement || "", { type: "textarea", placeholder: "记录该组件对应的需求、规则或验收点" })}
    </section>`;
  }

  function renderProperties() {
    const panel = document.getElementById("protoProperties");
    const node = currentNode();
    if (!node) {
      panel.innerHTML = '<div class="proto-property-empty">在画布或图层中选择组件后，可编辑内容、样式、交互和关联需求。</div>';
      return;
    }
    const root = node.id === activePage()?.rootNode.id;
    panel.innerHTML = `<div class="proto-property-actions">${makeIconButton("copy", "复制组件", "protoDuplicateNode")}${makeIconButton("arrow-up", "上移组件", "protoMoveNodeUp")}${makeIconButton("arrow-down", "下移组件", "protoMoveNodeDown")}${makeIconButton("trash-2", "删除组件", "protoDeleteNode")}</div><div id="protoPropertyBody"></div>`;
    panel.querySelector("#protoDuplicateNode").disabled = root;
    panel.querySelector("#protoMoveNodeUp").disabled = root;
    panel.querySelector("#protoMoveNodeDown").disabled = root;
    panel.querySelector("#protoDeleteNode").disabled = root;
    const body = panel.querySelector("#protoPropertyBody");
    if (activeRightTab === "content") body.innerHTML = renderContentProperties(node);
    else if (activeRightTab === "style") body.innerHTML = renderStyleProperties(node);
    else if (activeRightTab === "interaction") body.innerHTML = renderInteractionProperties(node);
    else body.innerHTML = renderRequirementProperties(node);
    bindPropertyInputs(node.id);
    panel.querySelector("#protoDuplicateNode").addEventListener("click", duplicateSelectedNode);
    panel.querySelector("#protoMoveNodeUp").addEventListener("click", () => moveSelectedNode(-1));
    panel.querySelector("#protoMoveNodeDown").addEventListener("click", () => moveSelectedNode(1));
    panel.querySelector("#protoDeleteNode").addEventListener("click", deleteSelectedNode);
    window.lucide?.createIcons();
  }

  function propertyInputValue(input) {
    if (input.type === "checkbox") return input.checked;
    if (input.type === "number") return Number(input.value);
    return input.value;
  }

  function bindPropertyInputs(nodeId) {
    document.querySelectorAll("#protoProperties [data-property-path]").forEach((input) => {
      const eventName = ["select-one", "checkbox", "color"].includes(input.type) ? "change" : "input";
      input.addEventListener(eventName, () => {
        const path = input.dataset.propertyPath;
        const key = input.dataset.propertyKey;
        const value = propertyInputValue(input);
        commit(() => {
          const found = findNode(activePage()?.rootNode, nodeId)?.node;
          if (!found) return;
          if (path === "interaction") {
            const current = found.interactions?.[0] || { action: "none", targetId: "" };
            current[key] = value;
            if (key === "action") current.targetId = "";
            found.interactions = current.action === "none" ? [] : [current];
          } else {
            found[path] = found[path] || {};
            found[path][key] = value;
          }
        }, { render: path === "interaction" && key === "action" });
        if (!(path === "interaction" && key === "action")) {
          renderCanvas();
          renderLayersPanel();
          updateToolbar();
          window.lucide?.createIcons();
        }
      });
    });
    const upload = document.getElementById("protoImageUpload");
    if (upload) upload.addEventListener("change", async () => {
      const file = upload.files?.[0];
      if (!file) return;
      if (!IMAGE_TYPES.has(file.type)) return notify("仅支持 PNG、JPEG 和 WebP 图片");
      if (file.size > MAX_IMAGE_SIZE) return notify("图片不能超过 5 MB");
      try {
        const assetId = id("asset");
        const dataUrl = await readFile(file);
        await putAsset({ id: assetId, name: file.name, type: file.type, size: file.size, dataUrl, createdAt: new Date().toISOString() });
        commit(() => {
          const found = findNode(activePage()?.rootNode, nodeId)?.node;
          if (found) found.props = { ...found.props, assetId, src: "" };
        });
        notify("图片已保存到当前浏览器");
      } catch (error) {
        notify("图片保存失败，请重试");
      }
    });
  }

  function insertionTarget() {
    const page = activePage();
    const selected = findNode(page?.rootNode, selectedNodeId);
    if (!selected) return { parent: page?.rootNode, index: page?.rootNode.children?.length || 0 };
    if (CONTAINER_TYPES.has(selected.node.type)) return { parent: selected.node, index: selected.node.children.length };
    const index = selected.parent?.children.findIndex((item) => item.id === selected.node.id) ?? -1;
    return { parent: selected.parent || page.rootNode, index: index + 1 };
  }

  function addComponent(type) {
    if (!activePage()) return notify("请先创建原型项目");
    commit(() => {
      const target = COMPONENTS[type]?.overlay ? { parent: activePage().rootNode, index: activePage().rootNode.children.length } : insertionTarget();
      const node = createNode(type);
      target.parent.children.splice(target.index, 0, node);
      selectedNodeId = node.id;
    }, { forceHistory: true });
  }

  function duplicateSelectedNode() {
    const found = findNode(activePage()?.rootNode, selectedNodeId);
    if (!found?.parent) return;
    commit(() => {
      const index = found.parent.children.findIndex((item) => item.id === found.node.id);
      const copy = cloneNodeWithIds(found.node);
      found.parent.children.splice(index + 1, 0, copy);
      selectedNodeId = copy.id;
    }, { forceHistory: true });
  }

  function moveSelectedNode(direction) {
    const found = findNode(activePage()?.rootNode, selectedNodeId);
    if (!found?.parent) return;
    const index = found.parent.children.findIndex((item) => item.id === found.node.id);
    const next = index + direction;
    if (next < 0 || next >= found.parent.children.length) return;
    commit(() => {
      const [node] = found.parent.children.splice(index, 1);
      found.parent.children.splice(next, 0, node);
    }, { forceHistory: true });
  }

  function deleteSelectedNode() {
    const found = findNode(activePage()?.rootNode, selectedNodeId);
    if (!found?.parent) return;
    openDialog({ title: "删除组件", description: "该组件及其内部内容将被删除，可使用撤销恢复。", confirmLabel: "删除", destructive: true, onConfirm: () => {
      commit(() => {
        found.parent.children = found.parent.children.filter((item) => item.id !== found.node.id);
        selectedNodeId = found.parent.id;
      }, { forceHistory: true });
    } });
  }

  function bindCanvasInteractions() {
    const frame = document.getElementById("protoPageFrame");
    if (!frame) return;
    frame.addEventListener("click", (event) => {
      const nodeElement = event.target.closest("[data-node-id]");
      if (!nodeElement) return;
      event.preventDefault();
      event.stopPropagation();
      selectedNodeId = nodeElement.dataset.nodeId;
      renderCanvas();
      renderLayersPanel();
      renderProperties();
    });
    frame.querySelectorAll("[data-node-id]").forEach((element) => {
      element.addEventListener("dragstart", (event) => {
        const found = findNode(activePage()?.rootNode, element.dataset.nodeId);
        if (!found?.parent) return event.preventDefault();
        draggedNodeId = element.dataset.nodeId;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedNodeId);
      });
      element.addEventListener("dragover", (event) => {
        if (!draggedNodeId) return;
        const dragged = findNode(activePage()?.rootNode, draggedNodeId)?.node;
        if (!dragged || nodeContains(dragged, element.dataset.nodeId)) return;
        event.preventDefault();
        event.stopPropagation();
        frame.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
        element.classList.add("drop-target");
      });
      element.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sourceId = draggedNodeId;
        const targetId = element.dataset.nodeId;
        draggedNodeId = null;
        frame.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
        moveNodeByDrag(sourceId, targetId, event.clientY, element.getBoundingClientRect());
      });
      element.addEventListener("dragend", () => {
        draggedNodeId = null;
        frame.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
      });
    });
  }

  function moveNodeByDrag(sourceId, targetId, pointerY, rect) {
    const page = activePage();
    const source = findNode(page?.rootNode, sourceId);
    const target = findNode(page?.rootNode, targetId);
    if (!source?.parent || !target || sourceId === targetId || nodeContains(source.node, targetId)) return;
    commit(() => {
      const sourceIndex = source.parent.children.findIndex((item) => item.id === sourceId);
      const [moving] = source.parent.children.splice(sourceIndex, 1);
      if (CONTAINER_TYPES.has(target.node.type)) {
        target.node.children.push(moving);
      } else if (target.parent) {
        let targetIndex = target.parent.children.findIndex((item) => item.id === targetId);
        if (pointerY > rect.top + rect.height / 2) targetIndex += 1;
        target.parent.children.splice(targetIndex, 0, moving);
      }
      selectedNodeId = sourceId;
    }, { forceHistory: true });
  }

  let dialogSubmit = null;

  function openDialog({ title, description = "", fields = [], confirmLabel = "确认", destructive = false, onConfirm }) {
    const backdrop = document.getElementById("protoDialog");
    document.getElementById("protoDialogTitle").textContent = title;
    document.getElementById("protoDialogDescription").textContent = description;
    document.getElementById("protoDialogFields").innerHTML = fields.map((field) => {
      const inputId = `proto-dialog-${field.name}`;
      if (field.type === "select") return `<label class="field"><span class="field-label">${escapeHtml(field.label)}</span><select class="text-input select-input" id="${inputId}" name="${escapeHtml(field.name)}"${field.required ? " required" : ""}>${optionMarkup(field.options || [], field.value)}</select></label>`;
      return `<label class="field"><span class="field-label">${escapeHtml(field.label)}</span><input class="text-input" id="${inputId}" name="${escapeHtml(field.name)}" type="${field.type || "text"}" value="${escapeHtml(field.value || "")}" placeholder="${escapeHtml(field.placeholder || "")}"${field.required ? " required" : ""}></label>`;
    }).join("");
    const confirm = document.getElementById("protoDialogConfirm");
    confirm.textContent = confirmLabel;
    confirm.classList.toggle("destructive", destructive);
    dialogSubmit = onConfirm;
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    window.setTimeout(() => document.querySelector("#protoDialogFields input, #protoDialogFields select")?.focus(), 0);
  }

  function closeDialog() {
    const backdrop = document.getElementById("protoDialog");
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
    dialogSubmit = null;
  }

  function prdOptions() {
    return [{ value: "", label: "不关联 PRD" }, ...(window.AIPMPrdApi?.listFiles?.() || []).map((file) => ({ value: file.id, label: file.title || file.name }))];
  }

  function openNewProjectDialog() {
    openDialog({
      title: "新建原型项目", description: "选择起始模板和设备，后续可继续添加页面。", confirmLabel: "创建项目",
      fields: [
        { name: "name", label: "项目名称", value: "新原型项目", required: true },
        { name: "prdId", label: "关联 PRD", type: "select", options: prdOptions() },
        { name: "templateId", label: "首个页面模板", type: "select", value: "blank", options: BUILTIN_PAGE_TEMPLATES.map((item) => ({ value: item.id, label: item.name })) },
        { name: "device", label: "页面设备", type: "select", value: "desktop", options: [{ value: "desktop", label: "桌面 1100px" }, { value: "mobile", label: "手机 390px" }] }
      ],
      onConfirm: (values) => {
        const page = makePage("首页", values.device, values.templateId);
        const prd = values.prdId ? window.AIPMPrdApi?.getFile(values.prdId) : null;
        const now = new Date().toISOString();
        const project = {
          id: id("prototype"), name: values.name.trim(),
          prdRef: prd ? { fileId: prd.id, fileName: prd.name, versionId: prd.versions?.[0]?.id || null, updatedAt: prd.updatedAt } : null,
          startPageId: page.id, activePageId: page.id, pages: [page], theme: { primary: "#5f861d", background: "#ffffff" }, versions: [], createdAt: now, updatedAt: now
        };
        project.versions.push(createVersion(project, "初始版本"));
        workspace.projects.push(project);
        workspace.activeProjectId = project.id;
        selectedNodeId = page.rootNode.id;
        persistNow();
        setPrototypeHash(project.id, page.id);
        renderAll();
        notify("原型项目已创建");
      }
    });
  }

  function selectProject(projectId) {
    const project = workspace.projects.find((item) => item.id === projectId);
    if (!project) return;
    workspace.activeProjectId = project.id;
    project.activePageId = project.activePageId || project.pages[0]?.id || null;
    selectedNodeId = project.pages.find((page) => page.id === project.activePageId)?.rootNode.id || null;
    persistNow();
    setPrototypeHash(project.id, project.activePageId);
    renderAll();
  }

  function renameProject(project) {
    openDialog({ title: "重命名原型项目", fields: [{ name: "name", label: "项目名称", value: project.name, required: true }], onConfirm: (values) => {
      workspace.activeProjectId = project.id;
      commit((active) => { active.name = values.name.trim(); }, { forceHistory: true });
    } });
  }

  function deleteProject(project) {
    openDialog({ title: "删除原型项目", description: `“${project.name}”及其页面和版本将从当前浏览器删除。`, confirmLabel: "删除项目", destructive: true, onConfirm: () => {
      workspace.projects = workspace.projects.filter((item) => item.id !== project.id);
      histories.delete(project.id);
      workspace.activeProjectId = workspace.projects[0]?.id || null;
      persistNow();
      const next = activeProject();
      setPrototypeHash(next?.id, next?.activePageId);
      selectedNodeId = activePage()?.rootNode.id || null;
      renderAll();
      notify("原型项目已删除");
    } });
  }

  function selectPage(pageId) {
    const project = activeProject();
    if (!project?.pages.some((page) => page.id === pageId)) return;
    project.activePageId = pageId;
    selectedNodeId = activePage()?.rootNode.id || null;
    persistNow();
    setPrototypeHash(project.id, pageId);
    renderAll();
  }

  function openNewPageDialog() {
    if (!activeProject()) return notify("请先创建原型项目");
    openDialog({ title: "新建页面", confirmLabel: "创建页面", fields: [
      { name: "name", label: "页面名称", value: "新页面", required: true },
      { name: "templateId", label: "页面模板", type: "select", value: "blank", options: [...BUILTIN_PAGE_TEMPLATES.map((item) => ({ value: item.id, label: item.name })), ...workspace.templates.map((item) => ({ value: item.id, label: `我的模板 · ${item.name}` }))] },
      { name: "device", label: "页面设备", type: "select", value: activePage()?.device || "desktop", options: [{ value: "desktop", label: "桌面 1100px" }, { value: "mobile", label: "手机 390px" }] }
    ], onConfirm: (values) => {
      commit((project) => {
        const custom = workspace.templates.find((item) => item.id === values.templateId);
        let page;
        if (custom) {
          page = clone(custom.page);
          page.id = id("page");
          page.rootNode = cloneNodeWithIds(page.rootNode);
          page.name = values.name.trim();
          page.device = values.device;
          page.createdAt = new Date().toISOString();
          page.updatedAt = page.createdAt;
        } else page = makePage(values.name.trim(), values.device, values.templateId);
        project.pages.push(page);
        project.activePageId = page.id;
        selectedNodeId = page.rootNode.id;
        window.setTimeout(() => setPrototypeHash(project.id, page.id), 0);
      }, { forceHistory: true });
    } });
  }

  function duplicatePage(page) {
    commit((project) => {
      const index = project.pages.findIndex((item) => item.id === page.id);
      const copy = clone(page);
      copy.id = id("page");
      copy.name = `${page.name} 副本`;
      copy.rootNode = cloneNodeWithIds(page.rootNode);
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      project.pages.splice(index + 1, 0, copy);
      project.activePageId = copy.id;
      selectedNodeId = copy.rootNode.id;
      window.setTimeout(() => setPrototypeHash(project.id, copy.id), 0);
    }, { forceHistory: true });
  }

  function reorderPage(index, direction) {
    const project = activeProject();
    const next = index + direction;
    if (!project || next < 0 || next >= project.pages.length) return;
    commit((active) => {
      const [page] = active.pages.splice(index, 1);
      active.pages.splice(next, 0, page);
    }, { forceHistory: true });
  }

  function pageActions(page) {
    openDialog({ title: "页面操作", fields: [{ name: "action", label: "选择操作", type: "select", value: "rename", options: [{ value: "rename", label: "重命名页面" }, { value: "start", label: "设为起始页面" }, { value: "delete", label: "删除页面" }] }], onConfirm: (values) => {
      if (values.action === "rename") renamePage(page);
      else if (values.action === "start") {
        commit((project) => { project.startPageId = page.id; }, { forceHistory: true });
        notify("已设为起始页面");
      } else deletePage(page);
    } });
  }

  function renamePage(page) {
    openDialog({ title: "重命名页面", fields: [{ name: "name", label: "页面名称", value: page.name, required: true }], onConfirm: (values) => {
      commit(() => { page.name = values.name.trim(); page.updatedAt = new Date().toISOString(); }, { forceHistory: true });
    } });
  }

  function deletePage(page) {
    const project = activeProject();
    if (project.pages.length === 1) return notify("项目至少需要保留一个页面");
    openDialog({ title: "删除页面", description: "删除前会自动保存一个版本，可从版本历史还原。", confirmLabel: "删除页面", destructive: true, onConfirm: () => {
      saveVersion("删除页面前备份");
      commit((active) => {
        active.pages = active.pages.filter((item) => item.id !== page.id);
        if (active.startPageId === page.id) active.startPageId = active.pages[0].id;
        if (active.activePageId === page.id) active.activePageId = active.pages[0].id;
        selectedNodeId = active.pages.find((item) => item.id === active.activePageId)?.rootNode.id || null;
        window.setTimeout(() => setPrototypeHash(active.id, active.activePageId), 0);
      }, { forceHistory: true });
    } });
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function openTemplateModal() {
    if (!activeProject()) return notify("请先创建原型项目");
    const builtins = document.getElementById("protoBuiltinTemplates");
    builtins.innerHTML = BUILTIN_PAGE_TEMPLATES.map((template) => `<article class="template-item"><div class="template-copy"><div class="template-name">${escapeHtml(template.name)}</div><div class="template-desc">${escapeHtml(template.description)}</div></div><div class="template-actions"><button class="button" type="button" data-apply-builtin="${template.id}">应用</button></div></article>`).join("");
    const custom = document.getElementById("protoCustomTemplates");
    custom.innerHTML = workspace.templates.length ? workspace.templates.map((template) => `<article class="template-item"><div class="template-copy"><div class="template-name">${escapeHtml(template.name)}</div><div class="template-desc">${escapeHtml(template.page.name)} · ${template.page.device === "mobile" ? "手机" : "桌面"}</div></div><div class="template-actions"><button class="button" type="button" data-apply-custom="${template.id}">应用</button><button class="icon-button" type="button" data-delete-template="${template.id}" title="删除模板" aria-label="删除模板"><i data-lucide="trash-2"></i></button></div></article>`).join("") : '<div class="version-empty">尚未保存自定义页面模板</div>';
    builtins.querySelectorAll("[data-apply-builtin]").forEach((button) => button.addEventListener("click", () => applyTemplate(button.dataset.applyBuiltin, false)));
    custom.querySelectorAll("[data-apply-custom]").forEach((button) => button.addEventListener("click", () => applyTemplate(button.dataset.applyCustom, true)));
    custom.querySelectorAll("[data-delete-template]").forEach((button) => button.addEventListener("click", () => deleteCustomTemplate(button.dataset.deleteTemplate)));
    const modal = document.getElementById("protoTemplateModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    window.lucide?.createIcons();
  }

  function applyTemplate(templateId, custom) {
    const page = activePage();
    if (!page) return;
    saveVersion("应用模板前备份");
    commit(() => {
      const source = custom ? clone(workspace.templates.find((item) => item.id === templateId)?.page) : BUILTIN_PAGE_TEMPLATES.find((item) => item.id === templateId)?.create();
      if (!source) return;
      page.device = source.device;
      page.rootNode = cloneNodeWithIds(source.rootNode);
      page.updatedAt = new Date().toISOString();
      selectedNodeId = page.rootNode.id;
    }, { forceHistory: true });
    closeModal("protoTemplateModal");
    notify("模板已应用，原页面已自动备份");
  }

  function saveCurrentPageTemplate() {
    closeModal("protoTemplateModal");
    openDialog({ title: "保存为页面模板", description: "模板可在任意原型项目中新建或替换页面。", confirmLabel: "保存模板", fields: [{ name: "name", label: "模板名称", value: activePage()?.name || "自定义模板", required: true }], onConfirm: (values) => {
      workspace.templates.unshift({ id: id("template"), name: values.name.trim(), page: clone(activePage()), createdAt: new Date().toISOString() });
      persistNow();
      notify("自定义模板已保存");
    } });
  }

  function deleteCustomTemplate(templateId) {
    const template = workspace.templates.find((item) => item.id === templateId);
    if (!template) return;
    closeModal("protoTemplateModal");
    openDialog({ title: "删除自定义模板", description: `删除“${template.name}”不会影响已创建的页面。`, confirmLabel: "删除模板", destructive: true, onConfirm: () => {
      workspace.templates = workspace.templates.filter((item) => item.id !== templateId);
      persistNow();
      notify("模板已删除");
    } });
  }

  function formatDate(value) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function openVersionModal() {
    const project = activeProject();
    if (!project) return;
    const list = document.getElementById("protoVersionList");
    list.innerHTML = project.versions.length ? project.versions.map((version) => `<article class="version-item"><div class="version-copy"><div class="version-name">${escapeHtml(version.label)}</div><div class="version-meta">${formatDate(version.createdAt)} · ${version.snapshot.pages?.length || 0} 个页面</div></div><div class="version-actions"><button class="button" type="button" data-restore-version="${version.id}">还原</button></div></article>`).join("") : '<div class="version-empty">暂无历史版本</div>';
    list.querySelectorAll("[data-restore-version]").forEach((button) => button.addEventListener("click", () => confirmRestoreVersion(button.dataset.restoreVersion)));
    const modal = document.getElementById("protoVersionModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function promptSaveVersion() {
    closeModal("protoVersionModal");
    openDialog({ title: "保存当前版本", fields: [{ name: "label", label: "版本名称", value: `手动版本 ${formatDate(new Date().toISOString())}`, required: true }], confirmLabel: "保存版本", onConfirm: (values) => {
      saveVersion(values.label.trim());
      renderAll();
      notify("版本已保存");
    } });
  }

  function confirmRestoreVersion(versionId) {
    const version = activeProject()?.versions.find((item) => item.id === versionId);
    if (!version) return;
    closeModal("protoVersionModal");
    openDialog({ title: "还原历史版本", description: "还原前会自动备份当前状态，页面、组件和交互都将回到所选版本。", confirmLabel: "还原版本", onConfirm: () => {
      saveVersion("版本还原前备份");
      commit((project) => {
        applyProjectSnapshot(project, version.snapshot);
        selectedNodeId = activePage()?.rootNode.id || null;
        window.setTimeout(() => setPrototypeHash(project.id, project.activePageId), 0);
      }, { forceHistory: true });
      notify("已还原历史版本");
    } });
  }

  function openRelationModal() {
    const project = activeProject();
    if (!project) return;
    const pageNames = new Map(project.pages.map((page) => [page.id, page.name]));
    const links = [];
    project.pages.forEach((page) => allNodes(page.rootNode).forEach((node) => (node.interactions || []).forEach((interaction) => {
      if (interaction.action === "navigate-page" && pageNames.has(interaction.targetId)) {
        links.push({ from: page.name, via: node.props?.text || node.props?.label || COMPONENTS[node.type]?.label || "组件", to: pageNames.get(interaction.targetId) });
      }
    })));
    document.getElementById("protoRelationList").innerHTML = links.length ? links.map((link) => `<div class="proto-relation-row"><div class="proto-relation-node"><strong>${escapeHtml(link.from)}</strong><small>${escapeHtml(link.via)}</small></div><div class="proto-relation-arrow">→</div><div class="proto-relation-node"><strong>${escapeHtml(link.to)}</strong></div></div>`).join("") : '<div class="version-empty">尚未配置页面跳转关系</div>';
    const modal = document.getElementById("protoRelationModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function openPreview() {
    const project = activeProject();
    if (!project) return;
    previewState = { pageId: project.startPageId || project.activePageId, stack: [], overlays: new Set(), hidden: new Set() };
    const modal = document.getElementById("protoPreviewModal");
    modal.classList.add("open");
    renderPreview();
  }

  function closePreview() {
    document.getElementById("protoPreviewModal").classList.remove("open");
  }

  function renderPreview() {
    const project = activeProject();
    const page = project?.pages.find((item) => item.id === previewState.pageId);
    if (!page) return closePreview();
    document.getElementById("protoPreviewTitle").textContent = `${project.name} · ${page.name}`;
    const stage = document.getElementById("protoPreviewStage");
    stage.innerHTML = `<div class="proto-page-frame device-${page.device}" style="background:${safeColor(project.theme?.background, "#ffffff")}"><div class="proto-page-root">${renderNode(page.rootNode, "preview")}</div></div>`;
    previewState.overlays.forEach((nodeId) => stage.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`)?.removeAttribute("hidden"));
    previewState.hidden.forEach((nodeId) => stage.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`)?.setAttribute("hidden", ""));
    stage.addEventListener("click", handlePreviewClick);
    document.getElementById("protoPreviewBack").disabled = !previewState.stack.length;
    window.lucide?.createIcons();
  }

  function handlePreviewClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    event.preventDefault();
    const action = trigger.dataset.action;
    const targetId = trigger.dataset.target;
    if (action === "navigate-page" && activeProject()?.pages.some((page) => page.id === targetId)) {
      previewState.stack.push(previewState.pageId);
      previewState.pageId = targetId;
      previewState.overlays.clear();
      previewState.hidden.clear();
      renderPreview();
    } else if (action === "back") previewBack();
    else if (action === "open-overlay") {
      previewState.overlays.add(targetId);
      document.querySelector(`#protoPreviewStage [data-node-id="${CSS.escape(targetId)}"]`)?.removeAttribute("hidden");
    } else if (action === "close-overlay") {
      const overlay = targetId ? document.querySelector(`#protoPreviewStage [data-node-id="${CSS.escape(targetId)}"]`) : trigger.closest(".proto-preview-overlay");
      if (overlay) {
        previewState.overlays.delete(overlay.dataset.nodeId);
        overlay.setAttribute("hidden", "");
      }
    } else if (action === "toggle-node") {
      const target = document.querySelector(`#protoPreviewStage [data-node-id="${CSS.escape(targetId)}"]`);
      if (target) {
        const hidden = target.hasAttribute("hidden");
        target.toggleAttribute("hidden", !hidden);
        if (hidden) previewState.hidden.delete(targetId); else previewState.hidden.add(targetId);
      }
    } else if (action === "toggle-tabs") {
      const tabs = document.querySelector(`#protoPreviewStage [data-node-id="${CSS.escape(targetId || trigger.dataset.nodeId)}"] .proto-tabs`);
      if (tabs) {
        const items = [...tabs.children];
        const index = items.findIndex((item) => item.classList.contains("active"));
        items.forEach((item) => item.classList.remove("active"));
        items[(index + 1) % items.length]?.classList.add("active");
      }
    }
  }

  function previewBack() {
    if (!previewState.stack.length) return;
    previewState.pageId = previewState.stack.pop();
    previewState.overlays.clear();
    previewState.hidden.clear();
    renderPreview();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename(value, extension) {
    return `${String(value || "prototype").replace(/[\\/:*?"<>|]+/g, "-")}.${extension}`;
  }

  async function hydrateProjectAssets(project) {
    const assetIds = new Set();
    project.pages.forEach((page) => allNodes(page.rootNode).forEach((node) => {
      if (node.type === "image" && node.props?.assetId) assetIds.add(node.props.assetId);
    }));
    await Promise.all([...assetIds].map((assetId) => getAsset(assetId).catch(() => "")));
  }

  function exportedRuntime() {
    return `<script>(function(){var project=document.querySelector('[data-prototype-project]');var current=project.dataset.startPage;var stack=[];function show(id,push){var page=document.querySelector('[data-page-id="'+CSS.escape(id)+'"]');if(!page)return;if(push)stack.push(current);document.querySelectorAll('[data-page-id]').forEach(function(item){item.hidden=item!==page;});current=id;}show(current,false);document.addEventListener('click',function(event){var trigger=event.target.closest('[data-action]');if(!trigger)return;var action=trigger.dataset.action,target=trigger.dataset.target;if(action==='navigate-page'){event.preventDefault();show(target,true);}else if(action==='back'){event.preventDefault();if(stack.length)show(stack.pop(),false);}else if(action==='open-overlay'){event.preventDefault();var overlay=document.querySelector('[data-node-id="'+CSS.escape(target)+'"]');if(overlay)overlay.hidden=false;}else if(action==='close-overlay'){event.preventDefault();var closeTarget=target?document.querySelector('[data-node-id="'+CSS.escape(target)+'"]'):trigger.closest('.proto-preview-overlay');if(closeTarget)closeTarget.hidden=true;}else if(action==='toggle-node'){event.preventDefault();var node=document.querySelector('[data-node-id="'+CSS.escape(target)+'"]');if(node)node.hidden=!node.hidden;}else if(action==='toggle-tabs'){event.preventDefault();var tabs=document.querySelector('[data-node-id="'+CSS.escape(target||trigger.dataset.nodeId)+'"] .proto-tabs');if(tabs){var items=Array.from(tabs.children),index=items.findIndex(function(item){return item.classList.contains('active');});items.forEach(function(item){item.classList.remove('active');});if(items.length)items[(index+1)%items.length].classList.add('active');}}});})();<\/script>`;
  }

  async function exportHtml() {
    const project = activeProject();
    if (!project) return;
    try {
      await hydrateProjectAssets(project);
      const css = await fetch("prototype/prototype.css").then((response) => response.ok ? response.text() : Promise.reject(new Error("style")));
      const pages = project.pages.map((page) => `<main class="export-page" data-page-id="${escapeHtml(page.id)}" hidden><div class="proto-page-frame device-${page.device}"><div class="proto-page-root">${renderNode(page.rootNode, "export")}</div></div></main>`).join("");
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.name)}</title><style>${css}\n*{box-sizing:border-box}body{margin:0;background:#eef0eb;color:#1f2420;font-family:Arial,sans-serif}.export-page{min-height:100vh;padding:24px}.export-page>.proto-page-frame{margin:0 auto;box-shadow:0 12px 36px rgba(0,0,0,.14)}@media(max-width:560px){.export-page{padding:0}.proto-page-frame.device-mobile{width:100%;border:0;border-radius:0}}</style></head><body data-prototype-project data-start-page="${escapeHtml(project.startPageId || project.pages[0]?.id || "")}">${pages}${exportedRuntime()}</body></html>`;
      downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), safeFilename(project.name, "html"));
      notify("独立 HTML 已导出");
    } catch (error) {
      notify("HTML 导出失败，请刷新后重试");
    }
  }

  function externalImageUrls(page) {
    return allNodes(page?.rootNode).filter((node) => node.type === "image" && /^https?:\/\//i.test(node.props?.src || "")).map((node) => node.props.src);
  }

  async function exportPng() {
    const project = activeProject();
    const page = activePage();
    const frame = document.getElementById("protoPageFrame");
    if (!project || !page || !frame) return;
    if (!window.htmlToImage?.toPng) return notify("PNG 导出组件加载失败，HTML 导出仍可使用");
    frame.classList.add("proto-export-clean");
    try {
      await hydrateProjectAssets(project);
      const width = page.device === "mobile" ? 390 : 1100;
      const height = Math.max(page.device === "mobile" ? 760 : 720, frame.scrollHeight);
      const dataUrl = await window.htmlToImage.toPng(frame, { cacheBust: true, pixelRatio: 1, width, height, skipFonts: true, backgroundColor: safeColor(project.theme?.background, "#ffffff") });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = safeFilename(`${project.name}-${page.name}`, "png");
      anchor.click();
      notify("当前页面 PNG 已导出");
    } catch (error) {
      const urls = externalImageUrls(page);
      notify(urls.length ? `外部图片跨域限制导致导出失败：${urls[0]}` : "PNG 导出失败，请刷新后重试");
    } finally {
      frame.classList.remove("proto-export-clean");
    }
  }

  function openExportDialog() {
    openDialog({ title: "导出原型", description: "HTML 包含项目内全部页面与交互；PNG 导出当前页面。", confirmLabel: "开始导出", fields: [{ name: "format", label: "导出格式", type: "select", value: "html", options: [{ value: "html", label: "独立可运行 HTML" }, { value: "png", label: "当前页面 PNG" }] }], onConfirm: (values) => {
      if (values.format === "html") exportHtml(); else exportPng();
    } });
  }

  function setPrototypeHash(projectId, pageId) {
    const parts = ["prototype"];
    if (projectId) parts.push(encodeURIComponent(projectId));
    if (pageId) parts.push(encodeURIComponent(pageId));
    const next = `#${parts.join("/")}`;
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function switchWorkspace(mode, route = {}) {
    const isPrototype = mode === "prototype";
    document.title = `AI PM 工作台 · ${isPrototype ? "原型设计" : "PRD 制作"}`;
    document.getElementById("prdWorkspace").hidden = isPrototype;
    document.getElementById("prototypeWorkspace").hidden = !isPrototype;
    document.querySelector(".prd-library").hidden = isPrototype;
    document.getElementById("protoProjectLibrary").hidden = !isPrototype;
    document.querySelector(".sidebar-footer").hidden = isPrototype;
    document.body.classList.toggle("prototype-mode", isPrototype);
    document.getElementById("prdWorkflowButton").classList.toggle("active", !isPrototype);
    document.getElementById("prototypeWorkflowButton").classList.toggle("active", isPrototype);
    document.getElementById("prdWorkflowButton").toggleAttribute("aria-current", !isPrototype);
    document.getElementById("prototypeWorkflowButton").toggleAttribute("aria-current", isPrototype);
    if (!isPrototype) return;
    const requestedProject = workspace.projects.find((project) => project.id === route.projectId);
    if (requestedProject) workspace.activeProjectId = requestedProject.id;
    const project = activeProject();
    if (project) {
      if (project.pages.some((page) => page.id === route.pageId)) project.activePageId = route.pageId;
      project.activePageId = project.activePageId || project.pages[0]?.id || null;
      selectedNodeId = project.pages.find((page) => page.id === project.activePageId)?.rootNode.id || null;
    }
    renderAll();
  }

  function routeFromHash() {
    const parts = location.hash.replace(/^#/, "").split("/").map((part) => decodeURIComponent(part));
    if (parts[0] === "prototype") switchWorkspace("prototype", { projectId: parts[1], pageId: parts[2] });
    else {
      if (location.hash !== "#prd") history.replaceState(null, "", "#prd");
      switchWorkspace("prd");
    }
  }

  function closeMobilePanels() {
    document.getElementById("protoEditor").classList.remove("mobile-left-open", "mobile-right-open");
  }

  function bindEvents() {
    document.getElementById("newPrototypeProjectButton").addEventListener("click", openNewProjectDialog);
    document.getElementById("prdWorkflowButton").addEventListener("click", () => { location.hash = "prd"; });
    document.getElementById("prototypeWorkflowButton").addEventListener("click", () => { setPrototypeHash(activeProject()?.id, activeProject()?.activePageId); routeFromHash(); });
    document.getElementById("protoGlobalMenu").addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("open");
      document.getElementById("sidebarBackdrop").classList.add("open");
    });
    document.getElementById("protoUndo").addEventListener("click", undo);
    document.getElementById("protoRedo").addEventListener("click", redo);
    document.getElementById("protoDesktop").addEventListener("click", () => commit(() => { activePage().device = "desktop"; }, { forceHistory: true }));
    document.getElementById("protoMobile").addEventListener("click", () => commit(() => { activePage().device = "mobile"; }, { forceHistory: true }));
    document.getElementById("protoZoomOut").addEventListener("click", () => { zoom = Math.max(35, zoom - 10); renderCanvas(); updateToolbar(); });
    document.getElementById("protoZoomIn").addEventListener("click", () => { zoom = Math.min(115, zoom + 10); renderCanvas(); updateToolbar(); });
    document.getElementById("protoRelations").addEventListener("click", openRelationModal);
    document.getElementById("protoVersions").addEventListener("click", openVersionModal);
    document.getElementById("protoTemplates").addEventListener("click", openTemplateModal);
    document.getElementById("protoModelSettings").addEventListener("click", () => document.getElementById("modelSettingsButton").click());
    document.getElementById("protoPreview").addEventListener("click", openPreview);
    document.getElementById("protoExportMenu").addEventListener("click", openExportDialog);
    document.getElementById("protoOpenLeft").addEventListener("click", () => {
      const editor = document.getElementById("protoEditor");
      editor.classList.remove("mobile-right-open");
      editor.classList.toggle("mobile-left-open");
    });
    document.getElementById("protoOpenRight").addEventListener("click", () => {
      const editor = document.getElementById("protoEditor");
      editor.classList.remove("mobile-left-open");
      editor.classList.toggle("mobile-right-open");
    });
    document.getElementById("protoCanvasArea").addEventListener("click", closeMobilePanels);

    document.querySelectorAll("[data-left-tab]").forEach((button) => button.addEventListener("click", () => {
      activeLeftTab = button.dataset.leftTab;
      document.querySelectorAll("[data-left-tab]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll(".proto-side-left .proto-panel-view").forEach((view) => view.classList.toggle("active", view.id === `proto${activeLeftTab[0].toUpperCase()}${activeLeftTab.slice(1)}Panel`));
    }));
    document.querySelectorAll("[data-right-tab]").forEach((button) => button.addEventListener("click", () => {
      activeRightTab = button.dataset.rightTab;
      document.querySelectorAll("[data-right-tab]").forEach((item) => item.classList.toggle("active", item === button));
      renderProperties();
    }));

    document.getElementById("protoDialogForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const callback = dialogSubmit;
      closeDialog();
      callback?.(values);
    });
    ["protoDialogClose", "protoDialogCancel"].forEach((idValue) => document.getElementById(idValue).addEventListener("click", closeDialog));
    ["protoTemplateClose", "protoTemplateCancel"].forEach((idValue) => document.getElementById(idValue).addEventListener("click", () => closeModal("protoTemplateModal")));
    ["protoVersionClose", "protoVersionCancel"].forEach((idValue) => document.getElementById(idValue).addEventListener("click", () => closeModal("protoVersionModal")));
    ["protoRelationClose", "protoRelationCancel"].forEach((idValue) => document.getElementById(idValue).addEventListener("click", () => closeModal("protoRelationModal")));
    document.getElementById("protoSaveTemplate").addEventListener("click", saveCurrentPageTemplate);
    document.getElementById("protoSaveVersion").addEventListener("click", promptSaveVersion);
    document.getElementById("protoPreviewClose").addEventListener("click", closePreview);
    document.getElementById("protoPreviewBack").addEventListener("click", previewBack);
    ["protoDialog", "protoTemplateModal", "protoVersionModal", "protoRelationModal"].forEach((idValue) => document.getElementById(idValue).addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      if (idValue === "protoDialog") closeDialog(); else closeModal(idValue);
    }));
    window.addEventListener("hashchange", routeFromHash);
    document.addEventListener("keydown", (event) => {
      if (document.getElementById("prototypeWorkspace").hidden) return;
      const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && !editing && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.ctrlKey || event.metaKey) && !editing && event.key.toLowerCase() === "y") {
        event.preventDefault(); redo();
      } else if (!editing && (event.key === "Delete" || event.key === "Backspace")) deleteSelectedNode();
      else if (event.key === "Escape") {
        closePreview(); closeDialog(); ["protoTemplateModal", "protoVersionModal", "protoRelationModal"].forEach(closeModal); closeMobilePanels();
      }
    });
  }

  buildShell();
  bindEvents();
  routeFromHash();
  window.lucide?.createIcons();
})();
