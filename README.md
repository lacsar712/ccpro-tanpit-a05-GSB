# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。顶栏两页：「坑位场地图」点坑登记浸液酸碱度并改状态，「加脂配比」开配比单、配料长作废。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`（操作工），`mixchief` / `123456`（配料长）

## 业务规则

- 坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`。改坑态不看配比单。
- 登记酸碱度时，本坑须有**现行加脂配比单**且油脂百分在 **3～8**（含）；无单或油脂出区间整笔拒绝，酸碱不入库。
- 配比单记下单号（每坑从 1 起）、油脂百分、开单人、开单时刻；作废人、作废时刻在作废前为空。本坑现行单号在库里有唯一约束，并发撞号只留一张。
- 油脂须为正数。操作工可开单；作废归配料长（admin 兼可）。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
