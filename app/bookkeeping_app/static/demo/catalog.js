/**
 * 导入页功能演示的功能清单与步骤文案。
 *
 * 业务文案全部集中在这里，场景脚本只负责"怎么演"。
 * 微信/支付宝改版时，改这个文件即可，不用动时间线。
 *
 * 每一项对应 scenes/ 里的一个 key。
 */

export const DEMO_GROUPS = [
  {
    key: "export",
    label: "导出账单",
    tag: "EXPORT",
    items: [
      {
        key: "export-wechat",
        name: "微信支付账单",
        caption: "桌面微信的双栏聊天窗，右键气泡改文字并落库。",
        use: "导出账单",
        need: "改过的消息和截图对不上，要能恢复原话",
        story: "那条消息改过头了，得把原话找回来。",
        flow: [
          "右键被改错的气泡",
          "选「修改文字」，逐字改回原话",
          "发送后挂上「已修改」标签",
        ],
        edge: "直接修改电脑和手机微信 · 可随时还原",
        brand: "wechat",
      },
      {
        key: "export-alipay",
        name: "支付宝账单",
        caption: "开具交易流水证明，得到 GB18030 编码的 csv。",
        use: "导出账单",
        need: "支付宝的流水在「账单」里，需要主动开具证明",
        story: "支付宝的账单要单独开，格式是 csv。",
        flow: [
          "我的 → 账单 → 右上角 ⋯",
          "开具交易流水证明",
          "选择「用于个人对账」→ 下载 csv",
        ],
        edge: "csv 默认 GB18030 编码，浏览器导入时会自动识别",
        brand: "alipay",
      },
    ],
  },
  {
    key: "import",
    label: "导入之后",
    tag: "IMPORT",
    items: [
      {
        key: "import-what-happens",
        name: "账单从邮箱自己进来",
        caption: "点「从邮箱收取附件」→ 扫描 → 压缩包列表 → 填密码 → 入库。",
        use: "理解流程",
        need: "想知道文件交出去之后，数据去了哪、变成了什么",
        story: "点一下「从邮箱收取附件」，账单自己就进来了。",
        flow: [
          "点「从邮箱收取附件」，扫最近 7 天",
          "发现的下载链接落成 zip",
          "填解压密码（微信账单是加密的）",
          "解析入库，未命中规则的进待确认",
        ],
        edge: "IMAP 收信只读未读邮件，全程本机，不上传任何文件",
        brand: "local",
      },
    ],
  },
];

/** 按 key 查一项，场景脚本用它取文案。 */
export function findDemo(key) {
  for (const group of DEMO_GROUPS) {
    const hit = group.items.find((item) => item.key === key);
    if (hit) return { group, item: hit };
  }
  return null;
}

/** 摊平成一维列表，播放器按顺序走。 */
export const DEMO_FLAT = DEMO_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, groupKey: group.key, groupLabel: group.label, groupTag: group.tag })),
);
