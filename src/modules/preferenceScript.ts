import { config } from "../../package.json";
import { getString } from "../utils/locale";

interface CollectionTreeItem {
  id: string;
  name: string;
  level: number;
  itemCount: number;
  parentID?: string;
  children: CollectionTreeItem[];
}

// 为 OrsaLab API 响应定义接口
interface OrsaLabDataset {
  id: string;
  name: string;
  // ... other properties from the API
}

interface OrsaLabDatasetListResponse {
  data: OrsaLabDataset[];
  // ... other pagination or wrapper properties
}

interface OrsaLabError {
  message?: string;
  error?: string; // Some APIs might use 'error' field
  // ... other error properties
}

// 扩展 addon.data.prefs 类型
declare global {
  namespace _ZoteroTypes {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace AddonData {
      interface Prefs {
        window: Window;
        columns: any[];
        rows: any[];
        collectionTree?: {
          collections: CollectionTreeItem[];
          treeView?: any;
        };
      }
    }
    interface Addon {
      data: {
        prefs?: _ZoteroTypes.AddonData.Prefs;
        [key: string]: any;
      };
    }
  }
}

export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    const prefsData: _ZoteroTypes.AddonData.Prefs = {
      window: _window,
      columns: [
        {
          dataKey: "title",
          label: getString("prefs-table-title"),
          fixedWidth: true,
          width: 100,
        },
        {
          dataKey: "detail",
          label: getString("prefs-table-detail"),
        },
      ],
      rows: [
        {
          title: "Orange",
          detail: "It's juicy",
        },
        {
          title: "Banana",
          detail: "It's sweet",
        },
        {
          title: "Apple",
          detail: "I mean the fruit APPLE",
        },
      ],
      collectionTree: {
        collections: [],
      },
    };
    addon.data.prefs = prefsData;
  } else {
    addon.data.prefs.window = _window;
    const currentPrefs = addon.data.prefs as _ZoteroTypes.AddonData.Prefs;
    if (!currentPrefs.collectionTree) {
      currentPrefs.collectionTree = { collections: [] };
    }
  }
  updatePrefsUI();
  bindPrefEvents();
}

async function updatePrefsUI() {
  // You can initialize some UI elements on prefs window
  // with addon.data.prefs.window.document
  // Or bind some events to the elements
  const renderLock = ztoolkit.getGlobal("Zotero").Promise.defer();
  if (addon.data.prefs?.window == undefined) return;
  const tableHelper = new ztoolkit.VirtualizedTable(addon.data.prefs?.window)
    .setContainerId(`${config.addonRef}-table-container`)
    .setProp({
      id: `${config.addonRef}-prefs-table`,
      // Do not use setLocale, as it modifies the Zotero.Intl.strings
      // Set locales directly to columns
      columns: addon.data.prefs?.columns,
      showHeader: true,
      multiSelect: true,
      staticColumns: true,
      disableFontSizeScaling: true,
    })
    .setProp("getRowCount", () => addon.data.prefs?.rows.length || 0)
    .setProp(
      "getRowData",
      (index) =>
        addon.data.prefs?.rows[index] || {
          title: "no data",
          detail: "no data",
        },
    )
    // Show a progress window when selection changes
    .setProp("onSelectionChange", (selection) => {
      new ztoolkit.ProgressWindow(config.addonName)
        .createLine({
          text: `Selected line: ${addon.data.prefs?.rows
            .filter((v, i) => selection.isSelected(i))
            .map((row) => row.title)
            .join(",")}`,
          progress: 100,
        })
        .show();
    })
    // When pressing delete, delete selected line and refresh table.
    // Returning false to prevent default event.
    .setProp("onKeyDown", (event: KeyboardEvent) => {
      if (event.key == "Delete" || (Zotero.isMac && event.key == "Backspace")) {
        addon.data.prefs!.rows =
          addon.data.prefs?.rows.filter(
            (v, i) => !tableHelper.treeInstance.selection.isSelected(i),
          ) || [];
        tableHelper.render();
        return false;
      }
      return true;
    })
    // For find-as-you-type
    .setProp(
      "getRowString",
      (index) => addon.data.prefs?.rows[index].title || "",
    )
    // Render the table.
    .render(-1, () => {
      renderLock.resolve();
    });
  await renderLock.promise;
  ztoolkit.log("Preference table rendered!");
}

function bindPrefEvents() {
  const document = addon.data.prefs!.window.document;

  document
    ?.querySelector(`#zotero-prefpane-${config.addonRef}-enable`)
    ?.addEventListener("command", (e: Event) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as XUL.Checkbox).checked}!`,
      );
    });

  document
    ?.querySelector(`#zotero-prefpane-${config.addonRef}-input`)
    ?.addEventListener("change", (e: Event) => {
      ztoolkit.log(e);
      addon.data.prefs!.window.alert(
        `Successfully changed to ${(e.target as HTMLInputElement).value}!`,
      );
    });

  // 监听知识库选择变化
  document
    ?.querySelector(`#zotero-prefpane-${config.addonRef}-dify-kb-id`)
    ?.addEventListener("command", (e: Event) => {
      const menuList = e.target as XUL.MenuList;
      const selectedItem = menuList.selectedItem as XUL.MenuItem;

      if (selectedItem) {
        const kbId = selectedItem.getAttribute("value");

        if (kbId) {
          // 保存选择的知识库ID
          Zotero.Prefs.set(`${config.prefsPrefix}.dify-kb-id`, kbId, true);
          ztoolkit.log(`已保存知识库选择: ${kbId}`);
        }
      }
    });
}

/**
 * 测试与 OrsaLab API 的连接
 * 实现 FR1.1.4: 插件应提供一个"测试连接"按钮，验证 API Key、URL 和知识库 ID 的有效性
 */
export async function testDifyConnection() {
  if (!addon.data.prefs?.window) return;

  const document = addon.data.prefs.window.document;
  const statusElement = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-connection-status`,
  ) as HTMLElement;

  // 获取用户输入的 API 配置
  const apiKey =
    (Zotero.Prefs.get(`${config.prefsPrefix}.dify-api-key`, true) as string) ||
    "";
  const baseUrl =
    (Zotero.Prefs.get(`${config.prefsPrefix}.dify-base-url`, true) as string) ||
    "http://www.orsalab.cn/api/v1";

  // 从下拉菜单获取选中的知识库ID
  const menuList = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-dify-kb-id`,
  ) as XUL.MenuList;

  let kbId = "";

  // 优先使用下拉菜单的选择
  if (menuList && menuList.selectedItem) {
    kbId = menuList.selectedItem.getAttribute("value") || "";
  }

  // 如果菜单为空，尝试使用保存的ID
  if (!kbId) {
    kbId =
      (Zotero.Prefs.get(`${config.prefsPrefix}.dify-kb-id`, true) as string) ||
      "";
  }

  // 验证输入不为空
  if (!apiKey) {
    updateConnectionStatus(statusElement, "错误: API Key 不能为空", "error");
    return;
  }

  if (!kbId) {
    updateConnectionStatus(statusElement, "错误: 请先选择知识库", "error");
    return;
  }

  // 显示正在测试的状态
  updateConnectionStatus(statusElement, "正在测试连接...", "testing");

  try {
    // 使用 OrsaLab API 测试连接
    const testUrl = `${baseUrl}/datasets/${kbId}`;

    // 发送请求
    const response = await fetch(testUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const status = response.status;

    // 解析响应
    if (status === 200) {
      try {
        const data = (await response.json()) as unknown as OrsaLabDataset;
        if (data && data.id && data.id === kbId) {
          updateConnectionStatus(
            statusElement,
            `成功! 已连接到 OrsaLab。知识库名称: ${data.name || kbId}`,
            "success",
          );
        } else if (data && data.id) {
          updateConnectionStatus(
            statusElement,
            `警告: 已连接到 OrsaLab，但返回的知识库 ID (${data.id}) 与您输入的 (${kbId}) 不匹配。`,
            "warning",
          );
        } else {
          updateConnectionStatus(
            statusElement,
            "连接成功，但未能从响应中完全验证知识库 ID。请检查 ID 是否正确。",
            "warning",
          );
        }
      } catch (parseError) {
        updateConnectionStatus(
          statusElement,
          "连接成功，但响应内容格式错误。请检查 API 是否按预期返回 JSON。",
          "warning",
        );
      }
    } else {
      let errorMessage = `连接失败。HTTP 状态码: ${status}.`;
      try {
        // 尝试解析 JSON 错误响应
        const errorData = (await response.json()) as unknown as OrsaLabError;
        if (errorData && (errorData.message || errorData.error)) {
          errorMessage += ` OrsaLab 错误: ${errorData.message || errorData.error}`;
        }
      } catch (e) {
        // 如果不是 JSON 格式，使用文本响应
        if (response.status === 401) {
          errorMessage = "认证失败。请检查 API Key 是否正确。";
        } else if (response.status === 404) {
          errorMessage = "找不到指定的知识库。请检查知识库 ID 是否正确。";
        } else {
          const responseText = await response.text();
          errorMessage += ` 响应内容: ${responseText.substring(0, 100)}${
            responseText.length > 100 ? "..." : ""
          }`;
        }
      }
      updateConnectionStatus(statusElement, errorMessage, "error");
    }
  } catch (error) {
    let errorMessage = "连接失败: ";

    // 处理不同类型的错误
    if (error instanceof Error) {
      if (
        error.message.includes("Network") ||
        error.message.includes("connect")
      ) {
        errorMessage += "网络连接错误。请检查 URL 和您的网络连接。";
      } else {
        errorMessage += error.message || "未知错误";
      }
    } else {
      errorMessage += "发生未知错误。请查看 Zotero 错误日志获取详细信息。";
    }

    updateConnectionStatus(statusElement, errorMessage, "error");
    ztoolkit.log("OrsaLab 连接测试错误:", error);
  }
}

/**
 * 更新连接状态显示
 */
function updateConnectionStatus(
  element: HTMLElement,
  message: string,
  type: "success" | "error" | "warning" | "testing",
) {
  if (!element) return;

  element.textContent = message;

  // 设置颜色
  switch (type) {
    case "success":
      element.style.color = "green";
      break;
    case "error":
      element.style.color = "red";
      break;
    case "warning":
      element.style.color = "orange";
      break;
    case "testing":
      element.style.color = "blue";
      break;
  }
}

/**
 * 加载 Zotero 分类结构
 * 实现 FR1.2: Zotero 分类选择
 */
export async function loadZoteroCollections() {
  if (!addon.data.prefs?.window) return;

  const document = addon.data.prefs.window.document;
  const statusElement = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-sync-status`,
  ) as HTMLElement;

  if (statusElement) {
    statusElement.textContent = "正在加载分类...";
    statusElement.style.color = "blue";
  }

  try {
    // 获取所有分类
    const rootCollections = await getZoteroCollections();

    // 保存到 addon.data
    const currentPrefs = addon.data.prefs as any; // 使用 any 来避免 collectionTree 的 linter 错误
    if (!currentPrefs.collectionTree) {
      currentPrefs.collectionTree = { collections: [] };
    }
    currentPrefs.collectionTree.collections = rootCollections;

    // 创建树形视图
    createCollectionTreeView(rootCollections);

    // 恢复之前选中的分类
    restoreSelectedCollections();

    if (statusElement) {
      statusElement.textContent = `已加载 ${countTotalCollections(rootCollections)} 个分类。`;
      statusElement.style.color = "green";
    }
  } catch (error) {
    if (statusElement) {
      statusElement.textContent = `加载分类失败: ${error instanceof Error ? error.message : "未知错误"}`;
      statusElement.style.color = "red";
    }
    ztoolkit.log("加载 Zotero 分类出错:", error);
  }
}

/**
 * 获取 Zotero 中的所有分类及其结构
 */
async function getZoteroCollections(): Promise<CollectionTreeItem[]> {
  // 获取当前库
  const libraryID = Zotero.Libraries.userLibraryID;

  // 获取所有顶级分类
  const rootCollections = await Zotero.Collections.getByLibrary(libraryID);

  // 递归构建分类树
  return await Promise.all(
    rootCollections.map(async (collection) => {
      return await buildCollectionTree(collection, 0);
    }),
  );
}

/**
 * 递归构建分类树结构
 */
async function buildCollectionTree(
  collection: Zotero.Collection,
  level: number,
): Promise<CollectionTreeItem> {
  // 获取分类中的直接子项数量
  const itemCount = collection.getChildItems().length;

  // 获取所有子分类
  const childCollections = collection.getChildCollections();

  // 递归处理每个子分类
  const children = await Promise.all(
    childCollections.map(async (childCollection: Zotero.Collection) => {
      return await buildCollectionTree(childCollection, level + 1);
    }),
  );

  // 构建并返回当前分类的树节点
  return {
    id: collection.id.toString(),
    name: collection.name,
    level: level,
    itemCount: itemCount,
    parentID: collection.parentID ? collection.parentID.toString() : undefined,
    children: children,
  };
}

/**
 * 计算分类树中的总分类数
 */
function countTotalCollections(collections: CollectionTreeItem[]): number {
  let count = collections.length;

  for (const collection of collections) {
    if (collection.children && collection.children.length > 0) {
      count += countTotalCollections(collection.children);
    }
  }

  return count;
}

/**
 * 为分类树创建树形视图
 */
function createCollectionTreeView(collections: CollectionTreeItem[]) {
  if (!addon.data.prefs?.window) return;

  const document = addon.data.prefs.window.document;
  const treeElement = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-collections-tree`,
  ) as XUL.Tree | null;

  if (!treeElement) return;

  // 准备一个扁平化的集合数组，用于树形视图
  const flatCollections: CollectionTreeItem[] = [];
  flattenCollections(collections, flatCollections);

  // 创建树形视图对象
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore We are providing a custom view that matches most of nsITreeView
  const treeView: any = {
    rowCount: flatCollections.length,
    getCellText: function (row: number, column: any) {
      if (row >= flatCollections.length) return "";

      const collection = flatCollections[row];

      if (
        column.id === `zotero-prefpane-${config.addonRef}-collections-tree-name`
      ) {
        // 根据层级添加缩进
        return "\xA0\xA0".repeat(collection.level) + collection.name;
      } else if (
        column.id ===
        `zotero-prefpane-${config.addonRef}-collections-tree-items`
      ) {
        return collection.itemCount.toString();
      }

      return "";
    },
    getLevel: function (row: number) {
      if (row >= flatCollections.length) return 0;
      return flatCollections[row].level;
    },
    isContainer: function () {
      return false; // 所有行都没有扩展/折叠图标
    },
    isContainerOpen: function () {
      return false;
    },
    isContainerEmpty: function () {
      return true;
    },
    isSeparator: function () {
      return false;
    },
    isSorted: function () {
      return false;
    },
    getParentIndex: function (row: number) {
      if (row <= 0) return -1;

      const level = this.getLevel(row);
      for (let i = row - 1; i >= 0; i--) {
        if (this.getLevel(i) < level) {
          return i;
        }
      }

      return -1;
    },
    hasNextSibling: function (row: number, afterIndex: number) {
      const level = this.getLevel(row);
      for (let i = afterIndex + 1; i < this.rowCount; i++) {
        const nextLevel = this.getLevel(i);
        if (nextLevel < level) {
          return false;
        }
        if (nextLevel === level) {
          return true;
        }
      }
      return false;
    },
    toggleOpenState: function () {},
    getImageSrc: function () {
      return null;
    },
    getProgressMode: function () {
      return 0;
    },
    getCellValue: function () {
      return null;
    },
    cycleHeader: function () {},
    cycleCell: function () {},
    isEditable: function () {
      return false;
    },
    isSelectable: function () {
      return true;
    },
    setCellValue: function () {},
    setCellText: function () {},
    performAction: function () {},
    performActionOnRow: function () {},
    performActionOnCell: function () {},
    getRowProperties: function () {
      return "";
    },
    getCellProperties: function () {
      return "";
    },
    getColumnProperties: function () {
      return "";
    },
    getCollectionByRow: function (row: number) {
      if (row >= 0 && row < flatCollections.length) {
        return flatCollections[row];
      }
      return null;
    },
    setTree: function (tree: XUL.Tree | null) {
      ztoolkit.log(
        `setTree called on custom treeView with tree: ${tree ? tree.id : "null"}`,
      );
    },
    canDrop: function () {
      return false; // 不支持拖放
    },
    drop: function () {
      // 不支持拖放
    },
    selectionChanged: function () {
      ztoolkit.log("treeView.selectionChanged callback invoked by Zotero.");
      // 当树的选择改变时，Zotero会调用此方法
      // 此时 this.selection (即 treeElement.view.selection) 应该已经被Zotero更新
      saveSelectedCollections();
    },
  };

  // 保存视图引用
  const currentPrefs = addon.data.prefs as any; // 使用 any 来避免 linter 错误
  if (currentPrefs && currentPrefs.collectionTree) {
    currentPrefs.collectionTree.treeView = treeView;
  }

  // 设置树的视图
  treeElement.view = treeView;

  // 直接在树元素上监听 "select" 事件，这通常更可靠
  treeElement.removeEventListener("select", saveSelectedCollections); // 先移除，防止重复添加
  // treeElement.addEventListener("select", saveSelectedCollections); // << 暂时注释掉这个，只依赖 treeView.selectionChanged
  // ztoolkit.log("Event listener for 'select' added to tree element.");
}

/**
 * 将嵌套的分类结构扁平化为数组
 */
function flattenCollections(
  collections: CollectionTreeItem[],
  result: CollectionTreeItem[],
) {
  for (const collection of collections) {
    result.push(collection);
    if (collection.children && collection.children.length > 0) {
      flattenCollections(collection.children, result);
    }
  }
}

/**
 * 保存当前选中的分类
 */
function saveSelectedCollections() {
  ztoolkit.log(
    "saveSelectedCollections called (via treeView.selectionChanged or direct event).",
  ); // 修改日志以区分来源
  if (!addon.data.prefs?.window) {
    ztoolkit.log("saveSelectedCollections: prefs window not found.");
    return;
  }

  const document = addon.data.prefs.window.document;
  const treeElement = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-collections-tree`,
  ) as XUL.Tree | null;

  if (!treeElement) {
    ztoolkit.log("saveSelectedCollections: treeElement not found.");
    return;
  }
  if (!treeElement.view) {
    ztoolkit.log("saveSelectedCollections: treeElement.view not found.");
    return;
  }
  // 确保 view 和 view.selection 存在
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore treeElement.view 可能是 any 类型，显式检查 selection
  const currentView = treeElement.view as any;
  if (!currentView.selection) {
    ztoolkit.log(
      "saveSelectedCollections: treeElement.view.selection (currentView.selection) not found.",
    );
    return;
  }

  const selection = currentView.selection; // 使用 currentView.selection
  const selectedIndices: number[] = [];
  const rangeCount = selection.getRangeCount();
  ztoolkit.log(`saveSelectedCollections: rangeCount = ${rangeCount}`);

  for (let i = 0; i < rangeCount; i++) {
    let start = { value: 0 },
      end = { value: 0 };
    selection.getRangeAt(i, start, end);
    ztoolkit.log(
      `saveSelectedCollections: range ${i}: start=${start.value}, end=${end.value}`,
    );
    for (let j = start.value; j <= end.value; j++) {
      selectedIndices.push(j);
    }
  }
  ztoolkit.log(
    `saveSelectedCollections: selectedIndices: ${JSON.stringify(selectedIndices)}`,
  );

  const selectedCollectionIds: string[] = [];
  for (const index of selectedIndices) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore currentView 可能是 any 类型
    const collection = currentView.getCollectionByRow(index);
    if (collection && collection.id) {
      selectedCollectionIds.push(collection.id);
    } else {
      ztoolkit.log(
        `saveSelectedCollections: collection or id is null for index ${index}. Collection: ${JSON.stringify(collection)}`,
      );
    }
  }
  ztoolkit.log(
    `saveSelectedCollections: selectedCollectionIds to save: ${JSON.stringify(selectedCollectionIds)}`,
  );

  Zotero.Prefs.set(
    `${config.prefsPrefix}.selected-collections`,
    JSON.stringify(selectedCollectionIds),
    true,
  );
  ztoolkit.log("saveSelectedCollections: Preferences saved.");
}

/**
 * 恢复之前选中的分类
 */
function restoreSelectedCollections() {
  if (!addon.data.prefs?.window) return;

  const document = addon.data.prefs.window.document;
  const treeElement = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-collections-tree`,
  ) as XUL.Tree | null;

  if (!treeElement || !treeElement.view) return;

  // 从首选项中获取已保存的分类 ID
  const savedIdsString =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.selected-collections`,
      true,
    ) as string) || "[]";

  try {
    const selectedIds = JSON.parse(savedIdsString);

    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return;

    // 清除当前选择
    treeElement.view.selection.clearSelection();

    // 在视图中查找并选择这些分类
    for (let i = 0; i < treeElement.view.rowCount; i++) {
      const collection = (treeElement.view as any).getCollectionByRow(i);
      if (collection && selectedIds.includes(collection.id)) {
        treeElement.view.selection.toggleSelect(i);
      }
    }
  } catch (e) {
    ztoolkit.log("恢复分类选择出错:", e);
  }
}

/**
 * 立即开始同步
 * 实现 FR1.3.1: 用户应能手动触发"立即同步"操作
 */
export async function syncNow() {
  if (!addon.data.prefs?.window) return;

  const document = addon.data.prefs.window.document;
  const statusElement = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-sync-status`,
  ) as HTMLElement;

  if (!statusElement) return;

  // 获取已选择的分类 ID
  const selectedCollectionsString =
    (Zotero.Prefs.get(
      `${config.prefsPrefix}.selected-collections`,
      true,
    ) as string) || "[]";
  ztoolkit.log(
    `syncNow: selectedCollectionsString from Prefs: '${selectedCollectionsString}'`,
  );

  try {
    const selectedCollectionIds = JSON.parse(selectedCollectionsString);
    ztoolkit.log(
      `syncNow: parsed selectedCollectionIds: ${JSON.stringify(selectedCollectionIds)} (length: ${selectedCollectionIds.length})`,
    );

    if (
      !Array.isArray(selectedCollectionIds) ||
      selectedCollectionIds.length === 0
    ) {
      statusElement.textContent = "请先选择要同步的分类";
      statusElement.style.color = "red";
      ztoolkit.log("syncNow: No collections selected or invalid format.");
      return;
    }

    // 检查 Dify API 配置
    const apiKey =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.dify-api-key`,
        true,
      ) as string) || "";
    const baseUrl =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.dify-base-url`,
        true,
      ) as string) || "";

    // 从下拉菜单获取选中的知识库ID
    const menuList = document.querySelector(
      `#zotero-prefpane-${config.addonRef}-dify-kb-id`,
    ) as XUL.MenuList;

    let kbId = "";

    // 优先使用下拉菜单的选择
    if (menuList && menuList.selectedItem) {
      kbId = menuList.selectedItem.getAttribute("value") || "";
    }

    // 如果菜单为空，尝试使用保存的ID
    if (!kbId) {
      kbId =
        (Zotero.Prefs.get(
          `${config.prefsPrefix}.dify-kb-id`,
          true,
        ) as string) || "";
    }

    if (!apiKey || !baseUrl || !kbId) {
      statusElement.textContent = "请先配置 Dify API 设置并选择知识库";
      statusElement.style.color = "red";
      return;
    }

    // 是否包含子分类
    const includeSubcollections = Zotero.Prefs.get(
      `${config.prefsPrefix}.include-subcollections`,
      true,
    ) as boolean;

    statusElement.textContent = "正在准备同步...";
    statusElement.style.color = "blue";

    // 收集所有需要同步的文档
    const docsToSync = await collectDocumentsToSync(
      selectedCollectionIds,
      includeSubcollections,
    );

    if (docsToSync.length === 0) {
      statusElement.textContent = "未找到可同步的 PDF 文档";
      statusElement.style.color = "orange";
      return;
    }

    // 开始同步流程
    if (addon.data.prefs && addon.data.prefs.window) {
      await startSyncProcess(
        docsToSync,
        statusElement,
        addon.data.prefs.window,
      );
    } else {
      statusElement.textContent = "错误：无法获取窗口上下文进行同步。";
      statusElement.style.color = "red";
      ztoolkit.log("syncNow: Error: addon.data.prefs.window is not available.");
    }
  } catch (error) {
    statusElement.textContent = `同步错误: ${error instanceof Error ? error.message : "未知错误"}`;
    statusElement.style.color = "red";
    ztoolkit.log("同步过程中发生错误:", error);
  }
}

/**
 * 收集需要同步的文档
 */
async function collectDocumentsToSync(
  collectionIds: string[],
  includeSubcollections: boolean,
): Promise<
  Array<{
    item: Zotero.Item;
    attachment: Zotero.Item;
    collection: Zotero.Collection;
  }>
> {
  const result: Array<{
    item: Zotero.Item;
    attachment: Zotero.Item;
    collection: Zotero.Collection;
  }> = [];

  // 定义支持的MIME类型
  const supportedMimeTypes = ["application/pdf", "text/plain"];

  for (const collectionId of collectionIds) {
    try {
      // 获取集合对象
      const collection = await Zotero.Collections.getAsync(
        parseInt(collectionId),
      );

      if (!collection) {
        ztoolkit.log(`未找到 ID 为 ${collectionId} 的分类`);
        continue;
      }

      // 获取分类中的所有条目
      let collections = [collection];

      // 如果包含子分类，递归获取所有子分类
      if (includeSubcollections) {
        collections = [
          ...collections,
          ...(await getAllSubcollections(collection)),
        ];
      }

      // 处理每个分类中的条目
      for (const currentCollection of collections) {
        const items = currentCollection.getChildItems();

        for (const item of items) {
          // 只关注常规条目
          if (item.isRegularItem()) {
            // 获取所有附件
            const attachments = item.getAttachments();

            // 标记是否已为该条目添加了附件
            let attachmentAdded = false;

            for (const attachmentID of attachments) {
              const attachment = await Zotero.Items.getAsync(attachmentID);

              // 检查附件类型是否受支持
              if (
                attachment &&
                supportedMimeTypes.includes(attachment.attachmentContentType)
              ) {
                result.push({
                  item: item,
                  attachment: attachment,
                  collection: currentCollection,
                });
                ztoolkit.log(
                  `添加文档到同步队列: ${item.getField("title")}, 类型: ${attachment.attachmentContentType}`,
                );

                // 每个条目只同步一个附件（如果有多个，取第一个）
                attachmentAdded = true;
                break;
              }
            }

            // 如果没有找到支持的附件类型，记录日志
            if (!attachmentAdded && attachments.length > 0) {
              ztoolkit.log(
                `条目 ${item.getField("title")} 没有受支持的附件类型`,
              );
            }
          }
        }
      }
    } catch (e) {
      ztoolkit.log(`处理分类 ${collectionId} 时出错:`, e);
    }
  }

  ztoolkit.log(`收集到 ${result.length} 个文档准备同步`);
  return result;
}

/**
 * 递归获取分类的所有子分类
 */
async function getAllSubcollections(
  collection: Zotero.Collection,
): Promise<Zotero.Collection[]> {
  let result: Zotero.Collection[] = [];

  const childCollections = collection.getChildCollections();

  for (const childCollection of childCollections) {
    result.push(childCollection);
    // 递归获取子分类的子分类
    const subCollections = await getAllSubcollections(childCollection);
    result = [...result, ...subCollections];
  }

  return result;
}

/**
 * 开始同步过程
 */
async function startSyncProcess(
  docsToSync: Array<{
    item: Zotero.Item;
    attachment: Zotero.Item;
    collection: Zotero.Collection;
  }>,
  statusElement: HTMLElement,
  windowContext: Window,
) {
  // 同步前的准备
  statusElement.textContent = `准备同步 ${docsToSync.length} 个文档...`;

  // 显示进度窗口
  const progressWin = new ztoolkit.ProgressWindow("Zotero-Dify 同步", {
    closeOnClick: false,
    closeTime: -1,
  });

  const progressLine = progressWin.createLine({
    text: `准备同步 PDF 到 Dify...`,
    type: "default",
    progress: 0,
  });

  progressWin.show();

  // 同步配置
  const apiKey = Zotero.Prefs.get(
    `${config.prefsPrefix}.dify-api-key`,
    true,
  ) as string;
  const baseUrl = Zotero.Prefs.get(
    `${config.prefsPrefix}.dify-base-url`,
    true,
  ) as string;
  const kbId = Zotero.Prefs.get(
    `${config.prefsPrefix}.dify-kb-id`,
    true,
  ) as string;

  // 清理 baseUrl，确保末尾没有斜杠
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

  // 同步统计数据
  let successCount = 0;
  let failedCount = 0;
  const failedItems: Array<{ item: Zotero.Item; error: string }> = [];

  // 逐个上传文档
  for (let i = 0; i < docsToSync.length; i++) {
    const { item, attachment, collection } = docsToSync[i];

    try {
      // 更新进度
      // const progress = Math.round((i / docsToSync.length) * 100);
      // // 使用 setText 和 setProgress 更新进度条 - 注释掉以避免 Linter 错误，待用户确认 ztoolkit API
      // if (progressLine.setText) progressLine.setText(`正在同步 (${i + 1}/${docsToSync.length}): ${item.getField("title")}`);
      // if (progressLine.setProgress) progressLine.setProgress(progress);

      statusElement.textContent = `同步进行中... ${i + 1}/${docsToSync.length}`;

      // 提取元数据
      const metadataObject = extractItemMetadata(item);

      // 获取文件路径
      const filePath = await attachment.getFilePathAsync();

      if (!filePath) {
        throw new Error("找不到文件路径");
      }

      // 检查文件是否存在
      try {
        // 尝试使用文件状态检查文件是否存在，而不是使用 exists 方法
        await Zotero.File.getBinaryContentsAsync(filePath, 1);
      } catch (err) {
        throw new Error("文件不存在或无法访问");
      }

      // 确定文件类型
      const contentType = attachment.attachmentContentType || "";
      ztoolkit.log(`文件内容类型: ${contentType}, 文件路径: ${filePath}`);

      // 上传文档到 Dify
      await uploadToDify(
        filePath,
        metadataObject,
        apiKey,
        cleanBaseUrl,
        kbId,
        windowContext,
        contentType, // 使用附件的内容类型
      );

      successCount++;
    } catch (error) {
      failedCount++;
      failedItems.push({
        item: item,
        error: error instanceof Error ? error.message : "未知错误",
      });
      ztoolkit.log(`同步文档失败: ${item.getField("title")}`, error);
    }

    // 给请求间留一些间隔，避免过快请求
    await Zotero.Promise.delay(500);
  }

  // 更新最后同步时间
  const now = new Date().toISOString();
  Zotero.Prefs.set(`${config.prefsPrefix}.last-sync-time`, now, true);

  // 完成同步
  if (failedCount === 0) {
    statusElement.textContent = `同步完成！成功同步 ${successCount} 个文档。最后同步时间: ${new Date().toLocaleString()}`;
    statusElement.style.color = "green";

    // // 使用 setText 和 setProgress 更新进度条 - 注释掉以避免 Linter 错误
    // if (progressLine.setText) progressLine.setText(`同步完成！成功同步 ${successCount} 个文档`);
    // if (progressLine.setProgress) progressLine.setProgress(100);
    // if (progressLine.setProgress && typeof (progressLine as any).setType === 'function') {
    //     (progressLine as any).setType("success");
    // }
  } else {
    statusElement.textContent = `同步完成，但有错误。成功: ${successCount}, 失败: ${failedCount}。最后同步时间: ${new Date().toLocaleString()}`;
    statusElement.style.color = "orange";

    // // 使用 setText 和 setProgress 更新进度条 - 注释掉以避免 Linter 错误
    // if (progressLine.setText) progressLine.setText(`同步部分完成。成功: ${successCount}, 失败: ${failedCount}`);
    // if (progressLine.setProgress) progressLine.setProgress(100);
    // if (progressLine.setProgress && typeof (progressLine as any).setType === 'function') {
    //     (progressLine as any).setType("warning");
    // }
  }

  // 开始计时自动关闭窗口
  progressWin.startCloseTimer(5000);
}

/**
 * 从 Zotero 条目提取元数据
 * 返回一个包含元数据键值对的对象
 */
export function extractItemMetadata(item: Zotero.Item): Record<string, any> {
  const title = item.getField("title") || "";
  const creators = item.getCreators();
  const year = item.getField("year") || "";
  const publicationTitle = item.getField("publicationTitle") || "";
  const publisher = item.getField("publisher") || "";
  const abstractNote = item.getField("abstractNote") || "";
  const tags = item.getTags().map((tag: any) => tag.tag);
  const url = item.getField("url") || "";
  const doi = item.getField("DOI") || "";
  const itemType = Zotero.ItemTypes.getName(item.itemTypeID);
  const zoteroKey = item.key;
  const zoteroLibraryID = item.libraryID;

  // 处理作者信息
  const authors = creators.map((creator: any) => {
    if (creator.firstName && creator.lastName) {
      return `${creator.lastName}, ${creator.firstName}`;
    }
    return creator.lastName || creator.name || "";
  });

  const metadata: Record<string, any> = {
    title: title,
    authors: authors, // 改为数组
    year: year,
    item_type: itemType, // 添加条目类型
    publication_title: publicationTitle,
    publisher: publisher,
    doi: doi,
    url: url,
    tags: tags, // 改为数组
    abstract: abstractNote, // 字段名保持一致性
    zotero_key: zoteroKey,
    zotero_library_id: zoteroLibraryID,
    imported_from: "Zotero",
    imported_at: new Date().toISOString(),
  };

  // 移除值为空字符串或空数组的字段，以保持元数据清洁
  for (const key in metadata) {
    if (
      metadata[key] === "" ||
      (Array.isArray(metadata[key]) && (metadata[key] as any[]).length === 0)
    ) {
      delete metadata[key];
    }
  }

  return metadata;
}

/**
 * 上传文档到 Dify
 */
export async function uploadToDify(
  filePath: string,
  metadata: Record<string, any>,
  apiKey: string,
  baseUrl: string,
  datasetId: string,
  windowContext: Window,
  fileMimeType: string = "application/pdf",
): Promise<void> {
  const uploadUrl = `${baseUrl}/datasets/${datasetId}/document/create_by_file`;
  ztoolkit.log(
    `uploadToDify: 准备上传，filePath: ${filePath}, datasetId: ${datasetId}, mimeType: ${fileMimeType}`,
  );
  ztoolkit.log(`uploadToDify: 上传URL: ${uploadUrl}`);

  // 返回Promise确保异步操作完成
  return new Promise(async (resolve, reject) => {
    try {
      // 确保文件存在 - 使用Zotero API
      try {
        ztoolkit.log(`uploadToDify: 检查文件存在性: ${filePath}`);
        // 使用Zotero.File读取1字节来检查文件是否存在和可访问
        await Zotero.File.getBinaryContentsAsync(filePath, 1);
        ztoolkit.log(`uploadToDify: 文件存在，继续处理`);
      } catch (error) {
        throw new Error(`文件不存在或无法访问：${filePath}`);
      }

      // 获取文件名
      const fileName = filePath.substring(
        Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/")) + 1,
      );
      ztoolkit.log(`uploadToDify: 文件名: ${fileName}`);

      // 构造数据对象
      const difyDataPayload: {
        indexing_technique: string;
        process_rule: {
          rules: {
            pre_processing_rules: { id: string; enabled: boolean }[];
            segmentation: { separator: string; max_tokens: number };
          };
          mode: string;
        };
        doc_metadata?: Record<string, any>;
      } = {
        indexing_technique: "economy",
        process_rule: {
          rules: {
            pre_processing_rules: [
              { id: "remove_extra_spaces", enabled: true },
              { id: "remove_urls_emails", enabled: true },
            ],
            segmentation: {
              separator: "\n\n",
              max_tokens: 500,
            },
          },
          mode: "custom",
        },
      };

      // 添加元数据
      // if (metadata && Object.keys(metadata).length > 0) {
      //   difyDataPayload.doc_metadata = metadata;
      // }

      try {
        // 使用Zotero File API读取完整文件内容
        ztoolkit.log(`uploadToDify: 开始读取文件内容...`);

        // 使用低级访问方法读取文件，确保获取原始字节
        ztoolkit.log(`uploadToDify: 读取文件 ${filePath} 为原始二进制数据`);

        // 使用纯粹的二进制方式读取文件
        // 我们将使用OS模块直接读取原始二进制数据
        let fileBinary;

        try {
          // 使用Components.utils导入OS.File模块
          // @ts-ignore 忽略类型错误
          const OSFile = Components.utils.importGlobalProperties(["OS"]).OS
            .File;

          // 完全以二进制模式读取文件内容
          const arrayBuffer = await OSFile.read(filePath);
          // 确保我们有一个Uint8Array
          fileBinary = new Uint8Array(arrayBuffer);

          // 打印前几个字节进行验证
          const header = Array.from(fileBinary.slice(0, 10))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");

          ztoolkit.log(`uploadToDify: OS.File读取成功，前10个字节: ${header}`);
        } catch (e) {
          ztoolkit.log(`uploadToDify: OS.File读取失败: ${e}, 尝试其他方法`);

          try {
            // 尝试使用NSIFile进行底层访问
            // @ts-ignore 忽略类型错误
            const nsFile = Components.classes[
              "@mozilla.org/file/local;1"
            ].createInstance(Components.interfaces.nsIFile);
            nsFile.initWithPath(filePath);

            // 读取原始文件数据
            // @ts-ignore 忽略类型错误
            const inputStream = Components.classes[
              "@mozilla.org/network/file-input-stream;1"
            ].createInstance(Components.interfaces.nsIFileInputStream);
            inputStream.init(nsFile, 0x01, 0o444, 0); // 只读模式

            // 创建二进制输入流
            // @ts-ignore 忽略类型错误
            const binaryStream = Components.classes[
              "@mozilla.org/binaryinputstream;1"
            ].createInstance(Components.interfaces.nsIBinaryInputStream);
            binaryStream.setInputStream(inputStream);

            // 读取所有字节
            const bytes = binaryStream.readByteArray(nsFile.fileSize);
            fileBinary = bytes;

            // 关闭流
            binaryStream.close();
            inputStream.close();

            ztoolkit.log(
              `uploadToDify: 使用NSIFile读取成功, 大小: ${bytes.length}字节`,
            );
          } catch (ex) {
            ztoolkit.log(
              `uploadToDify: NSIFile读取失败: ${ex}, 回退到标准方法`,
            );
            // 回退到标准方法
            // @ts-ignore 忽略类型错误
            const content = await Zotero.File.getBinaryContentsAsync(filePath);

            // 强制二进制表示
            if (typeof content === "string") {
              // 手动将字符串转换为Uint8Array (适用于PDF)
              const array = new Uint8Array(content.length);
              for (let i = 0; i < content.length; i++) {
                array[i] = content.charCodeAt(i) & 0xff;
              }
              fileBinary = array;
            } else {
              fileBinary = content;
            }
          }
        }

        if (!fileBinary) {
          throw new Error(`无法读取文件内容或文件为空: ${filePath}`);
        }

        // 获取文件大小 - 使用安全的方法
        let fileSize = 0;
        try {
          // @ts-ignore 忽略类型检查
          fileSize = fileBinary.byteLength || fileBinary.length || 0;
        } catch (e) {
          // 忽略错误
        }

        ztoolkit.log(`uploadToDify: 文件读取完成，大小约: ${fileSize} 字节`);

        // 文件已成功读取，现在准备上传
        ztoolkit.log(`uploadToDify: 文件读取完成，大小约: ${fileSize} 字节`);

        // 创建XHR对象
        ztoolkit.log(`uploadToDify: 创建XHR对象`);
        const xhr = new windowContext.XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);

        // 更详细的错误处理和诊断
        xhr.onreadystatechange = function () {
          ztoolkit.log(
            `uploadToDify: XHR状态变化: readyState=${xhr.readyState}, status=${xhr.status}`,
          );

          // 检查请求是否已发送
          if (xhr.readyState >= 2) {
            ztoolkit.log(`uploadToDify: 请求已发送到服务器`);
          }
        };

        // 监听上传进度
        xhr.upload.onprogress = (event: ProgressEvent) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            ztoolkit.log(
              `uploadToDify: 上传进度: ${percentComplete.toFixed(2)}%, loaded=${event.loaded}, total=${event.total}`,
            );
          }
        };

        // 处理完成
        xhr.onload = function () {
          ztoolkit.log(`uploadToDify: XHR onload 触发，状态码: ${xhr.status}`);
          if (xhr.status >= 200 && xhr.status < 300) {
            ztoolkit.log(`uploadToDify: 上传成功! 响应: ${xhr.responseText}`);
            resolve();
          } else {
            const errorMsg = `上传失败 (${xhr.status}): ${xhr.responseText || "未知错误"}`;
            ztoolkit.log(`uploadToDify: ${errorMsg}`);
            reject(new Error(errorMsg));
          }
        };

        // 处理错误
        xhr.onerror = function (e: Event | ProgressEvent) {
          const errorMsg = `网络错误，上传失败: ${e ? e.type : "未知错误"}`;
          ztoolkit.log(`uploadToDify: ${errorMsg}`);
          reject(new Error(errorMsg));
        };

        xhr.ontimeout = function () {
          ztoolkit.log(`uploadToDify: 请求超时`);
          reject(new Error("请求超时"));
        };

        try {
          // 我们将自己构造multipart/form-data请求，而不使用FormData对象
          ztoolkit.log(`uploadToDify: 手动创建multipart/form-data请求`);

          // 生成随机边界字符串
          const boundary =
            "----WebKitFormBoundary" + Math.random().toString(16).substr(2);
          xhr.setRequestHeader(
            "Content-Type",
            `multipart/form-data; boundary=${boundary}`,
          );

          // 开始构建请求体
          let requestBody = "";

          // 添加JSON数据部分
          requestBody += `--${boundary}\r\n`;
          requestBody += `Content-Disposition: form-data; name="data"\r\n`;
          requestBody += "Content-Type: application/json\r\n\r\n";
          requestBody += JSON.stringify(difyDataPayload) + "\r\n";

          // 准备添加文件部分
          requestBody += `--${boundary}\r\n`;
          requestBody += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
          requestBody += `Content-Type: ${fileMimeType}\r\n\r\n`;

          // 到这里，我们需要添加二进制文件内容，但不能直接拼接进字符串
          // 我们需要将requestBody转为ArrayBuffer并拼接文件内容

          // 先将已有部分转为UTF8二进制
          const encoder = new TextEncoder();
          const requestBodyPrefix = encoder.encode(requestBody);

          // 创建结尾部分
          const requestBodySuffix = encoder.encode(`\r\n--${boundary}--\r\n`);

          // 获取文件内容为二进制
          // 尝试不同的方法获取文件内容
          let fileContent: Uint8Array | null = null;

          try {
            // 尝试使用Zotero.File直接读取二进制内容
            ztoolkit.log(`uploadToDify: 使用Zotero.File读取文件内容`);
            // @ts-ignore
            const content = await Zotero.File.getBinaryContentsAsync(filePath);

            if (typeof content === "string") {
              // 将字符串转换为Uint8Array
              const array = new Uint8Array(content.length);
              for (let i = 0; i < content.length; i++) {
                array[i] = content.charCodeAt(i) & 0xff; // 保留原始字节值
              }
              fileContent = array;
              ztoolkit.log(
                `uploadToDify: 成功将字符串转换为Uint8Array，长度: ${array.length}`,
              );
            } else if (content && typeof content === "object") {
              // 尝试将其转换为Uint8Array
              fileContent = new Uint8Array(content as ArrayBuffer);
              ztoolkit.log(
                `uploadToDify: 将对象转换为Uint8Array，长度: ${fileContent.length}`,
              );
            } else {
              throw new Error(`无法处理的文件内容类型: ${typeof content}`);
            }

            // 检查前8个字节
            if (fileContent && fileContent.length >= 8) {
              const header = Array.from(fileContent.slice(0, 8))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ");
              ztoolkit.log(`uploadToDify: 文件头部(16进制): ${header}`);
            }
          } catch (error: unknown) {
            ztoolkit.log(`uploadToDify: 读取文件内容失败: ${error}`);
            throw new Error(`无法读取文件内容: ${String(error)}`);
          }

          if (!fileContent) {
            throw new Error("无法获取文件内容");
          }

          // 合并所有部分为一个ArrayBuffer
          const totalLength =
            requestBodyPrefix.length +
            fileContent.length +
            requestBodySuffix.length;
          const requestData = new Uint8Array(totalLength);

          // 复制各部分数据
          requestData.set(requestBodyPrefix, 0);
          requestData.set(fileContent, requestBodyPrefix.length);
          requestData.set(
            requestBodySuffix,
            requestBodyPrefix.length + fileContent.length,
          );

          ztoolkit.log(
            `uploadToDify: 完成请求数据构建，总大小: ${totalLength} 字节`,
          );

          // 发送请求
          ztoolkit.log(`uploadToDify: 发送二进制请求数据到 ${uploadUrl}`);
          xhr.send(requestData);
          ztoolkit.log(`uploadToDify: XHR.send()已调用，请求已发送`);
        } catch (error: unknown) {
          ztoolkit.log(`uploadToDify: 创建或发送请求失败: ${error}`);
          reject(new Error(`创建或发送请求失败: ${String(error)}`));
        }
      } catch (dataError) {
        ztoolkit.log(
          `uploadToDify: 处理数据出错: ${(dataError as Error)?.message || String(dataError)}`,
        );
        reject(
          new Error(
            `处理数据失败: ${(dataError as Error)?.message || String(dataError)}`,
          ),
        );
      }
    } catch (error) {
      ztoolkit.log(
        `uploadToDify 异常: ${(error as Error)?.message || String(error)}`,
      );
      reject(error);
    }
  });
}

/**
 * 从 Orsa Lab API 获取知识库列表
 * 让用户可以选择要使用的知识库，而不是手动输入知识库ID
 * @param apiKeyOverride 可选，用于覆盖从 Prefs 中获取的 API Key
 * @param baseUrlOverride 可选，用于覆盖从 Prefs 中获取的 Base URL
 * @returns Promise<Array<{id: string, name: string}>> 知识库列表
 * @throws Error 如果获取失败或 API Key 未配置
 */
export async function loadDifyKnowledgeBases(
  apiKeyOverride?: string,
  baseUrlOverride?: string,
): Promise<Array<{ id: string; name: string }>> {
  const apiKey =
    apiKeyOverride ||
    (Zotero.Prefs.get(`${config.prefsPrefix}.dify-api-key`, true) as string) ||
    "";
  const baseUrl =
    baseUrlOverride ||
    (Zotero.Prefs.get(`${config.prefsPrefix}.dify-base-url`, true) as string) ||
    "http://www.orsalab.cn/api/v1"; // 保持默认值

  if (!apiKey) {
    throw new Error("API Key 未配置。请在插件偏好设置中配置。");
  }

  // 确保 baseUrl 末尾没有多余的斜杠，但 API 端点需要 /v1
  const cleanBaseUrl = baseUrl.replace(/\/v1$/, "").replace(/\/+$/, "");
  const kbListUrl = `${cleanBaseUrl}/v1/datasets?page=1&limit=100`; // 增加 limit 获取更多知识库
  ztoolkit.log(`loadDifyKnowledgeBases: Fetching from ${kbListUrl}`);

  try {
    const response = await fetch(kbListUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      let errorJson;
      try {
        errorJson = await response.json();
      } catch (e) {
        // ignore
      }
      const errorDetail = errorJson
        ? (errorJson as OrsaLabError).message ||
          (errorJson as OrsaLabError).error
        : response.statusText;
      throw new Error(
        `获取知识库列表失败: HTTP ${response.status} - ${errorDetail}`,
      );
    }

    const responseData = (await response.json()) as unknown as
      | OrsaLabDatasetListResponse
      | OrsaLabDataset[];

    let datasets: OrsaLabDataset[] = [];
    if (Array.isArray(responseData)) {
      datasets = responseData as OrsaLabDataset[];
    } else if (
      responseData &&
      (responseData as OrsaLabDatasetListResponse).data
    ) {
      datasets = (responseData as OrsaLabDatasetListResponse).data;
    } else {
      // 尝试作为 OrsaLabDataset[] 直接处理，如果顶层就是数组且没有data包装器
      ztoolkit.log(
        "loadDifyKnowledgeBases: responseData.data not found, attempting to use responseData as array.",
      );
      // 如果 responseData 不是数组，这里会使 datasets 保持为空，后续会正确处理
    }

    if (!Array.isArray(datasets)) {
      // 双重检查确保 datasets 是数组
      ztoolkit.log(
        "loadDifyKnowledgeBases: Parsed datasets is not an array. Response structure might be unexpected.",
        responseData,
      );
      datasets = []; //置为空数组以避免后续错误
    }

    if (datasets.length === 0) {
      ztoolkit.log(
        "loadDifyKnowledgeBases: No datasets found from API or after parsing.",
      );
    }

    return datasets.map((kb) => ({ id: kb.id, name: kb.name }));
  } catch (error) {
    ztoolkit.log("获取 Orsa Lab 知识库列表出错:", error);
    if (error instanceof Error) {
      throw error; // 重新抛出原始错误或包装后的错误
    }
    throw new Error("获取知识库列表时发生未知网络错误。");
  }
}

/**
 * (此函数为旧的UI绑定版本，保留作为参考或未来可能的UI界面需求)
 * 旧版: loadDifyKnowledgeBasesToPreferencesUI
 * 从 Orsa Lab API 获取知识库列表并填充到偏好设置的下拉菜单中
 */
export async function loadDifyKnowledgeBasesToPreferencesUI() {
  if (!addon.data.prefs?.window) return;

  const document = addon.data.prefs.window.document;
  const menuPopup = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-dify-kb-list`,
  ) as XUL.MenuPopup;

  const menuList = document.querySelector(
    `#zotero-prefpane-${config.addonRef}-dify-kb-id`,
  ) as XUL.MenuList;

  if (!menuPopup || !menuList) {
    ztoolkit.log(
      "无法找到知识库下拉菜单元素 (loadDifyKnowledgeBasesToPreferencesUI)",
    );
    return;
  }

  // 清空现有菜单项
  while (menuPopup.firstChild) {
    menuPopup.removeChild(menuPopup.firstChild);
  }

  // 添加加载中...选项
  const loadingItem = document.createXULElement("menuitem");
  loadingItem.setAttribute("value", "");
  // loadingItem.setAttribute("data-l10n-id", "pref-kb-loading"); // FTL string might not be available here
  loadingItem.setAttribute("label", "加载中..."); // 使用硬编码的字符串
  menuPopup.appendChild(loadingItem);
  menuList.selectedIndex = 0;

  const apiKey =
    (Zotero.Prefs.get(`${config.prefsPrefix}.dify-api-key`, true) as string) ||
    "";
  if (!apiKey) {
    menuPopup.removeChild(loadingItem); // 移除加载项
    addErrorMenuItem(menuPopup, "请先输入 API Key");
    return;
  }

  try {
    const datasets = await loadDifyKnowledgeBases(); // 调用新的通用函数

    menuPopup.removeChild(loadingItem); // 移除加载项

    if (datasets.length === 0) {
      addEmptyMenuItem(menuPopup, "没有找到知识库");
      return;
    }

    const selectItem = document.createXULElement("menuitem");
    selectItem.setAttribute("value", "");
    // selectItem.setAttribute("data-l10n-id", "pref-kb-select");
    selectItem.setAttribute("label", "请选择知识库"); // 使用硬编码的字符串
    menuPopup.appendChild(selectItem);

    for (const kb of datasets) {
      if (kb && kb.id && kb.name) {
        const menuItem = document.createXULElement("menuitem");
        menuItem.setAttribute("value", kb.id);
        menuItem.setAttribute("label", kb.name);
        menuPopup.appendChild(menuItem);
      }
    }

    const savedKbId = Zotero.Prefs.get(
      `${config.prefsPrefix}.dify-kb-id`,
      true,
    ) as string;
    if (savedKbId) {
      let found = false;
      for (let i = 0; i < menuPopup.children.length; i++) {
        const item = menuPopup.children[i] as XUL.MenuItem;
        if (item.getAttribute("value") === savedKbId) {
          menuList.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found && menuPopup.children.length > 0) {
        menuList.selectedIndex = 0;
      }
    } else if (menuPopup.children.length > 0) {
      menuList.selectedIndex = 0;
    }
  } catch (error) {
    if (loadingItem.parentNode === menuPopup) {
      menuPopup.removeChild(loadingItem);
    }
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    addErrorMenuItem(menuPopup, `获取知识库列表出错: ${errorMessage}`);
    // ztoolkit.log 已在调用的 loadDifyKnowledgeBases 中处理
  }
}

/**
 * 添加错误提示菜单项
 */
function addErrorMenuItem(menuPopup: XUL.MenuPopup, message: string) {
  const doc = menuPopup.ownerDocument;
  if (!doc) {
    ztoolkit.log("addErrorMenuItem: menuPopup.ownerDocument is null");
    return;
  }
  const errorItem = doc.createXULElement("menuitem");
  errorItem.setAttribute("value", "");
  errorItem.setAttribute("data-l10n-id", "pref-kb-error");
  errorItem.setAttribute("label", message);
  errorItem.setAttribute("disabled", "true");
  menuPopup.appendChild(errorItem);
}

/**
 * 添加空结果提示菜单项
 */
function addEmptyMenuItem(menuPopup: XUL.MenuPopup, message: string) {
  const doc = menuPopup.ownerDocument;
  if (!doc) {
    ztoolkit.log("addEmptyMenuItem: menuPopup.ownerDocument is null");
    return;
  }
  const emptyItem = doc.createXULElement("menuitem");
  emptyItem.setAttribute("value", "");
  emptyItem.setAttribute("label", message);
  emptyItem.setAttribute("disabled", "true");
  menuPopup.appendChild(emptyItem);
}
