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
      {
        key: "export-meituan",
        name: "美团账单",
        caption: "钱包 → 账单 → 右上角 ⋯ → 下载账单，选日期发到邮箱。",
        use: "导出账单",
        need: "美团流水只能从 App 里申请，网页端没有入口",
        story: "美团账单得从钱包进，走一次申请流程。",
        flow: [
          "我的 → 钱包 → 账单",
          "右上角 ⋯ → 下载账单 → 去下载",
          "选交易类型与起止日期 → 下一步",
          "填接收邮箱 → 发送（加密 Excel 发到邮箱）",
        ],
        edge: "最长导出 3 个月 · 加密文件需要邮箱里的解压密码",
        brand: "local",
      },
      {
        key: "export-douyin",
        name: "抖音账单",
        caption: "钱包 → 账单 → ⋯ → 下载账单，需支付密码，电子回单发邮箱。",
        use: "导出账单",
        need: "抖音流水只能从 App 申请，且要走支付密码验证",
        story: "抖音账单在钱包里，申请后电子回单发到邮箱。",
        flow: [
          "我的 → 右上角横杆 → 我的钱包 → 账单",
          "右上角 ⋯ → 下载账单 → 实名下所有账单",
          "勾选同意 → 申请下载 → 输入支付密码",
          "自定义日期 → 填邮箱 → 发送（电子回单发到邮箱）",
        ],
        edge: "单次最长导出 1 年 · 解压密码在申请结果页给一次",
        brand: "local",
      },
    ],
  },
  {
    key: "prep",
    label: "导入之前",
    tag: "PREP",
    items: [
      {
        key: "mail-auth-code",
        name: "邮箱授权码怎么拿",
        caption: "QQ 邮箱网页端开一次 IMAP，拿到授权码回来填进设置。",
        use: "配置邮件",
        need: "想用「从邮箱收取附件」，但不知道授权码在哪生成",
        story: "不先拿到授权码，「从邮箱收取附件」是点不动的。",
        flow: [
          "QQ 邮箱右上角「设置」→ 左侧「账号与安全」",
          "「安全设置」→ 找到 POP3/IMAP 服务 →「开启服务」",
          "扫码验证手机号 → 拿到 16 位授权码",
          "回我的账本「设置」→ 填邮箱账号和授权码 → 保存",
        ],
        edge: "授权码等价于邮箱密码 · 只在浏览器登录第三方客户端时使用",
        brand: "local",
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
