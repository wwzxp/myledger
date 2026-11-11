/**
 * 场景注册表。key 必须与 catalog.js 里的 item.key 一致。
 */
import exportWechat from "./export-wechat.js";
import exportAlipay from "./export-alipay.js";
import importFlow from "./import-flow.js";
import mailAuth from "./mail-auth.js";

export const SCENES = {
  "export-wechat": exportWechat,
  "export-alipay": exportAlipay,
  "import-what-happens": importFlow,
  "mail-auth-code": mailAuth,
};
