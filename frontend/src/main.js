import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const USER_KEY = "tanpit_user";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const ROLES = { admin: "管理员", worker: "操作工", mixchief: "配料长" };
const VOID_ROLES = ["mixchief", "admin"];

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

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—");

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    view: { type: String },
    user: { type: Object },
    board: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
    mixPicked: { type: Object },
    slips: { type: Array },
    filter: { type: String },
    fat: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .bar { display: flex; align-items: center; gap: 16px; background: #3a2c1e; color: #f3e9d8; padding: 10px 20px; }
    .bar strong { font-size: 1.1em; }
    .bar nav a { color: #d8c9ae; text-decoration: none; margin-right: 6px; padding: 4px 12px; border-radius: 6px; }
    .bar nav a.on { background: #8a5a2b; color: #fff; }
    .bar .who { margin-left: auto; font-size: 0.9em; color: #d8c9ae; }
    .bar .out { margin: 0; padding: 4px 10px; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 28px 16px 50px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    .mix { display: grid; grid-template-columns: 250px 1fr; gap: 18px; align-items: start; }
    .left input { width: 100%; box-sizing: border-box; margin: 0 0 10px; }
    .row { display: block; width: 100%; text-align: left; margin: 0 0 8px; padding: 8px 10px; border: 1px solid #cbb99e; background: #f7f1e5; border-radius: 8px; cursor: pointer; }
    .row.on { border-color: #8a5a2b; background: #efe2c8; }
    .tag { float: right; color: #6b5a48; font-size: 0.88em; }
    .tag.none { color: #a08b6f; }
    table { border-collapse: collapse; width: 100%; margin-top: 10px; }
    th, td { border-bottom: 1px solid #e0d3bd; padding: 6px 8px; text-align: left; }
    tr.void td { color: #9a8a72; }
    .new { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .new label { margin: 0; }
    .new input { width: 90px; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.view = location.hash === "#/mix" ? "mix" : "map";
    this.user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    this.board = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
    this.mixPicked = null;
    this.slips = [];
    this.filter = "";
    this.fat = "5";
  }

  connectedCallback() {
    super.connectedCallback();
    this._onHash = () => {
      this.view = location.hash === "#/mix" ? "mix" : "map";
    };
    window.addEventListener("hashchange", this._onHash);
    if (this.ready) this.refresh();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
    super.disconnectedCallback();
  }

  get canVoid() {
    return Boolean(this.user && VOID_ROLES.includes(this.user.role));
  }

  async refresh() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
      }
      if (this.mixPicked) {
        this.mixPicked = this.board.pits.find((p) => p.id === this.mixPicked.id) || null;
        if (this.mixPicked) await this.loadSlips();
      }
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
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      this.user = data.user;
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.ready = false;
    this.user = null;
    this.board = null;
    this.picked = null;
    this.mixPicked = null;
    this.slips = [];
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

  async pickMix(p) {
    this.err = "";
    this.mixPicked = p;
    await this.loadSlips();
  }

  async loadSlips() {
    if (!this.mixPicked) return;
    try {
      const data = await api(`/api/pits/${this.mixPicked.id}/slips`);
      this.slips = data.slips;
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async createSlip() {
    this.err = "";
    try {
      await api(`/api/pits/${this.mixPicked.id}/slips`, {
        method: "POST",
        body: JSON.stringify({ fat_percent: Number(this.fat) }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async voidSlip(slip) {
    this.err = "";
    try {
      await api(`/api/slips/${slip.id}/void`, { method: "POST" });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  renderMap() {
    return html`
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0；登记酸碱须本坑有现行配比单且油脂 3～8</p>
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
            <p>
              最近酸碱度：${this.picked.latestPh ?? "无"} · ${this.picked.sampleCount} 次 · 现行配比单：${this.picked.currentSlip
                ? html`#${this.picked.currentSlip.seq}（油脂 ${this.picked.currentSlip.fatPercent}%）`
                : "无"}
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

  renderMix() {
    const kw = this.filter.trim();
    const pits = this.board.pits.filter((p) => !kw || p.code.includes(kw));
    const mp = this.mixPicked;
    return html`<div class="mix">
      <aside class="left">
        <input placeholder="筛坑…" .value=${this.filter} @input=${(e) => (this.filter = e.target.value)} />
        ${pits.map(
          (p) => html`<button class="row ${mp && mp.id === p.id ? "on" : ""}" @click=${() => this.pickMix(p)}>
            <strong>${p.code}</strong> · ${LABELS[p.status]}
            ${p.currentSlip
              ? html`<span class="tag">#${p.currentSlip.seq} · ${p.currentSlip.fatPercent}%</span>`
              : html`<span class="tag none">无单</span>`}
          </button>`
        )}
      </aside>
      <section class="right">
        ${mp
          ? html`
              <h3>${mp.code} · 加脂配比单</h3>
              <div class="new">
                <label>油脂百分 <input .value=${this.fat} @input=${(e) => (this.fat = e.target.value)} /></label>
                <button @click=${this.createSlip}>开单</button>
                <span class="hint">操作工可开单；作废归配料长</span>
              </div>
              ${this.slips.length === 0
                ? html`<p class="hint">本坑暂无配比单</p>`
                : html`<table>
                    <thead>
                      <tr><th>单号</th><th>油脂%</th><th>开单人</th><th>开单时刻</th><th>作废</th></tr>
                    </thead>
                    <tbody>
                      ${this.slips.map(
                        (s) => html`<tr class=${s.voidedAt ? "void" : ""}>
                          <td>#${s.seq}</td>
                          <td>${s.fatPercent}</td>
                          <td>${s.createdBy}</td>
                          <td>${fmtTime(s.createdAt)}</td>
                          <td>
                            ${s.voidedAt
                              ? html`${s.voidedBy}<br />${fmtTime(s.voidedAt)}`
                              : this.canVoid
                                ? html`<button @click=${() => this.voidSlip(s)}>作废</button>`
                                : html`<span class="hint">—</span>`}
                          </td>
                        </tr>`
                      )}
                    </tbody>
                  </table>`}
            `
          : html`<p class="hint">先在左侧挑一口坑</p>`}
      </section>
    </div>`;
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
          <p class="hint">已预填 admin / 123456，另有 worker / 123456、mixchief / 123456（配料长）</p>
          <button>登录</button>
        </form>
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>`;
    }
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`
      <header class="bar">
        <strong>${this.board.yard}</strong>
        <nav>
          <a href="#/map" class=${this.view === "map" ? "on" : ""}>坑位场地图</a>
          <a href="#/mix" class=${this.view === "mix" ? "on" : ""}>加脂配比</a>
        </nav>
        <span class="who">${this.user?.username} · ${ROLES[this.user?.role] || ""}</span>
        <button class="out" @click=${this.logout}>退出</button>
      </header>
      <div class="wrap">
        ${this.view === "map" ? this.renderMap() : this.renderMix()}
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>
    `;
  }
}

customElements.define("tan-yard", TanYard);
