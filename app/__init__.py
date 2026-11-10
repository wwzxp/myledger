"""我的账本工具：本地优先的账单分析应用。

包内模块：
- `bookkeeping`：入库、去重、规则、聚合与 Dashboard（fork 自 bingchuH/Bookkeeping）
- `importers`：账单解析门面，统一金额分与类型
- `upload`：网页上传的解析与入库
- `classify`：本地 1B 模型兜底分类
- `multipart`：最小 multipart 解析
"""

__version__ = "0.1.0"
