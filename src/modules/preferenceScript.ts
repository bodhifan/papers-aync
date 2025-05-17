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
  /* 
  // 不需要Zotero分类选择功能
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
  */
}

/**
 * 获取 Zotero 中的所有分类及其结构
 */
async function getZoteroCollections(): Promise<CollectionTreeItem[]> {
  /* 
  // 不需要Zotero分类选择功能
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
  */
  return [];
}

/**
 * 递归构建分类树结构
 */
async function buildCollectionTree(
  collection: Zotero.Collection,
  level: number,
): Promise<CollectionTreeItem> {
  /* 
  // 不需要Zotero分类选择功能
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
  */
  return {
    id: "",
    name: "",
    level: 0,
    itemCount: 0,
    children: [],
  };
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

      try {
        // 使用Zotero File API读取文件内容
        ztoolkit.log(`uploadToDify: 开始读取文件内容...`);
        ztoolkit.log(`uploadToDify: 读取文件 ${filePath} 为原始二进制数据`);

        // 直接使用NSIFile读取内容 - 这是日志中成功的方法
        let fileBinary;
        try {
          // 使用NSIFile进行底层访问
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
          ztoolkit.log(`uploadToDify: NSIFile读取失败: ${ex}, 尝试标准方法`);
          throw ex; // 让后续代码处理
        }

        let fileSize = fileBinary?.length || 0;
        ztoolkit.log(`uploadToDify: 文件读取完成，大小约: ${fileSize} 字节`);

        // 创建XHR对象
        ztoolkit.log(`uploadToDify: 创建XHR对象`);
        const xhr = new windowContext.XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);

        // 设置回调函数
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            ztoolkit.log(`uploadToDify: 上传成功! 响应: ${xhr.responseText}`);
            resolve();
          } else {
            const errorMsg = `上传失败 (${xhr.status}): ${xhr.responseText || "未知错误"}`;
            ztoolkit.log(`uploadToDify: ${errorMsg}`);
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = function (e: Event) {
          const errorMsg = `网络错误，上传失败: ${e ? e.type : "未知错误"}`;
          ztoolkit.log(`uploadToDify: ${errorMsg}`);
          reject(new Error(errorMsg));
        };

        // 手动构造multipart/form-data请求
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

        // 将已有部分转为UTF8二进制
        const encoder = new TextEncoder();
        const requestBodyPrefix = encoder.encode(requestBody);

        // 创建结尾部分
        const requestBodySuffix = encoder.encode(`\r\n--${boundary}--\r\n`);

        // 获取文件内容为二进制
        let fileContent: Uint8Array | null = null;

        try {
          // 使用Zotero.File读取文件内容
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
        xhr.send(requestData);
        ztoolkit.log(`uploadToDify: 请求已发送`);
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
