import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const ROLE_LABELS = { admin: "管理员", worker: "操作工", batcher: "配料长" };
const VOID_ROLES = ["admin", "batcher"];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

const fmtTime = (iso) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    board: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
    me: { type: Object },
    view: { type: String },
    filter: { type: String },
    statusFilter: { type: String },
    ratioPitId: { type: Number },
    orders: { type: Array },
    orderNo: { type: String },
    grease: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 16px 50px; }
    nav.top { display: flex; align-items: center; gap: 14px; background: #3a2c1e; color: #f3e9d8; padding: 10px 18px; }
    nav.top .brand { font-weight: bold; }
    nav.top a { color: #d9c8a9; text-decoration: none; padding: 4px 10px; border-radius: 6px; }
    nav.top a.on { background: #8a5a2b; color: #fff; }
    nav.top .grow { flex: 1; }
    nav.top .who { font-size: 0.9em; color: #d9c8a9; }
    nav.top button { background: none; border: 1px solid #d9c8a9; color: #f3e9d8; border-radius: 6px; cursor: pointer; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .warn { color: #9b1c1c; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: inline-block; margin: 8px 12px 8px 0; }
    input, button, select { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    .cols { display: grid; grid-template-columns: 250px 1fr; gap: 18px; align-items: start; }
    .pitlist { list-style: none; padding: 0; margin: 8px 0; }
    .pitlist .row { width: 100%; text-align: left; margin: 2px 0; border: 1px solid #cbbfa8; background: #f7f2e7; border-radius: 6px; cursor: pointer; }
    .pitlist .row.on { background: #8a5a2b; color: #fff; border-color: #8a5a2b; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border: 1px solid #cbbfa8; padding: 6px 8px; text-align: left; }
    tr.void td { color: #8d8271; background: #f3efe6; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.board = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
    this.me = null;
    this.view = location.hash === "#/ratio" ? "ratio" : "board";
    this.filter = "";
    this.statusFilter = "all";
    this.ratioPitId = 0;
    this.orders = [];
    this.orderNo = "1";
    this.grease = "5";
  }

  connectedCallback() {
    super.connectedCallback();
    this._onHash = () => {
      this.view = location.hash === "#/ratio" ? "ratio" : "board";
      if (this.ready && this.view === "ratio") this.loadOrders();
    };
    window.addEventListener("hashchange", this._onHash);
    if (this.ready) this.boot();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this._onHash);
  }

  get canVoid() {
    return this.me && VOID_ROLES.includes(this.me.role);
  }

  async boot() {
    try {
      this.me = await api("/api/auth/me");
      await this.refresh();
    } catch (e) {
      localStorage.removeItem(TOKEN_KEY);
      this.ready = false;
      this.err = "";
    }
  }

  async refresh() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
      }
      if (this.view === "ratio") await this.loadOrders();
    } catch (e) {
      this.err = e.message;
    }
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      this.me = data.user;
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.ready = false;
    this.me = null;
    this.board = null;
    this.picked = null;
    this.orders = [];
    this.err = "";
  }

  async writePh() {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setStatus(status) {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async pickRatioPit(id) {
    this.ratioPitId = id;
    this.err = "";
    await this.loadOrders();
  }

  async loadOrders() {
    if (!this.board || !this.board.pits.length) return;
    if (!this.ratioPitId || !this.board.pits.some((p) => p.id === this.ratioPitId)) {
      this.ratioPitId = this.board.pits[0].id;
    }
    try {
      this.orders = await api(`/api/pits/${this.ratioPitId}/ratio-orders`);
      const maxNo = this.orders.reduce((m, o) => Math.max(m, o.orderNo), 0);
      this.orderNo = String(maxNo + 1);
    } catch (e) {
      this.err = e.message;
    }
  }

  async createOrder(e) {
    e.preventDefault();
    this.err = "";
    try {
      await api(`/api/pits/${this.ratioPitId}/ratio-orders`, {
        method: "POST",
        body: JSON.stringify({ orderNo: Number(this.orderNo), greasePercent: Number(this.grease) }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async voidOrder(o) {
    this.err = "";
    try {
      await api(`/api/ratio-orders/${o.id}/void`, { method: "POST" });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  renderNav() {
    return html`<nav class="top">
      <span class="brand">南冈鞣场</span>
      <a href="#/board" class=${this.view === "board" ? "on" : ""}>坑位场地图</a>
      <a href="#/ratio" class=${this.view === "ratio" ? "on" : ""}>加脂配比</a>
      <span class="grow"></span>
      <span class="who">${this.me?.username ?? ""} · ${ROLE_LABELS[this.me?.role] ?? ""}</span>
      <button @click=${this.logout}>退出</button>
    </nav>`;
  }

  renderBoard() {
    return html`
      <h1>${this.board.yard}</h1>
      <p class="hint">${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0；登记酸碱须持油脂 3～8 的现行配比单</p>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => (this.picked = p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}
          </button>`
        )}
      </div>
      ${this.picked
        ? html`<section>
            <h3>${this.picked.code} · ${LABELS[this.picked.status]}</h3>
            <p>最近酸碱度：${this.picked.latestPh ?? "无"} · ${this.picked.sampleCount} 次</p>
            <p>
              现行配比单：${this.picked.activeRatio
                ? html`#${this.picked.activeRatio.orderNo} · 油脂 ${this.picked.activeRatio.greasePercent}%`
                : html`<span class="warn">无，须先在「加脂配比」开单</span>`}
            </p>
            <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
            <button @click=${this.writePh}>登记酸碱度</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
          </section>`
        : ""}
    `;
  }

  renderRatio() {
    const pits = this.board.pits.filter(
      (p) =>
        (!this.filter || p.code.includes(this.filter)) &&
        (this.statusFilter === "all" || p.status === this.statusFilter)
    );
    const pit = this.board.pits.find((p) => p.id === this.ratioPitId);
    return html`
      <h1>加脂配比</h1>
      <div class="cols">
        <aside>
          <input placeholder="筛坑号…" .value=${this.filter} @input=${(e) => (this.filter = e.target.value)} />
          <select @change=${(e) => (this.statusFilter = e.target.value)}>
            <option value="all" ?selected=${this.statusFilter === "all"}>全部状态</option>
            ${Object.entries(LABELS).map(
              ([k, v]) => html`<option value=${k} ?selected=${this.statusFilter === k}>${v}</option>`
            )}
          </select>
          <ul class="pitlist">
            ${pits.map(
              (p) => html`<li>
                <button class="row ${p.id === this.ratioPitId ? "on" : ""}" @click=${() => this.pickRatioPit(p.id)}>
                  ${p.code} · ${LABELS[p.status]}${p.activeRatio ? html` · #${p.activeRatio.orderNo}` : ""}
                </button>
              </li>`
            )}
          </ul>
        </aside>
        <section>
          ${pit
            ? html`
                <h3>${pit.code} · 加脂配比单</h3>
                <form @submit=${this.createOrder} autocomplete="off">
                  <label>单号
                    <input type="number" min="1" step="1" .value=${this.orderNo} @input=${(e) => (this.orderNo = e.target.value)} />
                  </label>
                  <label>油脂百分
                    <input type="number" min="0" step="0.1" .value=${this.grease} @input=${(e) => (this.grease = e.target.value)} />
                  </label>
                  <button>开单</button>
                  <span class="hint">操作工可开单；作废须配料长</span>
                </form>
                ${this.orders.length === 0
                  ? html`<p class="hint">该坑暂无配比单</p>`
                  : html`<table>
                      <thead>
                        <tr><th>单号</th><th>油脂%</th><th>开单人</th><th>开单时刻</th><th>作废人</th><th>作废时刻</th><th>状态</th><th></th></tr>
                      </thead>
                      <tbody>
                        ${this.orders.map(
                          (o) => html`<tr class=${o.active ? "" : "void"}>
                            <td>#${o.orderNo}</td>
                            <td>${o.greasePercent}</td>
                            <td>${o.createdBy}</td>
                            <td>${fmtTime(o.createdAt)}</td>
                            <td>${o.voidedBy ?? ""}</td>
                            <td>${o.voidedAt ? fmtTime(o.voidedAt) : ""}</td>
                            <td>${o.active ? "现行" : "已作废"}</td>
                            <td>
                              ${o.active
                                ? this.canVoid
                                  ? html`<button @click=${() => this.voidOrder(o)}>作废</button>`
                                  : html`<span class="hint">须配料长</span>`
                                : ""}
                            </td>
                          </tr>`
                        )}
                      </tbody>
                    </table>`}
              `
            : html`<p class="hint">左侧选一口坑</p>`}
        </section>
      </div>
    `;
  }

  render() {
    if (!this.ready) {
      return html`<div class="wrap">
        <h1>南冈鞣场</h1>
        <form @submit=${this.login} autocomplete="off">
          <label>用户名
            <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
          </label>
          <label>密码
            <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
          </label>
          <p class="hint">已预填 admin / 123456，另有 worker / 123456（操作工）、batcher / 123456（配料长）</p>
          <button>登录</button>
        </form>
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>`;
    }
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`
      ${this.renderNav()}
      <div class="wrap">
        ${this.view === "ratio" ? this.renderRatio() : this.renderBoard()}
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>
    `;
  }
}

customElements.define("tan-yard", TanYard);
