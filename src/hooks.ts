import {
  BasicExampleFactory,
  HelperExampleFactory,
  KeyExampleFactory,
  PromptExampleFactory,
  UIExampleFactory,
} from "./modules/examples";
import { getString, initLocale } from "./utils/locale";
import {
  loadDifyKnowledgeBases,
  loadDifyKnowledgeBasesToPreferencesUI,
  loadZoteroCollections,
  registerPrefsScripts,
  testDifyConnection,
  extractItemMetadata,
  uploadToDify,
} from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  BasicExampleFactory.registerPrefs();

  // BasicExampleFactory.registerNotifier();

  // KeyExampleFactory.registerShortcuts();

  // 注释掉不存在的UI方法调用
  // await UIExampleFactory.registerExtraColumn();
  // await UIExampleFactory.registerExtraColumnWithCustomCell();
  // UIExampleFactory.registerItemPaneCustomInfoRow();
  // UIExampleFactory.registerItemPaneSection();
  // UIExampleFactory.registerReaderItemPaneSection();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  // @ts-ignore This is a moz feature
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
  //   closeOnClick: true,
  //   closeTime: -1,
  // })
  //   .createLine({
  //     text: getString("startup-begin"),
  //     type: "default",
  //     progress: 0,
  //   })
  //   .show();

  // await Zotero.Promise.delay(1000);
  // popupWin.changeLine({
  //   progress: 30,
  //   text: `[30%] ${getString("startup-begin")}`,
  // });

  // UIExampleFactory.registerStyleSheet(win);

  // UIExampleFactory.registerRightClickMenuItem();

  // UIExampleFactory.registerRightClickMenuPopup(win);

  // UIExampleFactory.registerWindowMenuWithSeparator();

  // PromptExampleFactory.registerNormalCommandExample();

  // PromptExampleFactory.registerAnonymousCommandExample(win);

  // PromptExampleFactory.registerConditionalCommandExample();

  await Zotero.Promise.delay(1000);

  // popupWin.changeLine({
  //   progress: 100,
  //   text: `[100%] ${getString("startup-finish")}`,
  // });
  // popupWin.startCloseTimer(5000);

  // addon.hooks.onDialogEvents("dialogExample");

  registerKnowledgeBaseSyncMenu(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
  if (
    event == "select" &&
    type == "tab" &&
    extraData[ids[0]].type == "reader"
  ) {
    BasicExampleFactory.exampleNotifierCallback();
  } else {
    return;
  }
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      // 在偏好设置窗口加载时，自动加载知识库列表
      await loadDifyKnowledgeBasesToPreferencesUI();
      break;
    case "testDifyConnection":
      await testDifyConnection();
      break;
    case "loadZoteroCollections":
      await loadZoteroCollections();
      break;
    case "loadDifyKnowledgeBases":
      await loadDifyKnowledgeBasesToPreferencesUI();
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  switch (type) {
    case "larger":
      KeyExampleFactory.exampleShortcutLargerCallback();
      break;
    case "smaller":
      KeyExampleFactory.exampleShortcutSmallerCallback();
      break;
    default:
      break;
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    case "dialogExample":
      HelperExampleFactory.dialogExample();
      break;
    case "clipboardExample":
      HelperExampleFactory.clipboardExample();
      break;
    case "filePickerExample":
      HelperExampleFactory.filePickerExample();
      break;
    case "progressWindowExample":
      HelperExampleFactory.progressWindowExample();
      break;
    case "vtableExample":
      HelperExampleFactory.vtableExample();
      break;
    default:
      break;
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
  handleSyncToKnowledgeBaseCommand,
};

/**
 * 注册知识库同步相关的右键菜单
 * @param win Zotero 主窗口对象
 */
function registerKnowledgeBaseSyncMenu(win: _ZoteroTypes.MainWindow) {
  const doc = win.document;
  const menuId = `${addon.data.config.addonRef}-itemmenu-kb-sync`;

  // 检查菜单是否已经存在，防止重复添加
  if (doc.getElementById(menuId)) {
    ztoolkit.log(
      `Knowledge base sync menu (ID: ${menuId}) already exists for this window. Skipping registration.`,
    );
    return;
  }

  const itemMenu = doc.getElementById("zotero-itemmenu") as XUL.MenuPopup;

  if (!itemMenu) {
    Zotero.debug(
      `[${addon.data.config.addonRef}] Error: Could not find zotero-itemmenu to attach knowledge base sync menu.`,
    );
    return;
  }

  // 创建主菜单 "知识库同步"
  const syncMainMenu = doc.createXULElement("menu");
  syncMainMenu.setAttribute("id", menuId); // 使用之前定义的 menuId
  syncMainMenu.setAttribute("label", "知识库同步"); // TODO: 使用 FTL 本地化

  const syncMainPopup = doc.createXULElement("menupopup");
  syncMainMenu.appendChild(syncMainPopup);

  // 创建子菜单 "同步到..."
  const syncToSubMenu = doc.createXULElement("menu");
  syncToSubMenu.setAttribute(
    "id",
    `${addon.data.config.addonRef}-itemmenu-kb-sync-to`,
  );
  syncToSubMenu.setAttribute("label", "同步到..."); // TODO: 使用 FTL 本地化
  syncMainPopup.appendChild(syncToSubMenu);

  const syncToListPopup = doc.createXULElement("menupopup");
  syncToListPopup.setAttribute(
    "id",
    `${addon.data.config.addonRef}-itemmenu-kb-sync-to-list`,
  );

  // 关键：在这里为动态列表popup添加onpopupshowing事件
  syncToListPopup.addEventListener("popupshowing", async (event) => {
    const popup = event.target as XUL.MenuPopup;
    // 清空旧的知识库列表项
    while (popup.firstChild) {
      popup.removeChild(popup.firstChild);
    }

    // 添加"加载中..."项
    const loadingItem = doc.createXULElement("menuitem");
    loadingItem.setAttribute("label", "加载中...");
    loadingItem.setAttribute("disabled", "true");
    popup.appendChild(loadingItem);

    try {
      const kbs = await loadDifyKnowledgeBases(); // 调用已重构的函数
      popup.removeChild(loadingItem); // 移除加载项

      if (kbs.length === 0) {
        const noKbItem = doc.createXULElement("menuitem");
        noKbItem.setAttribute("label", "未找到知识库");
        noKbItem.setAttribute("disabled", "true");
        popup.appendChild(noKbItem);
        return;
      }

      kbs.forEach((kb) => {
        const kbItem = doc.createXULElement("menuitem");
        kbItem.setAttribute("label", kb.name);
        kbItem.setAttribute("value", kb.id); // 将知识库ID存在value属性
        // 注意: oncommand 属性直接设置字符串时，需要确保 addon.hooks.handleSyncToKnowledgeBaseCommand 能被全局访问
        // 或者使用 addEventListener。为简单起见，先用 oncommand 字符串。
        kbItem.setAttribute(
          "oncommand",
          `Zotero.${addon.data.config.addonInstance}.hooks.handleSyncToKnowledgeBaseCommand(event);`,
        );
        popup.appendChild(kbItem);
      });
    } catch (error) {
      Zotero.debug(
        `[${addon.data.config.addonRef}] Failed to load knowledge bases for context menu: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (popup.contains(loadingItem)) popup.removeChild(loadingItem);
      const errorItem = doc.createXULElement("menuitem");
      const errorMessage =
        error instanceof Error ? error.message : "获取列表失败";
      errorItem.setAttribute("label", `错误: ${errorMessage}`);
      errorItem.setAttribute("disabled", "true");
      popup.appendChild(errorItem);
    }
  });
  syncToSubMenu.appendChild(syncToListPopup);

  // 将新菜单添加到条目右键菜单中
  // 通常在 "Send to" 或类似菜单项之前或之后
  // 为确保可见，先简单地 append
  itemMenu.appendChild(syncMainMenu);
  ztoolkit.log("Knowledge base sync menu registered.");
}

/**
 * 处理从右键菜单发起的同步命令
 * @param event 命令事件对象
 */
async function handleSyncToKnowledgeBaseCommand(event: Event) {
  ztoolkit.log("handleSyncToKnowledgeBaseCommand CALLED!", event); // 添加日志记录
  const menuItem = event.target as XUL.Element;
  const datasetId = menuItem.getAttribute("value");
  const datasetName = menuItem.getAttribute("label"); // 获取知识库名称用于提示
  const activeZoteroPane = Zotero.getActiveZoteroPane();

  if (!activeZoteroPane) {
    Zotero.debug(
      `[${addon.data.config.addonRef}] Error: handleSyncToKnowledgeBaseCommand: ZoteroPane is not active.`,
    );
    return;
  }
  const windowContext = activeZoteroPane.document.defaultView;

  if (!datasetId) {
    Zotero.debug(
      `[${addon.data.config.addonRef}] Error: handleSyncToKnowledgeBaseCommand: No knowledge base ID found on menu item.`,
    );
    if (windowContext) new windowContext.Alert("同步错误：未选择知识库ID");
    return;
  }

  const selectedZoteroItems = activeZoteroPane.getSelectedItems();

  if (!selectedZoteroItems || selectedZoteroItems.length === 0) {
    if (windowContext)
      new windowContext.Alert("请先在Zotero中选择要同步的条目。");
    return;
  }

  ztoolkit.log(
    `Starting sync for ${selectedZoteroItems.length} items to KB ID: ${datasetId}`,
  );

  const apiKey =
    (Zotero.Prefs.get(
      `${addon.data.config.prefsPrefix}.dify-api-key`,
      true,
    ) as string) || "";
  let baseUrl =
    (Zotero.Prefs.get(
      `${addon.data.config.prefsPrefix}.dify-base-url`,
      true,
    ) as string) || "http://www.orsalab.cn/api/v1";
  baseUrl = baseUrl.replace(/\/+$/, "");

  if (!apiKey || !baseUrl) {
    if (windowContext)
      new windowContext.Alert("同步错误：API Key或服务器URL未配置。");
    Zotero.debug(
      `[${addon.data.config.addonRef}] Error: handleSyncToKnowledgeBaseCommand: API Key or Base URL not configured.`,
    );
    return;
  }

  const progressWin = new Zotero.ProgressWindow();
  progressWin.changeHeadline("正在同步到知识库...");
  progressWin.show();

  let successCount = 0;
  let failedCount = 0;
  const failedItems: Array<{ title: string; reason: string }> = [];

  // 添加更新描述的函数
  const updateDescription = (
    text: string,
    currentIndex: number,
    totalItems: number,
  ) => {
    // 更新标题
    progressWin.changeHeadline(
      `同步到知识库... (${currentIndex + 1}/${totalItems})`,
    );
    // 添加新的描述
    // progressWin.addDescription(text);
  };

  try {
    for (let i = 0; i < selectedZoteroItems.length; i++) {
      const zItem = selectedZoteroItems[i];
      const itemTitle = zItem.getField("title") || "未知条目";

      // 更新进度窗口标题，显示当前处理的文件
      updateDescription(
        `当前处理: ${itemTitle}`,
        i,
        selectedZoteroItems.length,
      );

      // 创建进度条项
      const itemProgress = new progressWin.ItemProgress(
        `正在处理: ${itemTitle}`,
        "",
      );
      const truncatedTitle =
        itemTitle.length > 10 ? itemTitle.substring(0, 20) + "..." : itemTitle;
      itemProgress.setText(`正在同步: ${truncatedTitle}`);
      itemProgress.setProgress(0);

      let fileToUploadPath: string | null = null;
      let mimeToUse: string | null = null;
      let resolvedAttachmentFilename: string | null = null;

      // 检查当前项是否是 PDF 文件
      if (
        zItem.isAttachment() &&
        zItem.attachmentContentType === "application/pdf"
      ) {
        const filePath = await zItem.getFilePathAsync();
        if (filePath) {
          fileToUploadPath = filePath;
          mimeToUse = "application/pdf";
          resolvedAttachmentFilename = zItem.attachmentFilename;
          ztoolkit.log(`Current item is a PDF file: ${fileToUploadPath}`);
        }
      } else {
        // 如果不是 PDF 文件，则尝试获取附件
        updateDescription(`正在查找附件...`, i, selectedZoteroItems.length);
        itemProgress.setProgress(10);
        ztoolkit.log(`Processing item: ${zItem.key} - ${itemTitle}`);
        const attachments = await zItem.getAttachments(false);
        ztoolkit.log(
          `Found ${attachments.length} attachment IDs for item ${zItem.key}`,
        );

        // 1. 优先尝试查找 PDF 附件
        for (const attachmentID of attachments) {
          const attachment = await Zotero.Items.getAsync(attachmentID);
          if (
            attachment &&
            attachment.attachmentContentType === "application/pdf"
          ) {
            const filePath = await attachment.getFilePathAsync();
            if (filePath) {
              fileToUploadPath = filePath;
              mimeToUse = "application/pdf";
              resolvedAttachmentFilename = attachment.attachmentFilename;
              ztoolkit.log(
                `PDF attachment found and selected: ${fileToUploadPath}`,
              );
              break;
            }
          }
        }

        // 2. 如果没有找到 PDF，再尝试查找 TXT 附件
        if (!fileToUploadPath) {
          for (const attachmentID of attachments) {
            const attachment = await Zotero.Items.getAsync(attachmentID);
            if (attachment) {
              const contentType = attachment.attachmentContentType;
              const filename = attachment.attachmentFilename;
              if (
                contentType === "text/plain" ||
                (filename && filename.toLowerCase().endsWith(".txt"))
              ) {
                const filePath = await attachment.getFilePathAsync();
                if (filePath) {
                  fileToUploadPath = filePath;
                  mimeToUse = "text/plain";
                  resolvedAttachmentFilename = attachment.attachmentFilename;
                  ztoolkit.log(
                    `TXT attachment found and selected: ${fileToUploadPath}`,
                  );
                  break;
                }
              }
            }
          }
        }
      }
      // 检查文件大小是否超过15MB
      //@ts-ignore
      const fileSize = await IOUtils.stat(fileToUploadPath);
      //@ts-ignore
      if (fileSize.size > 15 * 1024 * 1024) {
        const itemProgress = new progressWin.ItemProgress(
          `文件过大: ${itemTitle}`,
          "文件大小超过15MB，无法上传",
        );
        itemProgress.setError();
        failedItems.push({
          title: itemTitle,
          reason: "文件大小超过15MB",
        });
        failedCount++;
        continue; // 跳过当前文件，继续处理下一个
      }
      if (fileToUploadPath && mimeToUse && resolvedAttachmentFilename) {
        ztoolkit.log(
          `Valid attachment found for item ${zItem.key}: ${fileToUploadPath} (type: ${mimeToUse})`,
        );
        try {
          updateDescription(`正在提取元数据...`, i, selectedZoteroItems.length);
          itemProgress.setProgress(20);
          ztoolkit.log(`Extracting metadata for ${zItem.key}`);
          const metadata = extractItemMetadata(zItem);
          ztoolkit.log(`Metadata extracted for ${zItem.key}:`, metadata);
          itemProgress.setProgress(30);

          updateDescription(
            `正在上传: ${resolvedAttachmentFilename}`,
            i,
            selectedZoteroItems.length,
          );
          itemProgress.setProgress(40);
          ztoolkit.log(
            `Preparing to upload ${fileToUploadPath} for item ${zItem.key}`,
          );

          const currentWindowContext = activeZoteroPane.document.defaultView;
          if (!currentWindowContext) {
            throw new Error("无法获取当前窗口上下文以执行上传操作。");
          }

          ztoolkit.log(`Calling uploadToDify with:
            filePath: ${fileToUploadPath}
            mimeType: ${mimeToUse}
            metadata: ${JSON.stringify(metadata, null, 2)}
            apiKey: ${apiKey ? apiKey.substring(0, 5) + "..." : "NOT SET"}
            baseUrl: ${baseUrl}
            datasetId: ${datasetId}
            windowContext available: ${!!currentWindowContext}`);

          await uploadToDify(
            fileToUploadPath,
            metadata,
            apiKey,
            baseUrl,
            datasetId,
            currentWindowContext,
            mimeToUse,
          );

          itemProgress.setProgress(100);
          updateDescription(
            `上传成功: ${resolvedAttachmentFilename}`,
            i,
            selectedZoteroItems.length,
          );
          ztoolkit.log(
            `Successfully uploaded ${resolvedAttachmentFilename} (${mimeToUse}) for item ${zItem.key}`,
          );
          successCount++;
        } catch (uploadError) {
          const errorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : String(uploadError);
          Zotero.debug(
            `[${addon.data.config.addonRef}] Failed to sync item ${zItem.key} (${resolvedAttachmentFilename}, type: ${mimeToUse}). Error: ${errorMessage}`,
          );
          updateDescription(
            `上传失败: ${resolvedAttachmentFilename}`,
            i,
            selectedZoteroItems.length,
          );
          itemProgress.setError();
          // 添加到失败列表，提取错误标题
          const errorTitle = errorMessage.includes("<title>")
            ? errorMessage.match(/<title>(.*?)<\/title>/)?.[1] || errorMessage
            : errorMessage;
          failedItems.push({
            title: itemTitle,
            reason: errorTitle,
          });
          failedCount++;
        }
      } else {
        ztoolkit.log(
          `No valid PDF or TXT attachment found for item ${zItem.key}`,
        );
        updateDescription("未找到PDF或TXT附件", i, selectedZoteroItems.length);
        itemProgress.setError();
        failedCount++;
        // 添加到失败列表
        failedItems.push({
          title: itemTitle,
          reason: "未找到PDF或TXT附件",
        });
      }
    }
  } finally {
    progressWin.close();
  }

  const finalActiveZoteroPane = Zotero.getActiveZoteroPane();
  const finalWindowContext = finalActiveZoteroPane
    ? finalActiveZoteroPane.document.defaultView
    : Zotero.getMainWindow()
      ? Zotero.getMainWindow().document.defaultView
      : null;

  let finalMessage = `同步完成。成功: ${successCount}，失败: ${failedCount}。`;
  if (failedCount > 0 && successCount === 0) {
    finalMessage = `所有条目同步失败。失败: ${failedCount}。请检查错误日志。`;
    if (finalWindowContext) {
      // 显示失败列表
      const failedList = failedItems
        .map((item) => `- ${item.title}\n  原因: ${item.reason}`)
        .join("\n");
      finalWindowContext.alert(finalMessage + "\n\n失败项列表:\n" + failedList);
    }
    Zotero.debug(
      `[${addon.data.config.addonRef}] Knowledge base sync critical errors: ${finalMessage}`,
    );
  } else if (failedCount > 0) {
    if (finalWindowContext) {
      // 显示失败列表
      const failedList = failedItems
        .map((item) => `- ${item.title}\n  原因: ${item.reason}`)
        .join("\n");
      finalWindowContext.alert(finalMessage + "\n\n失败项列表:\n" + failedList);
    }
    Zotero.debug(
      `[${addon.data.config.addonRef}] Knowledge base sync warnings: ${finalMessage}`,
    );
  } else {
    if (finalWindowContext) finalWindowContext.alert(finalMessage);
    Zotero.debug(
      `[${addon.data.config.addonRef}] Knowledge base sync success: ${finalMessage}`,
    );
  }
  ztoolkit.log(finalMessage);
  finalWindowContext?.show();
}
