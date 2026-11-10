    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
    const money = (cents) => (Number(cents || 0) / 100).toFixed(2);
    const increaseTypes = new Set(['收入', '借入', '收款']);
    const decreaseTypes = new Set(['支出', '借出', '还款']);
    let pendingAnimating = false;
    let entries = [];
    let accountBalances = [];
    let debtBalances = [];
    let pendingItems = [];
    let categoryOptions = [];
    let categoryTree = {};
    let accountOptions = [];
    let accountFilterOptions = [];
    let keywordRules = [];
    let summaryData = null;
    let periodMode = 'month';
    /* 汇总面板：桌面两种模式共用一套 DOM，只切列宽与显隐 */
    const PANEL_MODE_KEY = 'bookkeeping.panelMode';
    let panelMode = localStorage.getItem(PANEL_MODE_KEY) === 'flow' ? 'flow' : 'split';
    let cycleMode = 'quarter';
    let selectedCycleIndex = 0;
    let yearOffset = 0;
    let monthOffset = 0;
    let customStart = '';
    let customEnd = '';
    let periodInitialized = false;
    let activeDateTarget = null;
    let pickerMonth = new Date();
    let entryPage = 1;
    // 手机上一屏放不下太多卡片，默认每页 20 条；桌面仍用 50
    const isNarrowScreen = () => window.matchMedia('(max-width: 768px)').matches;
    let entryPageSize = localStorage.getItem('bookkeeping.entryPageSize')
      || (isNarrowScreen() ? '20' : '50');
    let editingEntryId = null;
    let entryFilters = {year: '', month: '', day: '', type: '', category: '', account: '', transaction_object: '', tone: '', start: '', end: ''};
    let entryTypes = [];
    let pendingDelete = null;
    let pendingCategoryDelete = null;
    let pendingDebtDelete = null;
    let pendingAccountDelete = null;
    let pendingSuggestionCache = {};
    let pendingSkippedIds = JSON.parse(localStorage.getItem('bookkeeping.pendingSkippedIds') || '[]');
    let expenseCategoryLevel = localStorage.getItem('bookkeeping.expenseCategoryLevel') || 'major';
    let editingCategoryKey = null;
    let addingKeywordKey = null;
    let editingAccountName = null;
    let editingAccountBalanceName = null;

    async function api(path, options) {
      const requestOptions = {...(options || {}), cache: 'no-store'};
      const res = await fetch(path, requestOptions);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || res.statusText);
      return data;
    }

    function savePendingSkippedIds() {
      localStorage.setItem('bookkeeping.pendingSkippedIds', JSON.stringify(pendingSkippedIds));
    }

    function orderPendingItems(items) {
      const itemKey = item => String(item.ui_id || item.id);
      const availableIds = new Set(items.map(itemKey));
      pendingSkippedIds = pendingSkippedIds.filter(id => availableIds.has(String(id)));
      savePendingSkippedIds();
      const skippedIndex = new Map(pendingSkippedIds.map((id, index) => [String(id), index]));
      return [...items].sort((a, b) => {
        const ai = skippedIndex.has(itemKey(a)) ? skippedIndex.get(itemKey(a)) : -1;
        const bi = skippedIndex.has(itemKey(b)) ? skippedIndex.get(itemKey(b)) : -1;
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return -1;
        if (bi === -1) return 1;
        return ai - bi;
      });
    }

    function formatBytes(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    /* 图表刻度：数值要能对上账，只做必要缩写，不四舍五入到失真 */
    function compactMoney(cents) {
      const yuan = Number(cents || 0) / 100;
      if (yuan >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
      if (yuan >= 1000) return yuan.toFixed(0);
      if (yuan >= 100) return yuan.toFixed(0);
      if (yuan >= 10) return yuan.toFixed(0);
      return yuan.toFixed(yuan < 1 ? 2 : 0);
    }

    function signedMoney(cents, tone = 'neutral') {
      const value = Math.abs(Number(cents || 0)) / 100;
      const sign = tone === 'income' ? '+' : tone === 'expense' ? '-' : Number(cents || 0) < 0 ? '-' : '+';
      return `${sign}${value.toFixed(2)}`;
    }

    function balanceMoney(cents) {
      const value = Number(cents || 0) / 100;
      return value < 0 ? `-${Math.abs(value).toFixed(2)}` : value.toFixed(2);
    }

    function moneyTone(row) {
      if (!row) return 'neutral';
      if (row.type === '余额修正') return 'neutral';
      if (increaseTypes.has(row.type)) return 'income';
      if (decreaseTypes.has(row.type)) return 'expense';
      return 'neutral';
    }

    function reportableEntry(row) {
      return row && row.type !== '转账' && row.type !== '余额修正' && row.category !== '转账';
    }

    function moneyClass(_value, row) {
      const tone = moneyTone(row);
      return `money-cell ${tone === 'income' ? 'income' : tone === 'expense' ? 'expense' : 'neutral-money'}`;
    }

    function signedEntryMoney(cents, row) {
      return signedMoney(cents, moneyTone(row));
    }

    function amountValue(cents) {
      return (Math.abs(Number(cents || 0)) / 100).toFixed(2);
    }

    function nowDatetimeLocal() {
      const date = new Date();
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      return date.toISOString().slice(0, 16);
    }

    function datetimeInputValue(value) {
      return String(value || '').replace(' ', 'T').slice(0, 16);
    }

    function optionsHtml(options, selected, allowBlank = false) {
      const values = [...new Set(options.filter(value => value !== undefined && value !== null && String(value).trim() !== '').map(String))];
      if (selected && !values.includes(String(selected))) values.unshift(String(selected));
      const blank = allowBlank ? '<option value=""></option>' : '';
      return blank + values.map(value => `<option value="${esc(value)}" ${String(value) === String(selected || '') ? 'selected' : ''}>${esc(value)}</option>`).join('');
    }

    function categoryLabel(category) {
      return String(category || '').replaceAll('/', '·');
    }

    function majorCategory(category) {
      const value = String(category || '').trim();
      if (!value || value === '未分类') return '未分类';
      return value.split('/')[0] || value;
    }

    function categoryOptionsHtml(options, selected, allowBlank = false) {
      const values = [...new Set(options.filter(value => value !== undefined && value !== null && String(value).trim() !== '').map(String))];
      if (selected && !values.includes(String(selected))) values.unshift(String(selected));
      const blank = allowBlank ? '<option value=""></option>' : '';
      return blank + values.map(value => `<option value="${esc(value)}" ${String(value) === String(selected || '') ? 'selected' : ''}>${esc(categoryLabel(value))}</option>`).join('');
    }

    function uniqueEntryValues(field) {
      return [...new Set(entries.map(entry => String(entry[field] || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    }

    function entryFilterCategoryOptions() {
      return entryFilters.type ? categoriesForType(entryFilters.type) : categoryOptions;
    }

    function filterValueLabel(field) {
      if (field === 'category') return categoryLabel(entryFilters.category);
      return entryFilters[field] || '';
    }

    function entryDateParts() {
      const years = [...new Set(entries.map(entry => entryDay(entry).slice(0, 4)).filter(Boolean))].sort().reverse();
      const months = Array.from({length: 12}, (_, i) => pad2(i + 1));
      const maxDay = entryFilters.year && entryFilters.month ? new Date(Number(entryFilters.year), Number(entryFilters.month), 0).getDate() : 31;
      const days = Array.from({length: maxDay}, (_, i) => pad2(i + 1));
      return {years, months, days};
    }

    function syncEntryDateRange() {
      const selectedDay = String(entryFilters.day || '').includes('-') ? String(entryFilters.day).slice(8, 10) : entryFilters.day;
      entryFilters.start = '';
      entryFilters.end = '';
      if (!entryFilters.year) {
        entryFilters.month = '';
        entryFilters.day = '';
        return;
      }
      if (!entryFilters.month) {
        entryFilters.start = `${entryFilters.year}-01-01`;
        entryFilters.end = `${entryFilters.year}-12-31`;
        return;
      }
      const lastDay = pad2(new Date(Number(entryFilters.year), Number(entryFilters.month), 0).getDate());
      if (!selectedDay) {
        entryFilters.day = '';
        entryFilters.start = `${entryFilters.year}-${entryFilters.month}-01`;
        entryFilters.end = `${entryFilters.year}-${entryFilters.month}-${lastDay}`;
        return;
      }
      entryFilters.day = `${entryFilters.year}-${entryFilters.month}-${selectedDay}`;
    }

    function clearEntryFilters() {
      entryFilters = {year: '', month: '', day: '', type: '', category: '', account: '', transaction_object: '', tone: '', start: '', end: ''};
    }

    function headerFilterCell(field, label, options, attrs = '') {
      const html = field === 'category' ? categoryOptionsHtml(options, entryFilters[field], true) : optionsHtml(options, entryFilters[field], true);
      const value = filterValueLabel(field);
      return `
        <th>
          <div class="entry-head-filter ${value ? 'is-active' : ''}">
            <span class="entry-head-label">${esc(label)}<span class="entry-head-arrow">⌄</span></span>
            ${value ? `<span class="entry-head-value">${esc(value)}</span>` : ''}
            <select data-entry-filter="${field}" aria-label="${esc(label)}" ${attrs}>${html}</select>
          </div>
        </th>`;
    }

    function dateHeaderCell() {
      const {years, months, days} = entryDateParts();
      const dayPart = String(entryFilters.day || '').includes('-') ? String(entryFilters.day).slice(8, 10) : entryFilters.day;
      const dateText = entryFilters.year
        ? [entryFilters.year, entryFilters.month, dayPart].filter(Boolean).join('/')
        : '';
      return `
        <th>
          <div class="entry-head-filter entry-time-head ${dateText ? 'is-active' : ''}">
            <span class="entry-head-label">时间<span class="entry-head-arrow">⌄</span></span>
            ${dateText ? `<span class="entry-head-value">${esc(dateText)}</span>` : ''}
            <div class="entry-time-selects">
              <select data-entry-filter="year" aria-label="年">${optionsHtml(years, entryFilters.year, true)}</select>
              <select data-entry-filter="month" aria-label="月" ${entryFilters.year ? '' : 'disabled'}>${optionsHtml(months, entryFilters.month, true)}</select>
              <select data-entry-filter="day" aria-label="日" ${entryFilters.year && entryFilters.month ? '' : 'disabled'}>${optionsHtml(days, dayPart, true)}</select>
            </div>
          </div>
        </th>`;
    }

    function entryMatchesFilters(entry) {
      const day = entryDay(entry);
      if (entryFilters.day && day !== entryFilters.day) return false;
      if (entryFilters.start && day < entryFilters.start) return false;
      if (entryFilters.end && day > entryFilters.end) return false;
      if (entryFilters.type && entry.type !== entryFilters.type) return false;
      if (entryFilters.category && (entry.category || '') !== entryFilters.category) return false;
      if (entryFilters.account && (entry.account || '') !== entryFilters.account) return false;
      if (entryFilters.transaction_object && (entry.transaction_object || '') !== entryFilters.transaction_object) return false;
      if (entryFilters.tone && moneyTone(entry) !== entryFilters.tone) return false;
      return true;
    }

    function entryFilterSummary() {
      const parts = [];
      if (entryFilters.tone === 'income') parts.push('收入账单');
      if (entryFilters.tone === 'expense') parts.push('支出账单');
      if (entryFilters.start || entryFilters.end) parts.push(`${slashDate(entryFilters.start)} - ${slashDate(entryFilters.end)}`);
      if (entryFilters.day) parts.push(slashDate(entryFilters.day));
      ['type', 'category', 'account', 'transaction_object'].forEach(field => {
        if (entryFilters[field]) parts.push(field === 'category' ? categoryLabel(entryFilters[field]) : entryFilters[field]);
      });
      return parts.join(' / ');
    }

    function clearDeleteToast() {
      const toast = $('deleteToast');
      if (toast) toast.remove();
    }

    function renderDeleteToast() {
      clearDeleteToast();
      const pending = pendingDelete || pendingCategoryDelete || pendingDebtDelete || pendingAccountDelete;
      if (!pending) return;
      const toast = document.createElement('div');
      toast.id = 'deleteToast';
      toast.className = 'delete-toast';
      const labels = {
        account: `已移除账户 ${pending.row.name}`,
        category: `已移除分类 ${categoryLabel(pending.category)}`,
        debt: `已移除 ${pending.row.name}`,
        entry: '已移除 1 条账单',
      };
      const label = labels[pending.kind || 'entry'];
      toast.innerHTML = `
        <span>${esc(label)}</span>
        <button data-undo-delete>撤销(${pending.remaining}s)</button>`;
      document.body.appendChild(toast);
      toast.querySelector('[data-undo-delete]').onclick = pending.kind === 'category'
        ? undoPendingCategoryDelete
        : pending.kind === 'debt'
          ? undoPendingDebtDelete
          : pending.kind === 'account'
            ? undoPendingAccountDelete
            : undoPendingDelete;
    }

    function pendingDeleteRequest(item) {
      if ((item.kind || 'entry') === 'category') {
        return {path: '/api/category-delete', body: {type: item.type, category: item.category}};
      }
      if (item.kind === 'debt') {
        return {path: '/api/account-debt-delete', body: {id: item.row.id}};
      }
      if (item.kind === 'account') {
        return {path: '/api/account-delete', body: {name: item.row.name}};
      }
      return {path: '/api/entry-delete', body: {id: item.row.id}};
    }

    function sendPendingDelete(item, keepalive = false) {
      const request = pendingDeleteRequest(item);
      const body = JSON.stringify(request.body);
      if (keepalive) {
        const blob = new Blob([body], {type: 'application/json'});
        if (navigator.sendBeacon && navigator.sendBeacon(request.path, blob)) return Promise.resolve();
        return fetch(request.path, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body,
          keepalive: true
        }).catch(() => {});
      }
      return api(request.path, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body
      });
    }

    function takePendingDeletes() {
      const items = [pendingDelete, pendingCategoryDelete, pendingDebtDelete, pendingAccountDelete].filter(Boolean);
      pendingDelete = null;
      pendingCategoryDelete = null;
      pendingDebtDelete = null;
      pendingAccountDelete = null;
      items.forEach(item => {
        clearInterval(item.intervalId);
        clearTimeout(item.timeoutId);
      });
      clearDeleteToast();
      return items;
    }

    async function commitPendingDeletes(options = {}) {
      const items = takePendingDeletes();
      if (!items.length) return;
      try {
        await Promise.all(items.map(item => sendPendingDelete(item, Boolean(options.keepalive))));
        if (options.refreshAfter) await refresh();
      } catch (err) {
        if (options.refreshAfter) await refresh();
        if (!options.silent) alert(err.message === 'not found' ? '后端接口未加载，请重启 Dashboard 后再删除。' : err.message);
      }
    }

    async function finalizePendingDelete() {
      if (!pendingDelete) return;
      const item = pendingDelete;
      pendingDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      try {
        await api('/api/entry-delete', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({id: item.row.id})
        });
        await refresh();
      } catch (err) {
        if (!entries.some(entry => Number(entry.id) === Number(item.row.id))) {
          entries.splice(Math.min(item.index, entries.length), 0, item.row);
        }
        renderEntries();
        alert(err.message === 'not found' ? '后端接口未加载，请重启 Dashboard 后再删除。' : err.message);
      }
    }

    function undoPendingDelete() {
      if (!pendingDelete) return;
      const item = pendingDelete;
      pendingDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      if (!entries.some(entry => Number(entry.id) === Number(item.row.id))) {
        entries.splice(Math.min(item.index, entries.length), 0, item.row);
      }
      renderEntries();
    }

    function scheduleEntryDelete(id) {
      if (pendingCategoryDelete) finalizePendingCategoryDelete();
      if (pendingDebtDelete) finalizePendingDebtDelete();
      if (pendingAccountDelete) finalizePendingAccountDelete();
      if (pendingDelete) finalizePendingDelete();
      const index = entries.findIndex(entry => Number(entry.id) === Number(id));
      if (index < 0) return;
      const [row] = entries.splice(index, 1);
      if (editingEntryId === Number(id)) editingEntryId = null;
      pendingDelete = {row, index, remaining: 5, intervalId: null, timeoutId: null};
      pendingDelete.intervalId = setInterval(() => {
        if (!pendingDelete || pendingDelete.row.id !== row.id) return;
        pendingDelete.remaining -= 1;
        renderDeleteToast();
      }, 1000);
      pendingDelete.timeoutId = setTimeout(finalizePendingDelete, 5000);
      renderEntries();
      renderDeleteToast();
    }

    async function finalizePendingCategoryDelete() {
      if (!pendingCategoryDelete) return;
      const item = pendingCategoryDelete;
      pendingCategoryDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      try {
        await api('/api/category-delete', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({type: item.type, category: item.category})
        });
        await refresh();
      } catch (err) {
        renderCategoryRules();
        alert(err.message === 'not found' ? '后端接口未加载，请重启 Dashboard 后再删除。' : err.message);
      }
    }

    function undoPendingCategoryDelete() {
      if (!pendingCategoryDelete) return;
      const item = pendingCategoryDelete;
      pendingCategoryDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      renderCategoryRules();
    }

    function scheduleCategoryDelete(type, category) {
      if (pendingDelete) finalizePendingDelete();
      if (pendingDebtDelete) finalizePendingDebtDelete();
      if (pendingAccountDelete) finalizePendingAccountDelete();
      if (pendingCategoryDelete) finalizePendingCategoryDelete();
      if (editingCategoryKey === `${type}|||${category}`) editingCategoryKey = null;
      if (addingKeywordKey === `${type}|||${category}`) addingKeywordKey = null;
      pendingCategoryDelete = {kind: 'category', type, category, remaining: 5, intervalId: null, timeoutId: null};
      pendingCategoryDelete.intervalId = setInterval(() => {
        if (!pendingCategoryDelete || pendingCategoryDelete.type !== type || pendingCategoryDelete.category !== category) return;
        pendingCategoryDelete.remaining -= 1;
        renderDeleteToast();
      }, 1000);
      pendingCategoryDelete.timeoutId = setTimeout(finalizePendingCategoryDelete, 5000);
      renderCategoryRules();
      renderDeleteToast();
    }

    async function finalizePendingDebtDelete() {
      if (!pendingDebtDelete) return;
      const item = pendingDebtDelete;
      pendingDebtDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      try {
        await api('/api/account-debt-delete', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({id: item.row.id})
        });
        await refresh();
      } catch (err) {
        if (!debtBalances.some(row => Number(row.id) === Number(item.row.id))) {
          debtBalances.splice(Math.min(item.index, debtBalances.length), 0, item.row);
        }
        $('debtList').innerHTML = renderDebtBalances(debtBalances);
        bindDebtActions();
        alert(err.message === 'not found' ? '后端接口未加载，请重启 Dashboard 后再删除。' : err.message);
      }
    }

    function undoPendingDebtDelete() {
      if (!pendingDebtDelete) return;
      const item = pendingDebtDelete;
      pendingDebtDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      if (!debtBalances.some(row => Number(row.id) === Number(item.row.id))) {
        debtBalances.splice(Math.min(item.index, debtBalances.length), 0, item.row);
      }
      $('debtList').innerHTML = renderDebtBalances(debtBalances);
      bindDebtActions();
    }

    function scheduleDebtDelete(id) {
      if (pendingDelete) finalizePendingDelete();
      if (pendingCategoryDelete) finalizePendingCategoryDelete();
      if (pendingAccountDelete) finalizePendingAccountDelete();
      if (pendingDebtDelete) finalizePendingDebtDelete();
      const index = debtBalances.findIndex(row => Number(row.id) === Number(id));
      if (index < 0) return;
      const [row] = debtBalances.splice(index, 1);
      pendingDebtDelete = {kind: 'debt', row, index, remaining: 5, intervalId: null, timeoutId: null};
      pendingDebtDelete.intervalId = setInterval(() => {
        if (!pendingDebtDelete || pendingDebtDelete.row.id !== row.id) return;
        pendingDebtDelete.remaining -= 1;
        renderDeleteToast();
      }, 1000);
      pendingDebtDelete.timeoutId = setTimeout(finalizePendingDebtDelete, 5000);
      $('debtList').innerHTML = renderDebtBalances(debtBalances);
      bindDebtActions();
      renderDeleteToast();
    }

    async function finalizePendingAccountDelete() {
      if (!pendingAccountDelete) return;
      const item = pendingAccountDelete;
      pendingAccountDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      try {
        await api('/api/account-delete', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({name: item.row.name})
        });
        await refresh();
      } catch (err) {
        if (!accountBalances.some(row => row.name === item.row.name)) {
          accountBalances.splice(Math.min(item.index, accountBalances.length), 0, item.row);
        }
        $('assetList').innerHTML = renderAccountBalances(accountBalances);
        bindAccountActions();
        alert(err.message === 'cannot delete account with existing entries'
          ? '该账户已有账单或待确认记录，不能删除。'
          : err.message === 'not found'
            ? '后端接口未加载，请重启 Dashboard 后再删除。'
            : err.message);
      }
    }

    function undoPendingAccountDelete() {
      if (!pendingAccountDelete) return;
      const item = pendingAccountDelete;
      pendingAccountDelete = null;
      clearInterval(item.intervalId);
      clearTimeout(item.timeoutId);
      clearDeleteToast();
      if (!accountBalances.some(row => row.name === item.row.name)) {
        accountBalances.splice(Math.min(item.index, accountBalances.length), 0, item.row);
      }
      $('assetList').innerHTML = renderAccountBalances(accountBalances);
      bindAccountActions();
    }

    function scheduleAccountDelete(name) {
      if (pendingDelete) finalizePendingDelete();
      if (pendingCategoryDelete) finalizePendingCategoryDelete();
      if (pendingDebtDelete) finalizePendingDebtDelete();
      if (pendingAccountDelete) finalizePendingAccountDelete();
      const index = accountBalances.findIndex(row => row.name === name);
      if (index < 0) return;
      const [row] = accountBalances.splice(index, 1);
      if (editingAccountName === name) editingAccountName = null;
      if (editingAccountBalanceName === name) editingAccountBalanceName = null;
      pendingAccountDelete = {kind: 'account', row, index, remaining: 5, intervalId: null, timeoutId: null};
      pendingAccountDelete.intervalId = setInterval(() => {
        if (!pendingAccountDelete || pendingAccountDelete.row.name !== row.name) return;
        pendingAccountDelete.remaining -= 1;
        renderDeleteToast();
      }, 1000);
      pendingAccountDelete.timeoutId = setTimeout(finalizePendingAccountDelete, 5000);
      $('assetList').innerHTML = renderAccountBalances(accountBalances);
      bindAccountActions();
      renderDeleteToast();
    }

    function toneColor(tone) {
      const inverted = document.body.dataset.colorInverted === 'true';
      if (tone === 'income') return cssVar(inverted ? '--green' : '--red');
      if (tone === 'expense') return cssVar(inverted ? '--red' : '--green');
      return cssVar('--ink');
    }

    const pad2 = (n) => String(n).padStart(2, '0');
    const ymd = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    const slashDate = (value) => value ? value.replaceAll('-', '/') : '--/--/--';
    const entryDay = (entry) => String(entry.transaction_time || '').slice(0, 10);
    const parseDay = (value) => {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    };
    const addDays = (date, days) => {
      const next = new Date(date);
      next.setDate(next.getDate() + days);
      return next;
    };

    function table(rows, columns) {
      if (!rows.length) return '<div class="muted">暂无数据</div>';
      return '<table><thead><tr>' + columns.map(c => `<th>${c[1]}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + columns.map(c => {
          const cls = c[3] ? ` class="${esc(c[3](r[c[0]], r))}"` : '';
          return `<td${cls}>${esc(c[2] ? c[2](r[c[0]], r) : r[c[0]])}</td>`;
        }).join('') + '</tr>').join('') +
        '</tbody></table>';
    }

    function renderAccountBalances(rows) {
      const body = rows.length ? rows.map(row => {
        const value = row.computed_balance_cents ?? row.current_balance_cents;
        const isNameEditing = editingAccountName === row.name;
        const isBalanceEditing = editingAccountBalanceName === row.name;
        return `
          <tr>
            <td data-label="账户">
              <div class="account-name-cell">
                ${isNameEditing
                  ? `<input class="account-name-input" type="text" value="${esc(row.name)}" aria-label="账户名" data-account-name-input="${esc(row.name)}">`
                  : `<span>${esc(row.name)}</span>
                    <button type="button" class="icon-button" title="编辑账户名" aria-label="编辑账户名" data-account-name-edit="${esc(row.name)}">✎</button>`}
              </div>
            </td>
            <td class="money-cell debt-money" data-label="余额">
              <div class="account-balance-cell">
                ${isBalanceEditing
                  ? `<input class="account-balance-input" type="text" inputmode="decimal" value="${esc(money(value))}" aria-label="账户余额" data-account-balance-input="${esc(row.name)}">`
                  : `<span>${esc(balanceMoney(value))}</span>
                    <button type="button" class="icon-button" title="编辑余额" aria-label="编辑余额" data-account-balance-edit="${esc(row.name)}">✎</button>`}
              </div>
            </td>
            <td data-label="币种">${esc(row.currency)}</td>
            <td class="account-actions" data-label="操作"><button type="button" class="text-delete" data-account-delete="${esc(row.name)}">删除</button></td>
          </tr>
        `;
      }).join('') : '<tr><td class="entry-empty" colspan="4">暂无数据</td></tr>';
      return `<table class="account-table">
        <thead><tr><th>账户</th><th>余额</th><th>币种</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="account-add-form">
        <input id="newAccountName" type="text" placeholder="新增账户名称">
        <input id="newAccountBalance" type="text" inputmode="decimal" placeholder="初始余额">
        <button type="button" class="primary" id="addAccount">新增账户</button>
      </div>`;
    }

    async function saveAccountName(input, oldName) {
      if (input.dataset.saving === 'true') return;
      const newName = input.value.trim();
      editingAccountName = null;
      if (!newName || newName === oldName) {
        $('assetList').innerHTML = renderAccountBalances(accountBalances);
        bindAccountActions();
        return;
      }
      input.dataset.saving = 'true';
      await api('/api/account-rename', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({old_name: oldName, new_name: newName})
      });
      await refresh();
    }

    async function saveAccountBalance(input, name) {
      if (input.dataset.saving === 'true') return;
      const actual = input.value.trim();
      editingAccountBalanceName = null;
      if (!actual) {
        $('assetList').innerHTML = renderAccountBalances(accountBalances);
        bindAccountActions();
        return;
      }
      input.dataset.saving = 'true';
      await api('/api/correct-balance', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({account: name, actual})
      });
      await refresh();
    }

    async function addAccountFromAssets() {
      const name = $('newAccountName').value.trim();
      const balance = $('newAccountBalance').value.trim();
      if (!name) return;
      const endpoint = balance ? '/api/account-set' : '/api/account-add';
      const payload = balance ? {name, balance} : {name};
      await api(endpoint, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload)
      });
      $('newAccountName').value = '';
      $('newAccountBalance').value = '';
      await refresh();
    }

    function bindAccountActions() {
      document.querySelectorAll('[data-account-name-edit]').forEach(btn => {
        btn.onclick = () => {
          editingAccountName = btn.dataset.accountNameEdit;
          editingAccountBalanceName = null;
          $('assetList').innerHTML = renderAccountBalances(accountBalances);
          bindAccountActions();
          document.querySelector(`[data-account-name-input="${CSS.escape(editingAccountName)}"]`)?.focus();
        };
      });
      document.querySelectorAll('[data-account-name-input]').forEach(input => {
        input.onkeydown = event => {
          if (event.key === 'Enter') saveAccountName(input, input.dataset.accountNameInput).catch(err => alert(err.message));
          if (event.key === 'Escape') {
            editingAccountName = null;
            $('assetList').innerHTML = renderAccountBalances(accountBalances);
            bindAccountActions();
          }
        };
        input.onblur = () => saveAccountName(input, input.dataset.accountNameInput).catch(err => {
          alert(err.message === 'account already exists' ? '账户名已存在。' : err.message);
          $('assetList').innerHTML = renderAccountBalances(accountBalances);
          bindAccountActions();
        });
      });
      document.querySelectorAll('[data-account-balance-edit]').forEach(btn => {
        btn.onclick = () => {
          editingAccountBalanceName = btn.dataset.accountBalanceEdit;
          editingAccountName = null;
          $('assetList').innerHTML = renderAccountBalances(accountBalances);
          bindAccountActions();
          document.querySelector(`[data-account-balance-input="${CSS.escape(editingAccountBalanceName)}"]`)?.focus();
        };
      });
      document.querySelectorAll('[data-account-balance-input]').forEach(input => {
        input.onkeydown = event => {
          if (event.key === 'Enter') saveAccountBalance(input, input.dataset.accountBalanceInput).catch(err => alert(err.message));
          if (event.key === 'Escape') {
            editingAccountBalanceName = null;
            $('assetList').innerHTML = renderAccountBalances(accountBalances);
            bindAccountActions();
          }
        };
        input.onblur = () => saveAccountBalance(input, input.dataset.accountBalanceInput).catch(err => {
          alert(err.message);
          $('assetList').innerHTML = renderAccountBalances(accountBalances);
          bindAccountActions();
        });
      });
      document.querySelectorAll('[data-account-delete]').forEach(btn => {
        btn.onclick = () => scheduleAccountDelete(btn.dataset.accountDelete);
      });
      if ($('addAccount')) $('addAccount').onclick = () => addAccountFromAssets().catch(err => alert(err.message));
      ['newAccountName', 'newAccountBalance'].forEach(id => {
        if ($(id)) $(id).onkeydown = event => {
          if (event.key === 'Enter') addAccountFromAssets().catch(err => alert(err.message));
        };
      });
    }

    function renderDebtBalances(rows) {
      if (!rows.length) return '<div class="muted">暂无数据</div>';
      return `<table class="debt-table">
        <thead><tr><th>交易对象</th><th>应收</th><th>应付</th><th></th></tr></thead>
        <tbody>${rows.map(row => `
          <tr>
            <td>${esc(row.name)}</td>
            <td class="money-cell debt-money">${esc(money(row.receivable_cents))}</td>
            <td class="money-cell debt-money">${esc(money(row.payable_cents))}</td>
            <td class="debt-actions"><button class="text-delete" data-debt-delete="${esc(row.id)}">删除</button></td>
          </tr>
        `).join('')}</tbody>
      </table>`;
    }

    function bindDebtActions() {
      document.querySelectorAll('[data-debt-delete]').forEach(btn => {
        btn.onclick = () => scheduleDebtDelete(Number(btn.dataset.debtDelete));
      });
    }


    function cssVar(name) {
      return getComputedStyle(document.body).getPropertyValue(name).trim();
    }






    /* 单调三次插值：控制点按相邻斜率分配，不会在数据点处强行拉平。
       原来的中点贝塞尔让每个点都变成水平切线，孤立的日峰值会被磨成尖刺。 */
    function drawSmoothLine(ctx, points) {
      ctx.beginPath();
      if (!points.length) return;
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i += 1) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        // Catmull-Rom 转贝塞尔，张力 0.28 避免过冲
        const k = 0.28;
        const c1x = p1.x + (p2.x - p0.x) * k;
        const c1y = p1.y + (p2.y - p0.y) * k;
        const c2x = p2.x - (p3.x - p1.x) * k;
        const c2y = p2.y - (p3.y - p1.y) * k;

        // 限制控制点不要越过相邻点的值域，防止尖峰被拉出数据范围
        const lo = Math.min(p1.y, p2.y);
        const hi = Math.max(p1.y, p2.y);
        ctx.bezierCurveTo(
          c1x, Math.min(Math.max(c1y, lo), hi),
          c2x, Math.min(Math.max(c2y, lo), hi),
          p2.x, p2.y,
        );
      }
    }


    function colorMixPanel() {
      return document.body.dataset.theme === 'dark' ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.42)';
    }

    const pieColors = ['#0e6f5c', '#a83f2d', '#2459a6', '#8a5a16', '#6f4aa8', '#18704b', '#b45c38', '#557a2f', '#8f3f67', '#5f6f7a'];




    /* 图例式标签：引线在窄屏上必然互相压叠，改成饼图下方的色块列表，
       顺序按占比降序，超过 6 项时合并成「其他」 */






    function initPeriodDefaults() {
      if (periodInitialized) {
        clampCycleIndex();
        return;
      }
      const days = entries.map(entryDay).filter(Boolean).sort();
      const today = ymd(new Date());
      customStart = customStart || days[0] || today;
      customEnd = customEnd || today;
      clampCycleIndex();
      periodInitialized = true;
    }

    function weekStart(date) {
      const start = new Date(date);
      const day = start.getDay() || 7;
      start.setDate(start.getDate() - day + 1);
      return start;
    }

    function buildCycles() {
      const today = new Date();
      if (cycleMode === 'quarter') {
        const currentQuarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
        const cycles = [];
        for (let i = 0; i < 40; i += 1) {
          const startDate = new Date(today.getFullYear(), currentQuarterStartMonth - i * 3, 1);
          const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 3, 0);
          const quarter = Math.floor(startDate.getMonth() / 3) + 1;
          cycles.push({label: `${startDate.getFullYear()} Q${quarter}`, start: ymd(startDate), end: ymd(endDate)});
        }
        return cycles;
      }
      if (cycleMode === 'week') {
        const cycles = [];
        const cursor = weekStart(today);
        for (let i = 0; i < 60; i += 1) {
          const start = addDays(cursor, -7 * i);
          const end = addDays(start, 6);
          cycles.push({label: `${ymd(start).replaceAll('-', '/')} - ${ymd(end).replaceAll('-', '/')}`, start: ymd(start), end: ymd(end)});
        }
        return cycles;
      }
      const cycles = [];
      for (let i = 0; i < 90; i += 1) {
        const day = ymd(addDays(today, -i));
        cycles.push({label: day.replaceAll('-', '/'), start: day, end: day});
      }
      return cycles;
    }

    function clampCycleIndex() {
      const cycles = buildCycles();
      selectedCycleIndex = Math.min(selectedCycleIndex, Math.max(cycles.length - 1, 0));
    }

    function currentRange() {
      if (periodMode === 'all') return {start: customStart, end: customEnd};
      if (periodMode === 'year') {
        const year = new Date().getFullYear() + yearOffset;
        return {start: `${year}-01-01`, end: `${year}-12-31`};
      }
      if (periodMode === 'month') {
        const now = new Date();
        const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        const month = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
        return {start: `${month}-01`, end: ymd(new Date(date.getFullYear(), date.getMonth() + 1, 0))};
      }
      const cycles = buildCycles();
      return cycles[selectedCycleIndex] || {start: customStart, end: customEnd};
    }

    function entriesInRange(range) {
      return entries.filter(entry => {
        const day = entryDay(entry);
        return day && day >= range.start && day <= range.end;
      });
    }

    function daysInRange(range) {
      const start = parseDay(range.start);
      const end = parseDay(range.end);
      if (!start || !end || start > end) return [];
      const days = [];
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        days.push(ymd(cursor));
      }
      return days;
    }

    function aggregateRange(range) {
      const scoped = entriesInRange(range);
      const reportable = scoped.filter(reportableEntry);
      const income = reportable.filter(e => increaseTypes.has(e.type)).reduce((sum, e) => sum + Number(e.amount_cents || 0), 0);
      const expense = reportable.filter(e => decreaseTypes.has(e.type)).reduce((sum, e) => sum + Number(e.amount_cents || 0), 0);
      const expenseCategoryMap = new Map();
      reportable.filter(e => decreaseTypes.has(e.type)).forEach(e => {
        const rawCategory = e.category || '未分类';
        const key = expenseCategoryLevel === 'minor' ? rawCategory : majorCategory(rawCategory);
        expenseCategoryMap.set(key, (expenseCategoryMap.get(key) || 0) + Number(e.amount_cents || 0));
      });
      const incomeCategoryMap = new Map();
      reportable.filter(e => increaseTypes.has(e.type)).forEach(e => {
        const key = e.category || '未分类';
        incomeCategoryMap.set(key, (incomeCategoryMap.get(key) || 0) + Number(e.amount_cents || 0));
      });
      const byDay = new Map(daysInRange(range).map(day => [day, {day, income_cents: 0, expense_cents: 0}]));
      reportable.forEach(e => {
        const day = entryDay(e);
        if (!day) return;
        const current = byDay.get(day) || {day, income_cents: 0, expense_cents: 0};
        if (increaseTypes.has(e.type)) current.income_cents += Number(e.amount_cents || 0);
        if (decreaseTypes.has(e.type)) current.expense_cents += Number(e.amount_cents || 0);
        byDay.set(day, current);
      });
      return {
        scoped,
        count: reportable.length,
        income,
        expense,
        expenseCategories: [...expenseCategoryMap.entries()].map(([category, amount_cents]) => ({category, amount_cents})).sort((a, b) => b.amount_cents - a.amount_cents),
        incomeCategories: [...incomeCategoryMap.entries()].map(([category, amount_cents]) => ({category, amount_cents})).sort((a, b) => b.amount_cents - a.amount_cents),
        trend: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      };
    }

    /* ═══ 首页三块：装订脊（月份趋势）、连续流水、汇总面板 ═══ */

    const SPINE_MONTHS = 6;
    const LEGEND_TOP = 5;

    function fmtMoney(cents) {
      const value = Math.abs(Number(cents || 0)) / 100;
      return value.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }

    function monthKeyOf(dateStr) { return (dateStr || '').slice(0, 7); }

    function shiftMonthKey(key, delta) {
      const [year, month] = key.split('-').map(Number);
      const date = new Date(year, month - 1 + delta, 1);
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    }

    function monthExpenseTotals() {
      const map = new Map();
      entries.filter(reportableEntry).forEach(entry => {
        if (!decreaseTypes.has(entry.type)) return;
        const key = monthKeyOf(entryDay(entry));
        if (!key) return;
        map.set(key, (map.get(key) || 0) + Number(entry.amount_cents || 0));
      });
      return map;
    }

    /* 每个月一行，行背景的宽度就是该月支出：导航本身即 6 个月趋势 */
    function renderSpine(range) {
      const box = $('spineMonths');
      if (!box) return;
      const anchor = monthKeyOf(range.end) || monthKeyOf(ymd(new Date()));
      const totals = monthExpenseTotals();
      // 只列有支出的月份，外加当前正在看的月份：
      // 库里只有一个月数据时，摆 6 个「—」既不是趋势，也只会把人带进空页面。
      const withData = [...totals.keys()].filter(key => totals.get(key) > 0).sort().reverse().slice(0, SPINE_MONTHS);
      const keys = [...new Set([anchor, ...withData])].sort().reverse().slice(0, SPINE_MONTHS + 1);
      const max = Math.max(1, ...keys.map(key => totals.get(key) || 0));
      box.innerHTML = keys.map(key => {
        const [year, month] = key.split('-').map(Number);
        const value = totals.get(key) || 0;
        const width = Math.round((value / max) * 100);
        const on = key === anchor ? ' on' : '';
        return `<button type="button" class="spine-month${on}" data-month="${key}" title="${year} 年 ${month} 月支出 ${fmtMoney(value)}">` +
          `<span class="bar" style="--w:${width}%"></span>` +
          `<span class="m">${month} 月</span>` +
          `<span class="v">${value ? '-' + fmtMoney(value) : '—'}</span>` +
          `</button>`;
      }).join('');
      box.querySelectorAll('[data-month]').forEach(btn => {
        btn.onclick = () => selectMonth(btn.dataset.month);
      });
    }

    function syncPanel() {
      const app = $('app');
      if (!app) return;
      app.dataset.mode = panelMode;
      app.dataset.panel = (panelMode === 'split' && app.dataset.view === 'home') ? 'on' : 'off';
      document.querySelectorAll('#modeSeg button').forEach(btn => {
        btn.classList.toggle('on', btn.dataset.mode === panelMode);
      });
    }

    function selectMonth(key) {
      const now = new Date();
      const [year, month] = key.split('-').map(Number);
      monthOffset = (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
      periodMode = 'month';
      updatePeriodVisibility();
      updateOverview();
      if ($('home').classList.contains('hidden')) switchView('home');
    }

    /* 流水：按日分组，跨月处插入当月合计；中性交易保留但用弱化色 */
    function renderFlow(range) {
      const box = $('flow');
      if (!box) return;
      const scoped = entriesInRange(range)
        .slice()
        .sort((a, b) => String(b.transaction_time || '').localeCompare(String(a.transaction_time || '')));
      if (!scoped.length) {
        box.innerHTML = '<div class="flow-empty">这段时间没有账目</div>';
        return;
      }
      const days = new Map();
      scoped.forEach(entry => {
        const day = entryDay(entry);
        if (!day) return;
        if (!days.has(day)) days.set(day, []);
        days.get(day).push(entry);
      });
      const orderedDays = [...days.keys()].sort().reverse();
      const html = [];
      let cursorMonth = '';
      orderedDays.forEach((day, index) => {
        const month = monthKeyOf(day);
        if (cursorMonth && month !== cursorMonth) html.push(monthBreakHtml(cursorMonth));
        cursorMonth = month;
        const dayRows = days.get(day);
        const net = dayRows.reduce((sum, entry) => sum + netCents(entry), 0);
        const sumClass = net < 0 ? 'expense' : net > 0 ? 'income' : '';
        const sumText = net === 0 ? '0.00' : (net < 0 ? '-' : '+') + fmtMoney(Math.abs(net));
        html.push(`<section class="flow-day"><div class="flow-day-head"><b>${esc(dayLabel(day))}</b>` +
          `<span class="sum ${sumClass}">${sumText}</span></div>`);
        dayRows.forEach(entry => {
          const tone = moneyTone(entry);
          const cls = tone === 'income' ? 'income' : tone === 'expense' ? 'expense' : 'neutral-money';
          const base = entry.category ? categoryLabel(entry.category) : '未分类';
          // 中性交易不计收支：金额不带正负号，副标题里写明，避免被读成收入
          const category = tone === 'neutral' ? `${base} · 不计收支` : base;
          const amountText = tone === 'neutral'
            ? fmtMoney(entry.amount_cents)
            : signedMoney(entry.amount_cents, tone);
          const time = String(entry.transaction_time || '').slice(11, 16);
          html.push(`<div class="flow-row">` +
            `<span class="t">${esc(time || '--:--')}</span>` +
            `<span class="what"><b>${esc(entry.transaction_object || '未命名交易')}</b><span>${esc(category)}</span></span>` +
            `<span class="v ${cls}">${esc(amountText)}</span>` +
            `</div>`);
        });
        html.push('</section>');
        if (index === orderedDays.length - 1) html.push(monthBreakHtml(month));
      });
      box.innerHTML = html.join('');
    }

    function monthBreakHtml(monthKey) {
      const [year, month] = monthKey.split('-').map(Number);
      const rows = entries.filter(entry => monthKeyOf(entryDay(entry)) === monthKey && reportableEntry(entry));
      const net = rows.reduce((sum, entry) => sum + netCents(entry), 0);
      const text = net === 0 ? '0.00' : (net < 0 ? '-' : '+') + fmtMoney(Math.abs(net));
      return `<div class="flow-month-break"><b>${year} 年 ${month} 月合计</b>` +
        `<span class="lbl">${rows.length} 笔</span><span class="big">${text}</span></div>`;
    }

    function netCents(entry) {
      if (!reportableEntry(entry)) return 0;
      const amount = Number(entry.amount_cents || 0);
      if (increaseTypes.has(entry.type)) return amount;
      if (decreaseTypes.has(entry.type)) return -amount;
      return 0;
    }

    function dayLabel(day) {
      const date = parseDay(day);
      if (!date) return day;
      const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
      return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${week}`;
    }

    /* 汇总面板：结余、收支笔数、支出结构（环形 + 图例） */
    /* 环形图的扇区数据：conic-gradient 没有 DOM 分区，命中检测按角度自己算 */
    let donutSlices = [];

    function renderPanel(analysis) {
      const rows = analysis.expenseCategories;
      const total = analysis.expense;
      const ring = $('donutRing');
      const legend = $('panelLegend');
      if (!total) {
        // 空状态别装成「0.00」：那看起来像数据没加载出来，而不是确实没有支出
        $('donutTotal').textContent = '—';
        ring.style.background = 'conic-gradient(var(--line) 0 100%)';
        legend.innerHTML = '<div class="empty">这段区间没有支出记录</div>';
        donutSlices = [];
        hideDonutTip();
        return;
      }
      const items = rows.slice(0, LEGEND_TOP).map((row, index) => ({
        name: categoryLabel(row.category || '未分类'),
        value: Number(row.amount_cents || 0),
        tone: `var(--b${index + 1})`,
      }));
      if (rows.length > LEGEND_TOP) {
        const rest = rows.slice(LEGEND_TOP).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
        items.push({name: `其他 ${rows.length - LEGEND_TOP} 项`, value: rest, tone: 'var(--line-strong)'});
      }
      $('donutTotal').textContent = fmtMoney(total);
      let cursor = 0;
      const stops = items.map(item => {
        const share = (item.value / total) * 100;
        const stop = `${item.tone} ${cursor.toFixed(2)}% ${(cursor + share).toFixed(2)}%`;
        cursor += share;
        return stop;
      });
      ring.style.background = `conic-gradient(${stops.join(', ')})`;

      let from = 0;
      donutSlices = items.map(item => {
        const share = item.value / total;
        const slice = {name: item.name, value: item.value, share, from, to: from + share, tone: item.tone};
        from += share;
        return slice;
      });

      legend.innerHTML = items.map(item => {
        const share = ((item.value / total) * 100).toFixed(1);
        return `<div class="legend-row"><i style="background:${item.tone}"></i>` +
          `<span class="name" title="${esc(item.name)}">${esc(item.name)}</span>` +
          `<span class="p">${share}%</span>` +
          `<span class="v">${fmtMoney(item.value)}</span></div>`;
      }).join('');

      // 图例行也能反向点亮扇区：指针在右栏时不必再回环上去找
      legend.querySelectorAll('.legend-row').forEach((row, index) => {
        row.onmouseenter = () => {
          const tip = $('donutTip');
          const box = $('panelDonut');
          const slice = donutSlices[index];
          if (!tip || !box || !slice) return;
          const rect = box.getBoundingClientRect();
          tip.innerHTML = `<b>${esc(slice.name)}</b>` +
            `<span class="num">${(slice.share * 100).toFixed(1)}%　${fmtMoney(slice.value)}</span>`;
          tip.classList.remove('hidden');
          tip.style.left = `${Math.round(rect.width / 2 - 46)}px`;
          tip.style.top = '2px';
          box.classList.add('hot');
          row.classList.add('active');
        };
        row.onmouseleave = hideDonutTip;
      });
    }

    function hideDonutTip() {
      const tip = $('donutTip');
      const box = $('panelDonut');
      if (tip) tip.classList.add('hidden');
      if (box) box.classList.remove('hot');
      document.querySelectorAll('#panelLegend .legend-row').forEach(row => row.classList.remove('active'));
    }

    function showDonutTip(slice, index, clientX, clientY) {
      const tip = $('donutTip');
      const box = $('panelDonut');
      if (!tip || !box) return;
      const rect = box.getBoundingClientRect();
      tip.innerHTML = `<b>${esc(slice.name)}</b>` +
        `<span class="num">${(slice.share * 100).toFixed(1)}%　${fmtMoney(slice.value)}</span>`;
      tip.classList.remove('hidden');
      box.classList.add('hot');
      // 气泡贴在指针左上方，避开环心那个合计数字
      const width = tip.offsetWidth || 90;
      const height = tip.offsetHeight || 40;
      let x = clientX - rect.left - width - 12;
      if (x < 4) x = clientX - rect.left + 14;
      let y = clientY - rect.top - height - 8;
      if (y < 2) y = clientY - rect.top + 12;
      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(y)}px`;
      tip.style.transform = 'none';
      document.querySelectorAll('#panelLegend .legend-row').forEach((row, i) => {
        row.classList.toggle('active', i === index);
      });
    }

    /* 从指针位置反算落在哪个扇区：conic-gradient 从 12 点开始顺时针 */
    function donutSliceAt(event) {
      const ring = $('donutRing');
      if (!ring || !donutSlices.length) return null;
      const rect = ring.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      const distance = Math.hypot(dx, dy);
      const outer = rect.width / 2;
      const inner = outer * 0.55;   // 与 CSS 的 mask 半径一致
      if (distance < inner || distance > outer) return null;
      let angle = Math.atan2(dy, dx) + Math.PI / 2;   // 12 点方向为 0
      if (angle < 0) angle += Math.PI * 2;
      const position = angle / (Math.PI * 2);
      const index = donutSlices.findIndex(slice => position >= slice.from && position < slice.to);
      return index === -1 ? null : {slice: donutSlices[index], index};
    }

    function bindDonutHover() {
      const box = $('panelDonut');
      if (!box || box.dataset.bound) return;
      box.dataset.bound = '1';
      box.addEventListener('mousemove', (event) => {
        const hit = donutSliceAt(event);
        if (!hit) { hideDonutTip(); return; }
        showDonutTip(hit.slice, hit.index, event.clientX, event.clientY);
      });
      box.addEventListener('mouseleave', hideDonutTip);
      // 触控：点一下也给出同样的信息
      box.addEventListener('touchstart', (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        const hit = donutSliceAt({clientX: touch.clientX, clientY: touch.clientY});
        if (hit) showDonutTip(hit.slice, hit.index, touch.clientX, touch.clientY);
      }, {passive: true});
      box.addEventListener('touchend', () => setTimeout(hideDonutTip, 2200));
    }

    function updatePeriodVisibility() {
      $('moreControls').classList.toggle('hidden', periodMode !== 'more');
      $('prevCycle').classList.toggle('hidden', !['year', 'month', 'more'].includes(periodMode));
      $('nextCycle').classList.toggle('hidden', !['year', 'month', 'more'].includes(periodMode));
      document.querySelectorAll('[data-period-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.periodMode === periodMode));
      document.querySelectorAll('[data-cycle]').forEach(btn => btn.classList.toggle('active', btn.dataset.cycle === cycleMode));
    }

    function updateOverview() {
      if (!summaryData) return;
      clampCycleIndex();
      updatePeriodVisibility();
      document.querySelectorAll('[data-expense-category-level]').forEach(btn => btn.classList.toggle('active', btn.dataset.expenseCategoryLevel === expenseCategoryLevel));
      const range = currentRange();
      const analysis = aggregateRange(range);
      $('rangeStartText').textContent = slashDate(range.start);
      $('rangeEndText').textContent = slashDate(range.end);
      const net = analysis.income - analysis.expense;
      $('mIncome').textContent = fmtMoney(analysis.income);
      $('mExpense').textContent = fmtMoney(analysis.expense);
      $('mBalance').textContent = (net < 0 ? '-' : '') + fmtMoney(Math.abs(net));
      $('mCount').textContent = String(analysis.count);
      $('mPending').textContent = summaryData.unconfirmed_count;
      $('pendingNavBadge').textContent = summaryData.unconfirmed_count;
      $('pendingNavBadge').classList.toggle('hidden', Number(summaryData.unconfirmed_count || 0) === 0);
      renderSpine(range);
      renderFlow(range);
      renderPanel(analysis);
    }

    function activePickerValue() {
      const range = currentRange();
      return activeDateTarget === 'start' ? range.start : range.end;
    }

    function renderDatePicker() {
      const yearSelect = $('datePickerYear');
      const monthSelect = $('datePickerMonth');
      const selectedValue = activePickerValue();
      const selected = selectedValue ? parseDay(selectedValue) : new Date();
      const currentYear = new Date().getFullYear();
      const minYear = Math.min(currentYear - 10, selected.getFullYear() - 5);
      const maxYear = Math.max(currentYear + 5, selected.getFullYear() + 5);
      yearSelect.innerHTML = Array.from({length: maxYear - minYear + 1}, (_, i) => minYear + i)
        .map(year => `<option value="${year}">${year}年</option>`).join('');
      monthSelect.innerHTML = Array.from({length: 12}, (_, i) => i)
        .map(month => `<option value="${month}">${month + 1}月</option>`).join('');
      yearSelect.value = String(pickerMonth.getFullYear());
      monthSelect.value = String(pickerMonth.getMonth());

      const first = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1);
      const gridStart = addDays(first, -(first.getDay() || 7) + 1);
      const cells = [];
      for (let i = 0; i < 42; i += 1) {
        const day = addDays(gridStart, i);
        const value = ymd(day);
        const classes = [
          day.getMonth() !== pickerMonth.getMonth() ? 'outside' : '',
          value === selectedValue ? 'selected' : '',
        ].filter(Boolean).join(' ');
        cells.push(`<button class="${classes}" data-date="${value}">${day.getDate()}</button>`);
      }
      $('datePickerGrid').innerHTML = cells.join('');
    }

    function openDatePicker(target, trigger) {
      activeDateTarget = target;
      const value = activePickerValue();
      pickerMonth = value ? parseDay(value) : new Date();
      renderDatePicker();
      const picker = $('datePicker');
      const panelRect = $('periodPanel').getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      picker.style.left = `${Math.max(0, triggerRect.left - panelRect.left)}px`;
      picker.style.top = `${triggerRect.bottom - panelRect.top + 8}px`;
      picker.classList.remove('hidden');
    }

    function closeDatePicker() {
      $('datePicker').classList.add('hidden');
      activeDateTarget = null;
    }

    // 确认/跳过之后只需要「待确认列表 + 看板数字」。
    // 全量 refresh() 要打 9 个接口并重渲染账单、分类规则、账户，
    // 在隧道延迟下会明显卡顿，所以单独走一条轻量路径。
    async function refreshAfterConfirm() {
      const [summary, pending] = await Promise.all([
        api('/api/summary'),
        api('/api/unconfirmed'),
      ]);
      summaryData = summary;
      const summaryAccounts = summary.account_balances || summary.accounts || [];
      accountBalances = pendingAccountDelete
        ? summaryAccounts.filter(row => row.name !== pendingAccountDelete.row.name)
        : summaryAccounts;
      pendingItems = orderPendingItems(pending.map(item => ({
        ...item,
        ui_id: `${item.source || 'unconfirmed'}:${item.id}`
      })));
      updateOverview();
      renderPending();
    }

    async function refresh() {
      const [summary, entryData, pending, cats, tree, accounts, accountFilters, debts, rules] = await Promise.all([
        api('/api/summary'), api('/api/entries-all'), api('/api/unconfirmed'), api('/api/categories'), api('/api/category-tree'), api('/api/account-names'), api('/api/account-filter-names'), api('/api/account-debts'), api('/api/keyword-rules')
      ]);
      entries = pendingDelete ? entryData.filter(entry => Number(entry.id) !== Number(pendingDelete.row.id)) : entryData;
      const summaryAccounts = summary.account_balances || summary.accounts || [];
      accountBalances = pendingAccountDelete ? summaryAccounts.filter(row => row.name !== pendingAccountDelete.row.name) : summaryAccounts;
      debtBalances = pendingDebtDelete ? debts.filter(row => Number(row.id) !== Number(pendingDebtDelete.row.id)) : debts;
      pendingItems = orderPendingItems(pending.map(item => ({
        ...item,
        ui_id: `${item.source || 'unconfirmed'}:${item.id}`
      })));
      categoryOptions = cats;
      categoryTree = tree;
      entryTypes = Object.keys(categoryTree);
      if (entryFilters.type && !entryTypes.includes(entryFilters.type)) {
        entryFilters.type = '';
        entryFilters.category = '';
      }
      if (entryFilters.category && !categoryOptions.includes(entryFilters.category)) entryFilters.category = '';
      if (entryFilters.type && entryFilters.category && !categoriesForType(entryFilters.type).includes(entryFilters.category)) entryFilters.category = '';
      accountOptions = accounts;
      accountFilterOptions = accountFilters;
      keywordRules = rules;
      summaryData = summary;
      initPeriodDefaults();
      $('assetList').innerHTML = renderAccountBalances(accountBalances);
      $('debtList').innerHTML = renderDebtBalances(debtBalances);
      bindAccountActions();
      bindDebtActions();
      renderQuickFormOptions();
      if (!$('fTime').value) $('fTime').value = nowDatetimeLocal();
      renderEntries();
      updateOverview();
      renderEmptyGuide();
      renderPending();
      renderCategoryRules();
    }

    function renderEmptyGuide() {
      const guide = $("emptyGuide");
      if (!guide) return;
      const empty = !entries || entries.length === 0;
      guide.classList.toggle("hidden", !empty);
      const button = $("emptyGoImport");
      if (button && !button.dataset.bound) {
        button.dataset.bound = "1";
        button.onclick = () => switchView("import");
      }
    }

    function renderEntries() {
      const q = $('search').value.trim();
      const searched = q ? entries.filter(e => JSON.stringify(e).includes(q)) : entries;
      const filtered = searched.filter(entryMatchesFilters);
      const pageSize = entryPageSize === 'all' ? filtered.length || 1 : Number(entryPageSize);
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      entryPage = Math.min(Math.max(1, entryPage), totalPages);
      const start = (entryPage - 1) * pageSize;
      const pageRows = filtered.slice(start, start + pageSize);
      const shownStart = filtered.length ? start + 1 : 0;
      const shownEnd = Math.min(start + pageSize, filtered.length);
      const pageSizeOptions = ['10', '20', '50', '100', '200', '500', 'all'];
      const controls = `
        <div class="entry-controls">
          <div class="muted">共 ${filtered.length} 条，当前 ${shownStart}-${shownEnd} 条${entryFilterSummary() ? ` · ${esc(entryFilterSummary())}` : ''}</div>
          <div class="entry-pager">
            <button id="entryClearFilters" ${entryFilterSummary() ? '' : 'disabled'}>清除筛选</button>
            <label>每页
              <select id="entryPageSize">
                ${pageSizeOptions.map(value => `<option value="${value}" ${value === entryPageSize ? 'selected' : ''}>${value === 'all' ? '全部' : value}</option>`).join('')}
              </select>
            </label>
            <button class="secondary" id="entryPrev" ${entryPage <= 1 ? 'disabled' : ''}>上一页</button>
            <span>${entryPage} / ${totalPages}</span>
            <button class="secondary" id="entryNext" ${entryPage >= totalPages ? 'disabled' : ''}>下一页</button>
          </div>
        </div>`;
      const statusLabel = value => value === 'pending' ? '待确认' : '已确认';
      const columns = [['transaction_time','时间'], ['type','类型'], ['category','分类', categoryLabel], ['status','状态', statusLabel], ['amount_cents','金额', signedEntryMoney, moneyClass], ['account','账户'], ['transaction_object','交易对象'], ['note','备注']];
      const headerCells = [
        dateHeaderCell(),
        headerFilterCell('type', '类型', entryTypes),
        headerFilterCell('category', '分类', entryFilterCategoryOptions()),
        '<th><div class="entry-head-filter static"><span class="entry-head-label">状态</span></div></th>',
        '<th><div class="entry-head-filter static"><span class="entry-head-label">金额</span></div></th>',
        headerFilterCell('account', '账户', accountFilterOptions),
        '<th><div class="entry-head-filter static"><span class="entry-head-label">交易对象</span></div></th>',
        '<th><div class="entry-head-filter static"><span class="entry-head-label">备注</span></div></th>',
        '<th class="entry-actions-head"></th>',
      ];
      const header = '<table class="entry-table"><thead><tr>' + headerCells.join('') + '</tr></thead><tbody>';
      const rows = pageRows.map(row => {
        const cells = columns.map(c => {
          const value = c[2] ? c[2](row[c[0]], row) : row[c[0]];
          const classes = ['entry-cell'];
          if (c[3]) classes.push(c[3](row[c[0]], row));
          // data-label 供手机端卡片布局用：窄屏隐藏表头后，每个单元格靠它显示列名。
          return `<td class="${esc(classes.filter(Boolean).join(' '))}" data-label="${esc(c[1])}" title="${esc(value)}"><span class="entry-cell-text">${esc(value)}</span></td>`;
        }).join('');
        const editRow = editingEntryId === row.id ? `
          <tr class="entry-edit-row">
            <td colspan="${columns.length + 1}">
              <div class="entry-edit-panel" data-entry-form="${row.id}">
                <label>时间<input data-field="transaction_time" type="datetime-local" value="${esc(datetimeInputValue(row.transaction_time))}"></label>
                <label>类型<select data-field="type" data-entry-type="${row.id}">${optionsHtml(entryTypes, row.type)}</select></label>
                <label>分类<select data-field="category" data-entry-category="${row.id}">${categoryOptionsHtml(categoriesForType(row.type), row.category, true)}</select></label>
                <label class="entry-edit-amount">金额<input data-field="amount" type="number" step="0.01" inputmode="decimal" value="${amountValue(row.amount_cents)}"></label>
                <label>账户<select data-field="account">${optionsHtml(accountOptions, row.account)}</select></label>
                <label class="entry-target-account ${row.type === '转账' ? '' : 'hidden'}" data-entry-target-wrap="${row.id}">转入账户<select data-field="target_account">${optionsHtml(accountOptions, row.target_account, true)}</select></label>
                <label>交易对象<input data-field="transaction_object" value="${esc(row.transaction_object)}"></label>
                <label class="entry-edit-note">备注<input data-field="note" value="${esc(row.note)}"></label>
                <div class="entry-edit-actions">
                  <button class="primary" data-entry-save="${row.id}">保存</button>
                  <button class="secondary" data-entry-cancel>取消</button>
                </div>
              </div>
            </td>
          </tr>` : '';
        return `
          <tr class="entry-row">
            ${cells}
            <td class="entry-actions" data-label="操作">
              <button data-entry-edit="${row.id}">编辑</button>
              <button data-entry-delete="${row.id}">删除</button>
            </td>
          </tr>${editRow}`;
      }).join('');
      const emptyRow = `<tr><td class="entry-empty" colspan="${columns.length + 1}">暂无数据</td></tr>`;
      const body = header + (pageRows.length ? rows : emptyRow) + '</tbody></table>';
      $('entryTable').innerHTML = body + controls;
      document.querySelectorAll('[data-entry-filter]').forEach(select => select.onchange = () => {
        const field = select.dataset.entryFilter;
        entryFilters[field] = select.value;
        if (field === 'year' && !entryFilters.year) {
          entryFilters.month = '';
          entryFilters.day = '';
        }
        if (field === 'month') {
          entryFilters.day = '';
        }
        if (field === 'type') {
          const scopedCategories = entryFilterCategoryOptions();
          if (entryFilters.category && !scopedCategories.includes(entryFilters.category)) entryFilters.category = '';
        }
        if (['year', 'month', 'day'].includes(field)) {
          syncEntryDateRange();
        }
        entryPage = 1;
        renderEntries();
      });
      $('entryClearFilters').onclick = () => {
        clearEntryFilters();
        entryPage = 1;
        renderEntries();
      };
      $('entryPageSize').onchange = () => {
        entryPageSize = $('entryPageSize').value;
        localStorage.setItem('bookkeeping.entryPageSize', entryPageSize);
        entryPage = 1;
        renderEntries();
      };
      $('entryPrev').onclick = () => {
        entryPage -= 1;
        renderEntries();
      };
      $('entryNext').onclick = () => {
        entryPage += 1;
        renderEntries();
      };
      document.querySelectorAll('[data-entry-edit]').forEach(btn => btn.onclick = () => {
        editingEntryId = Number(btn.dataset.entryEdit);
        renderEntries();
      });
      document.querySelectorAll('[data-entry-cancel]').forEach(btn => btn.onclick = () => {
        editingEntryId = null;
        renderEntries();
      });
      document.querySelectorAll('[data-entry-delete]').forEach(btn => btn.onclick = () => scheduleEntryDelete(Number(btn.dataset.entryDelete)));
      document.querySelectorAll('[data-entry-type]').forEach(select => select.onchange = () => {
        const categorySelect = document.querySelector(`[data-entry-category="${select.dataset.entryType}"]`);
        categorySelect.innerHTML = categoryOptionsHtml(categoriesForType(select.value), '', true);
        const targetWrap = document.querySelector(`[data-entry-target-wrap="${select.dataset.entryType}"]`);
        if (targetWrap) targetWrap.classList.toggle('hidden', select.value !== '转账');
      });
      document.querySelectorAll('[data-entry-save]').forEach(btn => btn.onclick = async () => {
        const id = Number(btn.dataset.entrySave);
        const form = document.querySelector(`[data-entry-form="${id}"]`);
        const payload = {id};
        form.querySelectorAll('[data-field]').forEach(input => payload[input.dataset.field] = input.value.trim());
        try {
          await api('/api/entry-update', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify(payload)
          });
          editingEntryId = null;
          await refresh();
        } catch (err) {
          alert(err.message === 'not found' ? '后端接口未加载，请重启 Dashboard 后再保存。' : err.message);
        }
      });
    }

    function categoryPath(group, leaf) {
      return leaf ? `${group}/${leaf}` : group;
    }

    function categoriesForType(type) {
      const groups = categoryTree[type] || {};
      return Object.entries(groups).flatMap(([group, leaves]) => {
        if (!leaves.length) return [group];
        return leaves.map(leaf => categoryPath(group, leaf));
      });
    }

    function categoryRuleRows() {
      return entryTypes.flatMap(type => categoriesForType(type).map(category => ({type, category})));
    }

    async function saveCategoryRename(input, key) {
      if (input.dataset.saving === 'true') return;
      const [type, oldCategory] = key.split('|||');
      const newCategory = input.value.trim();
      editingCategoryKey = null;
      if (!newCategory || newCategory === oldCategory) {
        renderCategoryRules();
        return;
      }
      input.dataset.saving = 'true';
      await api('/api/category-rename', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({type, old_category: oldCategory, new_category: newCategory})
      });
      await refresh();
    }

    async function saveKeywordAdd(input, key) {
      if (input.dataset.saving === 'true') return;
      const [type, category] = key.split('|||');
      const keyword = input.value.trim();
      addingKeywordKey = null;
      if (!keyword) {
        renderCategoryRules();
        return;
      }
      input.dataset.saving = 'true';
      const result = await api('/api/keyword-rule-add', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({type, category, keyword})
      });
      if (result.applied_unconfirmed) {
        $('status').textContent = `已自动归类 ${result.applied_unconfirmed} 条待确认记录`;
      }
      await refresh();
    }

    // ── 分类规则整块折叠 ──────────────────────────────────────
    // 设置页内容很长；「分类规则」是对比度最低的一块，默认收起。
    function applyCategoryRulesFold(expanded) {
      const body = $("categoryRulesBody");
      const toggle = $("categoryRulesToggle");
      if (!body || !toggle) return;
      body.classList.toggle("hidden", !expanded);
      toggle.setAttribute("aria-expanded", String(expanded));
      const caret = toggle.querySelector(".section-fold-caret");
      const label = toggle.querySelector(".section-fold-label");
      if (caret) caret.textContent = expanded ? "▾" : "▸";
      if (label) label.textContent = expanded ? "收起" : "展开";
      try {
        localStorage.setItem("myledger.fold.categoryRulesSection", expanded ? "1" : "0");
      } catch {}
    }

    function initCategoryRulesFold() {
      const toggle = $("categoryRulesToggle");
      if (!toggle || toggle.dataset.bound) return;
      toggle.dataset.bound = "1";
      let expanded = false;
      try {
        expanded = localStorage.getItem("myledger.fold.categoryRulesSection") === "1";
      } catch {}
      applyCategoryRulesFold(expanded);
      toggle.onclick = () => {
        const body = $("categoryRulesBody");
        const willExpand = body?.classList.contains("hidden");
        applyCategoryRulesFold(willExpand);
        // 展开时如果还没渲染过，补一次数据拉取
        if (willExpand && !document.querySelector("#categoryRules .category-fold")) {
          refresh().catch(() => {});
        }
      };
    }

    // ── 分类规则折叠 ──────────────────────────────────────────
    // 一屏几十个类目 + 每行「暂无关键词」会把页面撑得很长。
    // 按一级类目分组，默认收起；展开状态记住。
    function foldStateKey(txType, group) {
      return `myledger.fold.${txType}||${group}`;
    }

    function isGroupExpanded(txType, group) {
      try {
        return localStorage.getItem(foldStateKey(txType, group)) === "1";
      } catch {
        return false;
      }
    }

    function setGroupExpanded(txType, group, expanded) {
      try {
        localStorage.setItem(foldStateKey(txType, group), expanded ? "1" : "0");
      } catch {}
    }

    function groupByTopCategory(rows) {
      const order = [];
      const groups = new Map();
      for (const row of rows) {
        const head = String(row.category || "").split("/", 1)[0] || "未分类";
        const key = `${row.type}|||${head}`;
        if (!groups.has(key)) {
          groups.set(key, { key, type: row.type, head, rows: [] });
          order.push(key);
        }
        groups.get(key).rows.push(row);
      }
      return order.map((key) => groups.get(key));
    }

    function renderCategoryRules() {
      if (!$('categoryRules')) return;
      const typeValue = entryTypes.includes($('categoryRuleType').value) ? $('categoryRuleType').value : (entryTypes.includes('支出') ? '支出' : entryTypes[0]);
      $('categoryRuleType').innerHTML = optionsHtml(entryTypes, typeValue);
      if (typeValue) $('categoryRuleType').value = typeValue;
      const rows = categoryRuleRows().filter(row =>
        !pendingCategoryDelete || row.type !== pendingCategoryDelete.type || row.category !== pendingCategoryDelete.category
      );
      const groups = groupByTopCategory(rows);
      const renderRow = (row) => {
        const rules = keywordRules.filter(rule => rule.category === row.category && (!rule.type || rule.type === row.type));
        const key = `${row.type}|||${row.category}`;
        const isEditing = editingCategoryKey === key;
        const isAddingKeyword = addingKeywordKey === key;
        return `
          <section class="category-rule-row">
            <div class="category-rule-main">
              <strong></strong>
              ${isEditing
                ? `<input class="category-inline-input" value="${esc(row.category)}" aria-label="分类名称" data-category-edit-input="${esc(key)}">`
                : `<span class="category-rule-name">${esc(categoryLabel(row.category))}</span>`}
              <button type="button" class="icon-button" title="编辑分类" aria-label="编辑分类" data-category-edit="${esc(key)}">✎</button>
            </div>
            <div class="keyword-rule-chips">
              ${rules.length ? rules.map(rule => `
                <span class="keyword-rule-chip">
                  ${esc(rule.keyword)}
                  <button type="button" aria-label="删除 ${esc(rule.keyword)}" data-rule-delete="${esc(rule.id)}">×</button>
                </span>
              `).join('') : '<span class="muted">暂无关键词</span>'}
              ${isAddingKeyword
                ? `<input class="keyword-inline-input" placeholder="关键词" aria-label="新增关键词" data-keyword-add-input="${esc(key)}">`
                : `<button type="button" class="icon-button add" title="新增关键词" aria-label="新增关键词" data-keyword-add="${esc(key)}">+</button>`}
            </div>
            <button type="button" class="text-delete" data-category-delete="${esc(key)}">删除</button>
          </section>
        `;
      };

      $('categoryRules').innerHTML = groups.length
        ? groups.map(group => {
            const expanded = isGroupExpanded(group.type, group.head);
            const keywordCount = keywordRules.filter(rule =>
              group.rows.some(row => row.category === rule.category && (!rule.type || rule.type === row.type))
            ).length;
            return `
              <div class="category-fold ${expanded ? 'is-open' : ''}" data-fold-key="${esc(group.type)}|||${esc(group.head)}">
                <button type="button" class="category-fold-head" data-fold-toggle="${esc(group.type)}|||${esc(group.head)}"
                        aria-expanded="${expanded}">
                  <span class="category-fold-caret">${expanded ? '▾' : '▸'}</span>
                  <span class="category-fold-name">${esc(group.head)}</span>
                  <span class="category-fold-meta">${group.rows.length} 个分类${keywordCount ? ` · ${keywordCount} 条关键词` : ''}</span>
                </button>
                <div class="category-fold-body ${expanded ? '' : 'hidden'}">
                  ${group.rows.map(renderRow).join('')}
                </div>
              </div>`;
          }).join('')
        : '<div class="muted">暂无分类</div>';
      document.querySelectorAll('[data-fold-toggle]').forEach(btn => btn.onclick = () => {
        const [txType, head] = btn.dataset.foldToggle.split('|||');
        const expanded = !isGroupExpanded(txType, head);
        setGroupExpanded(txType, head, expanded);
        renderCategoryRules();
      });
      document.querySelectorAll('[data-category-edit]').forEach(btn => btn.onclick = () => {
        editingCategoryKey = btn.dataset.categoryEdit;
        addingKeywordKey = null;
        renderCategoryRules();
        document.querySelector(`[data-category-edit-input="${CSS.escape(editingCategoryKey)}"]`)?.focus();
      });
      document.querySelectorAll('[data-category-edit-input]').forEach(input => {
        input.onkeydown = event => {
          if (event.key === 'Enter') saveCategoryRename(input, input.dataset.categoryEditInput).catch(err => alert(err.message));
          if (event.key === 'Escape') {
            editingCategoryKey = null;
            renderCategoryRules();
          }
        };
        input.onblur = () => saveCategoryRename(input, input.dataset.categoryEditInput).catch(err => {
          alert(err.message);
          renderCategoryRules();
        });
      });
      document.querySelectorAll('[data-category-delete]').forEach(btn => btn.onclick = async () => {
        const [type, category] = btn.dataset.categoryDelete.split('|||');
        scheduleCategoryDelete(type, category);
      });
      document.querySelectorAll('[data-keyword-add]').forEach(btn => btn.onclick = () => {
        addingKeywordKey = btn.dataset.keywordAdd;
        editingCategoryKey = null;
        renderCategoryRules();
        document.querySelector(`[data-keyword-add-input="${CSS.escape(addingKeywordKey)}"]`)?.focus();
      });
      document.querySelectorAll('[data-keyword-add-input]').forEach(input => {
        input.onkeydown = event => {
          if (event.key === 'Enter') saveKeywordAdd(input, input.dataset.keywordAddInput).catch(err => alert(err.message));
          if (event.key === 'Escape') {
            addingKeywordKey = null;
            renderCategoryRules();
          }
        };
        input.onblur = () => saveKeywordAdd(input, input.dataset.keywordAddInput).catch(err => {
          alert(err.message);
          renderCategoryRules();
        });
      });
      document.querySelectorAll('[data-rule-delete]').forEach(btn => btn.onclick = async () => {
        await api('/api/keyword-rule-delete', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({id: Number(btn.dataset.ruleDelete)})
        });
        keywordRules = await api('/api/keyword-rules');
        renderCategoryRules();
      });
    }

    function renderQuickFormOptions() {
      const typeValue = $('fType').value;
      $('fType').innerHTML = optionsHtml(entryTypes, typeValue || entryTypes[0]);
      if (entryTypes.includes(typeValue)) $('fType').value = typeValue;
      const accountValue = $('fAccount').value;
      $('fAccount').innerHTML = accountOptions.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('') +
        '<option value="__add_account__">+ 新增账户</option>';
      if (accountOptions.includes(accountValue)) $('fAccount').value = accountValue;
      const targetValue = $('fTargetAccount')?.value;
      if ($('fTargetAccount')) {
        $('fTargetAccount').innerHTML = accountOptions.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('') +
          '<option value="__add_account__">+ 新增账户</option>';
        if (accountOptions.includes(targetValue)) $('fTargetAccount').value = targetValue;
      }
      renderQuickCategoryOptions();
    }

    function renderQuickCategoryOptions() {
      const type = $('fType').value;
      const categoryValue = $('fCategory').value;
      const categories = categoriesForType(type);
      const isTransfer = type === '转账';
      const accountLabel = $('fAccountWrap')?.firstChild;
      if (accountLabel && accountLabel.nodeType === Node.TEXT_NODE) accountLabel.textContent = isTransfer ? '转出账户' : '账户';
      document.querySelector('.quick-main-row')?.classList.toggle('is-transfer', isTransfer);
      $('fTargetAccountWrap')?.classList.toggle('hidden', type !== '转账');
      $('fCategoryWrap')?.classList.toggle('hidden', type === '转账');
      $('fCategory').innerHTML = categories.map(name => `<option value="${esc(name)}">${esc(categoryLabel(name))}</option>`).join('') +
        '<option value="__add_category__">+ 新增分类</option>';
      if (categories.includes(categoryValue)) $('fCategory').value = categoryValue;
    }

    function recentCategorySuggestions(type) {
      const allCategories = categoriesForType(type);
      const counts = new Map();
      entries
        .filter(entry => entry.type === type && entry.category && entry.category !== '转账' && allCategories.includes(entry.category))
        .slice(0, 30)
        .forEach(entry => counts.set(entry.category, (counts.get(entry.category) || 0) + 1));
      const ranked = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
        .map(([category]) => category);
      return ranked.slice(0, 10);
    }

    function snapshotPendingSuggestions() {
      const types = [...new Set(pendingItems.map(item => item.type).filter(Boolean))];
      pendingSuggestionCache = types.reduce((acc, type) => {
        acc[type] = recentCategorySuggestions(type);
        return acc;
      }, {});
    }

    // ── 账号与用户管理 ────────────────────────────────────────
    let currentUser = null;

    async function loadMe() {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (!response.ok) return null;
        currentUser = await response.json();
        return currentUser;
      } catch {
        return null;
      }
    }

    function applyUserChrome() {
      if (!currentUser) return;
      const nameEl = $("accountName");
      const roleEl = $("accountRole");
      if (nameEl) nameEl.textContent = currentUser.username;
      if (roleEl) roleEl.textContent = currentUser.is_admin ? "管理员" : "普通用户";

      // 只有管理员能切换账本、看到用户管理
      const scopeSwitch = $("scopeSwitch");
      if (scopeSwitch) scopeSwitch.classList.toggle("hidden", !currentUser.is_admin);
      const adminBlock = $("userAdminBlock");
      if (adminBlock) adminBlock.classList.toggle("hidden", !currentUser.is_admin);
    }

    function scopeQuery() {
      const el = $("scopeSwitch");
      return currentUser?.is_admin && el?.value === "all" ? "?scope=all" : "";
    }

    async function loadUsers() {
      if (!currentUser?.is_admin) return;
      const list = $("userList");
      if (!list) return;
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        if (!response.ok) return;
        const users = await response.json();
        list.innerHTML = users.map((user) => `
          <div class="user-row" data-user-id="${user.id}">
            <span class="user-name">${esc(user.username)}</span>
            <span class="user-role ${user.role === "admin" ? "is-admin" : ""}">${user.role === "admin" ? "管理员" : "用户"}</span>
            <span class="user-state ${user.disabled ? "is-disabled" : ""}">${user.disabled ? "已禁用" : "正常"}</span>
            <span class="user-actions">
              <button class="link-button" data-user-action="reset" data-user-id="${user.id}">重置密码</button>
              <button class="link-button" data-user-action="${user.disabled ? "enable" : "disable"}" data-user-id="${user.id}">${user.disabled ? "启用" : "禁用"}</button>
              <button class="link-button danger" data-user-action="delete" data-user-id="${user.id}">删除</button>
            </span>
          </div>`).join("");
      } catch {
        list.textContent = "加载用户失败";
      }
    }

    function initUserAdmin() {
      const logout = $("logoutBtn");
      if (logout && !logout.dataset.bound) {
        logout.dataset.bound = "1";
        logout.onclick = async () => {
          await fetch("/api/logout", { method: "POST" });
          window.location.replace("/login");
        };
      }

      const scopeSwitch = $("scopeSwitch");
      if (scopeSwitch && !scopeSwitch.dataset.bound) {
        scopeSwitch.dataset.bound = "1";
        scopeSwitch.onchange = () => {
          try {
            localStorage.setItem("myledger.scope", scopeSwitch.value);
          } catch {}
          refresh();
        };
      }

      const changeBtn = $("changePassword");
      if (changeBtn && !changeBtn.dataset.bound) {
        changeBtn.dataset.bound = "1";
        changeBtn.onclick = async () => {
          const status = $("passwordStatus");
          try {
            const response = await fetch("/api/password", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                old_password: $("oldPassword").value,
                new_password: $("newPassword").value,
              }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "修改失败");
            status.textContent = "已修改";
            $("oldPassword").value = "";
            $("newPassword").value = "";
          } catch (error) {
            status.textContent = error.message;
          }
        };
      }

      const createBtn = $("createUser");
      if (createBtn && !createBtn.dataset.bound) {
        createBtn.dataset.bound = "1";
        createBtn.onclick = async () => {
          const status = $("userAdminStatus");
          try {
            const response = await fetch("/api/users", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "create",
                username: $("newUsername").value.trim(),
                password: $("newUserPassword").value,
                role: $("newUserRole").value,
              }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "创建失败");
            status.textContent = `已创建 ${payload.username}`;
            $("newUsername").value = "";
            $("newUserPassword").value = "";
            loadUsers();
          } catch (error) {
            status.textContent = error.message;
          }
        };
      }

      const list = $("userList");
      if (list && !list.dataset.bound) {
        list.dataset.bound = "1";
        list.onclick = async (event) => {
          const button = event.target.closest("[data-user-action]");
          if (!button) return;
          const id = Number(button.dataset.userId);
          const action = button.dataset.userAction;
          const status = $("userAdminStatus");

          if (action === "reset") {
            const password = window.prompt("输入新的初始密码（至少 8 位）");
            if (!password) return;
            const response = await fetch("/api/users", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "reset-password", id, password }),
            });
            const payload = await response.json();
            status.textContent = response.ok ? "密码已重置" : payload.error;
            return;
          }

          if (action === "delete" && !window.confirm("确定删除该用户？其账目将保留但无法再登录。")) return;

          const response = await fetch("/api/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, id }),
          });
          const payload = await response.json();
          status.textContent = response.ok ? "已更新" : payload.error;
          loadUsers();
        };
      }
    }

    // ── 可搜索分类下拉 ────────────────────────────────────────
    // 原生 <select> 只能滚动找；这里在它上面叠一个输入框做过滤，
    // 选中后把值写回隐藏的 <select>，确认逻辑仍读 select.value。
    function comboOptions(select) {
      return [...select.options].map(option => ({ value: option.value, label: option.textContent }));
    }

    function renderComboList(id, query) {
      const select = document.getElementById(`cat-${id}`);
      const list = document.querySelector(`[data-combo-list="${CSS.escape(String(id))}"]`);
      if (!select || !list) return;

      const needle = String(query || "").trim().toLowerCase();
      const all = comboOptions(select).filter(option => option.value);
      const matched = needle
        ? all.filter(option => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle))
        : all;

      if (!matched.length) {
        list.innerHTML = '<div class="combo-empty">没有匹配的分类</div>';
      } else {
        const current = select.value;
        list.innerHTML = matched
          .map(option => `<button type="button" class="combo-option${option.value === current ? " is-active" : ""}" role="option" aria-selected="${option.value === current}" data-combo-value="${esc(option.value)}">${esc(option.label)}</button>`)
          .join("");
      }
      list.classList.remove("hidden");
      const input = document.querySelector(`[data-combo-input="${CSS.escape(String(id))}"]`);
      if (input) input.setAttribute("aria-expanded", "true");
    }

    function closeCombo(id) {
      const list = document.querySelector(`[data-combo-list="${CSS.escape(String(id))}"]`);
      const input = document.querySelector(`[data-combo-input="${CSS.escape(String(id))}"]`);
      if (list) list.classList.add("hidden");
      if (input) input.setAttribute("aria-expanded", "false");
    }

    function bindCombos() {
      document.querySelectorAll("[data-combo]").forEach(box => {
        const id = box.dataset.combo;
        const input = box.querySelector(".combo-input");
        const list = box.querySelector(".combo-list");
        const select = box.querySelector("select");
        if (!input || !list || !select || input.dataset.bound) return;
        input.dataset.bound = "1";

        input.addEventListener("focus", () => {
          input.select();
          renderComboList(id, "");
          filterChips(id, "");
        });
        input.addEventListener("input", () => {
          renderComboList(id, input.value);
          filterChips(id, input.value);
        });
        input.addEventListener("keydown", event => {
          const options = [...list.querySelectorAll(".combo-option")];
          const activeIndex = options.findIndex(option => option.classList.contains("is-active"));
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!options.length) return;
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const nextIndex = Math.min(Math.max(activeIndex + delta, 0), options.length - 1);
            options.forEach((option, index) => {
              option.classList.toggle("is-active", index === nextIndex);
              if (index === nextIndex) option.scrollIntoView({block: "nearest"});
            });
          } else if (event.key === "Enter") {
            event.preventDefault();
            const chosen = options[activeIndex] || options[0];
            if (chosen) {
              select.value = chosen.dataset.comboValue;
              input.value = chosen.textContent;
              filterChips(id, chosen.textContent);
              closeCombo(id);
            }
          } else if (event.key === "Escape") {
            closeCombo(id);
            input.blur();
          }
        });

        list.addEventListener("mousedown", event => {
          const option = event.target.closest(".combo-option");
          if (!option) return;
          event.preventDefault();
          select.value = option.dataset.comboValue;
          input.value = option.textContent;
          closeCombo(id);
          input.focus();
        });

        input.addEventListener("blur", () => {
          // 失焦时若输入与选中值不一致，回退到已选值的显示文本。
          setTimeout(() => {
            const selected = [...select.options].find(option => option.value === select.value);
            if (selected) input.value = selected.textContent;
            closeCombo(id);
          }, 120);
        });
      });
    }

    function categoryPicker(id, type) {
      const suggestions = pendingSuggestionCache[type] || [];
      const body = suggestions.map(category =>
        `<button class="chip" data-confirm-id="${esc(id)}" data-category="${esc(category)}" data-chip-label="${esc(categoryLabel(category).toLowerCase())}">${esc(categoryLabel(category))}</button>`
      ).join('');
      return `<div class="category-picker" id="picker-${esc(id)}" data-chip-box="${esc(id)}">
        <div class="category-group-title">推荐分类</div>
        <div class="category-group-options">${body || '<div class="muted">暂无可选分类</div>'}<div class="muted chip-empty hidden">没有匹配的推荐分类</div></div>
      </div>`;
    }

    /** 输入关键字时同步过滤推荐 chip；无匹配则整组隐藏。 */
    function filterChips(id, query) {
      const box = document.querySelector(`[data-chip-box="${CSS.escape(String(id))}"]`);
      if (!box) return;
      const needle = String(query || "").trim().toLowerCase();
      let visible = 0;
      box.querySelectorAll(".chip").forEach(chip => {
        const label = chip.dataset.chipLabel || "";
        const matched = !needle || label.includes(needle);
        chip.classList.toggle("hidden", !matched);
        if (matched) visible += 1;
      });
      const empty = box.querySelector(".chip-empty");
      if (empty) empty.classList.toggle("hidden", visible > 0);
      box.classList.toggle("is-empty", visible === 0);
    }

    function renderPendingSummary() {
      const counts = pendingItems.reduce((acc, item) => {
        const key = item.type || '未知';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      // 空的时候概览留空：下方列表已经说明「没有待确认条目」，说两遍是噪音
      $('pendingSummary').innerHTML = rows.map(([name, count]) =>
        `<div class="side-item"><span>${esc(name)}</span><strong>${count}</strong></div>`
      ).join('');
    }

    function renderPending() {
      renderPendingSummary();
      if (!pendingItems.length) {
        $('pendingList').innerHTML =
          '<div class="section muted pending-empty">没有待确认条目。导入账单后，规则未命中的记录会出现在这里。</div>';
        return;
      }
      const visibleItems = pendingItems.slice(0, 4);
      $('pendingList').innerHTML = visibleItems.map((item, index) => {
        const tone = moneyTone(item);
        const id = item.ui_id || item.id;
        return `
          <article class="pending-row pending-card ${index === 0 ? 'is-front' : ''}" data-id="${esc(id)}" style="--i:${index}">
            <section>
              <div class="pending-title">
                <span class="badge">${esc(item.type || '未知')}</span>
                <span class="amount ${tone === 'income' ? 'income' : tone === 'expense' ? 'expense' : 'neutral-money'}">${signedMoney(item.amount_cents, tone)}</span>
              </div>
              <div class="detail-grid">
                <div><span>时间</span>${esc(item.transaction_time)}</div>
                <div><span>账户</span>${esc(item.account)}</div>
                ${item.target_account ? `<div><span>转入账户</span>${esc(item.target_account)}</div>` : ''}
                ${item.participant && item.participant !== '自己' ? `<div><span>参与人</span>${esc(item.participant)}</div>` : ''}
                <label class="pending-object-field">
                  <span>交易对象</span>
                  <input data-confirm-object="${esc(id)}" value="${esc(item.transaction_object || '')}" placeholder="对方名称、债务人或平台">
                </label>
                <label class="pending-object-field">
                  <span>备注</span>
                  <textarea data-confirm-note="${esc(id)}" rows="3" placeholder="补充说明">${esc(item.note || '')}</textarea>
                </label>
              </div>
            </section>
            <section>
              ${categoryPicker(id, item.type)}
              <div class="confirm-line">
                <div class="combo" data-combo="${esc(id)}">
                  <input class="combo-input" type="text" autocomplete="off" spellcheck="false"
                         placeholder="输入关键字搜索分类"
                         value="${esc(categoryLabel(item.category || ''))}"
                         data-combo-input="${esc(id)}"
                         aria-expanded="false" role="combobox" aria-autocomplete="list">
                  <div class="combo-list hidden" data-combo-list="${esc(id)}" role="listbox"></div>
                  <select id="cat-${id}" class="combo-value" tabindex="-1" aria-hidden="true">${categoryOptionsHtml(categoriesForType(item.type), item.category, false)}</select>
                </div>
                <button class="secondary" data-pending-skip="${esc(id)}">跳过</button>
                <button class="danger" data-pending-delete="${esc(id)}">删除</button>
                <button class="primary" data-confirm-id="${esc(id)}">确认</button>
              </div>
            </section>
          </article>`;
      }).join('');
      bindCombos();
    }

    async function confirmWithCategory(id, category) {
      if (pendingAnimating) return;
      pendingAnimating = true;

      // 先把用户在这张卡片上填的值抓下来，再移除卡片——
      // 卡片一旦重渲染，输入框就没了，取值必须在前面。
      const objectInput = document.querySelector(`[data-confirm-object="${CSS.escape(String(id))}"]`);
      const noteInput = document.querySelector(`[data-confirm-note="${CSS.escape(String(id))}"]`);
      const editedObject = objectInput ? objectInput.value.trim() : null;
      const editedNote = noteInput ? noteInput.value.trim() : null;

      // 先把卡片移出并立刻重渲染：网络往返经隧道要 1s 以上，
      // 等结果再动会让人以为按钮没响应。
      const removedIndex = pendingItems.findIndex(item => String(item.ui_id || item.id) === String(id));
      const removedItem = removedIndex >= 0 ? pendingItems.splice(removedIndex, 1)[0] : null;
      if (removedItem) {
        renderPending();
        renderPendingSummary();
      }

      try {
        const item = removedItem;
        await api('/api/confirm', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            id: item ? item.id : id,
            source: item?.source,
            category,
            transaction_object: editedObject ?? item?.transaction_object ?? '',
            note: editedNote ?? item?.note ?? '',
            learn: false
          })
        });
        // 成功后只补看板数字与待确认列表，不重渲染整页。
        await refreshAfterConfirm();
        pendingStatus(
          pendingItems.length
            ? `已确认，还剩 ${pendingItems.length} 条待确认。`
            : '全部处理完了，没有待确认条目。'
        );
      } catch (error) {
        // 失败要把卡片放回去，否则用户以为已经确认了。
        if (removedItem) {
          pendingItems.splice(removedIndex, 0, removedItem);
          renderPending();
          renderPendingSummary();
        }
        pendingStatus(`确认失败：${error.message}`);
        throw error;
      } finally {
        pendingAnimating = false;
      }
    }

    async function confirmPending(id) {
      const input = $(`cat-${id}`);
      const category = input ? input.value.trim() : "";
      const item = pendingItems.find(entry => String(entry.ui_id || entry.id) === String(id));
      // 中性交易（不计收支/转账）没有可选分类，允许不带分类直接确认。
      // 其余类型缺分类时必须提示，不能静默返回——那样用户会以为按钮坏了。
      const categoryOptional = item && ["不计收支", "转账"].includes(item.type);
      if (!category && !categoryOptional) {
        $("status").textContent = "请先选择分类；若该笔无需分类，请点「跳过」";
        return;
      }
      await confirmWithCategory(id, category);
    }

    function pendingStatus(message) {
      const el = $('pendingStatus') || $('status');
      if (el) el.textContent = message;
    }

    function skipPending(id) {
      if (pendingAnimating) return;
      const index = pendingItems.findIndex(item => String(item.ui_id || item.id) === String(id));
      if (index < 0) return;

      // 只剩一条时没有「下一条」可跳，但按钮不能假装没被点过：
      // 明确告诉用户这是最后一条，要走「确认」或去账单页处理。
      if (pendingItems.length < 2) {
        pendingStatus('这是最后一条待确认。选好分类点「确认」，或去「账单」页处理。');
        return;
      }

      pendingSkippedIds = pendingSkippedIds.filter(itemId => String(itemId) !== String(id));
      pendingSkippedIds.push(String(id));
      savePendingSkippedIds();
      const [item] = pendingItems.splice(index, 1);
      pendingItems.push(item);
      renderPending();
      pendingStatus(`已跳过，当前还有 ${pendingItems.length} 条待确认。`);
    }

    async function deletePending(id) {
      if (pendingAnimating) return;
      const index = pendingItems.findIndex(item => String(item.ui_id || item.id) === String(id));
      if (index < 0) return;
      const item = pendingItems[index];
      if (!window.confirm(`删除这条待确认记录？\n${item.transaction_object || ''} ${signedMoney(item.amount_cents, moneyTone(item))}`)) {
        return;
      }

      pendingAnimating = true;
      pendingItems.splice(index, 1);
      renderPending();
      renderPendingSummary();

      try {
        await api('/api/pending-delete', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ id: item.id, source: item.source || 'pending' })
        });
        pendingStatus(pendingItems.length ? `已删除，还剩 ${pendingItems.length} 条待确认。` : '已删除，没有待确认条目了。');
        await refreshAfterConfirm();
      } catch (error) {
        pendingItems.splice(index, 0, item);
        renderPending();
        renderPendingSummary();
        pendingStatus(`删除失败：${error.message}`);
      } finally {
        pendingAnimating = false;
      }
    }

    window.confirmPending = confirmPending;
    initToolbarMore();
    window.deletePending = deletePending;
    window.confirmWithCategory = confirmWithCategory;

    $('pendingList').addEventListener('click', (event) => {
      // 推荐分类标题点击展开/收起（手机端默认只露一行）
      const groupTitle = event.target.closest('.category-group-title');
      if (groupTitle) {
        groupTitle.closest('.category-picker')?.classList.toggle('is-open');
        return;
      }
      const toggle = event.target.closest('[data-toggle-picker]');
      if (toggle) {
        const picker = $(`picker-${toggle.dataset.togglePicker}`);
        if (picker) picker.classList.toggle('hidden');
        return;
      }
      const skip = event.target.closest('[data-pending-skip]');
      if (skip) {
        skipPending(skip.dataset.pendingSkip);
        return;
      }
      const del = event.target.closest('[data-pending-delete]');
      if (del) {
        deletePending(del.dataset.pendingDelete);
        return;
      }
      const target = event.target.closest('[data-confirm-id]');
      if (!target) return;
      const id = target.dataset.confirmId;
      const input = $(`cat-${id}`);
      const category = target.dataset.category || (input ? input.value.trim() : "");
      // 中性交易（不计收支/转账）不需要分类；其余缺分类时必须提示，不能静默返回。
      const item = pendingItems.find(entry => String(entry.ui_id || entry.id) === String(id));
      const categoryOptional = item && ["不计收支", "转账"].includes(item.type);
      if (!category && !categoryOptional) {
        $('status').textContent = '请先选择分类；若该笔无需分类，请点「跳过」';
        return;
      }
      confirmWithCategory(id, category).catch(err => $('status').textContent = err.message);
    });

    // ── 导入账单 ──────────────────────────────────────────────
    // 只调本机 /api/import-upload：文件不离开浏览器所在的这台机器。
    let importViewReady = false;

    function initToolbarMore() {
      const more = $('toolbarMore');
      const extra = $('toolbarExtra');
      if (!more || !extra || more.dataset.bound) return;
      more.dataset.bound = '1';
      more.onclick = () => {
        const open = extra.classList.toggle('is-open');
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
        more.textContent = open ? '收起' : '更多';
      };
    }

    function initImportView() {
      if (importViewReady) return;
      importViewReady = true;

      const dropzone = $('dropzone');
      const fileInput = $('fileInput');
      if (!dropzone || !fileInput) return;

      initZipPassword();
      initMailFetch();
      dropzone.onclick = () => fileInput.click();
      dropzone.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileInput.click();
        }
      };
      fileInput.onchange = () => {
        if (fileInput.files && fileInput.files[0]) uploadBill(fileInput.files[0]);
        fileInput.value = '';
      };

      ['dragenter', 'dragover'].forEach((name) => {
        dropzone.addEventListener(name, (event) => {
          event.preventDefault();
          dropzone.classList.add('drag-over');
        });
      });
      ['dragleave', 'drop'].forEach((name) => {
        dropzone.addEventListener(name, (event) => {
          event.preventDefault();
          dropzone.classList.remove('drag-over');
        });
      });
      dropzone.addEventListener('drop', (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file) uploadBill(file);
      });
    }

    let pendingZipFile = null;

    // ── 邮箱收取 ──────────────────────────────────────────────
    // 凭据存在配置文件（设置页保存），导入页只负责触发一次收取。

    async function loadMailSettings() {
      try {
        const response = await fetch("/api/mail-settings", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if ($("mailUser")) $("mailUser").value = payload.username || "";
        if ($("mailPass")) $("mailPass").value = payload.has_password ? "********" : "";
        if ($("mailStatus")) {
          $("mailStatus").textContent = payload.configured ? "已配置" : "未配置";
        }
      } catch {}
    }

    async function saveMailSettings() {
      const status = $("mailStatus");
      const password = $("mailPass").value;
      const body = {
        username: $("mailUser").value.trim(),
        // 保持占位符时不覆盖已保存的授权码
        password: password === "********" ? "" : password,
      };
      try {
        const response = await fetch("/api/mail-settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "保存失败");
        status.textContent = "已保存";
        loadMailSettings();
      } catch (error) {
        status.textContent = error.message;
      }
    }

    async function loadMailPending() {
      const box = $("mailPending");
      if (!box) return;
      try {
        const response = await fetch("/api/mail-pending", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        const files = payload.files || [];
        if (!files.length) {
          // 必须清空旧内容，否则删除后仍显示上一次的列表
          box.innerHTML = "";
          box.classList.add("hidden");
          return;
        }
        box.innerHTML = `<div class="mail-pending-title">待导入的压缩包（${files.length}）</div>` +
          files.map((f) => `
            <div class="mail-pending-row" data-mail-file="${esc(f.name)}">
              <span class="mail-pending-name">${esc(f.name)}</span>
              <span class="muted">${f.bytes < 1024 ? "0" : Math.round(f.bytes / 1024)} KB · ${esc(f.mtime)}</span>
              <span class="mail-pending-actions">
                <button type="button" class="link-button primary" data-mail-import="${esc(f.name)}">导入</button>
                <button type="button" class="link-button danger" data-mail-delete="${esc(f.name)}">删除</button>
              </span>
              <div class="mail-pending-pw hidden" data-mail-pw="${esc(f.name)}">
                <input type="password" placeholder="解压密码（没有就留空）" data-mail-password="${esc(f.name)}" autocomplete="off">
                <button type="button" class="primary" data-mail-go="${esc(f.name)}">开始导入</button>
                <button type="button" class="link-button" data-mail-cancel="${esc(f.name)}">取消</button>
              </div>
            </div>`).join("") +
          `<p class="muted mail-pending-hint">点「导入」填写解压密码（没加密就留空）；不需要的压缩包点「删除」。</p>`;
        box.classList.remove("hidden");

        // 点「导入」展开密码栏
        box.querySelectorAll("[data-mail-import]").forEach((button) => {
          button.onclick = () => {
            const name = button.dataset.mailImport;
            const panel = box.querySelector(`[data-mail-pw="${CSS.escape(name)}"]`);
            if (!panel) return;
            panel.classList.remove("hidden");
            panel.querySelector("input")?.focus();
          };
        });

        // 取消
        box.querySelectorAll("[data-mail-cancel]").forEach((button) => {
          button.onclick = () => {
            const name = button.dataset.mailCancel;
            box.querySelector(`[data-mail-pw="${CSS.escape(name)}"]`)?.classList.add("hidden");
          };
        });

        // 开始导入
        box.querySelectorAll("[data-mail-go]").forEach((button) => {
          button.onclick = async () => {
            const name = button.dataset.mailGo;
            const panel = box.querySelector(`[data-mail-pw="${CSS.escape(name)}"]`);
            const input = panel?.querySelector("input");
            const password = input?.value || "";
            const status = $("mailFetchStatus");

            button.disabled = true;
            const original = button.textContent;
            button.textContent = "导入中…";
            if (status) status.textContent = `正在导入 ${name}…`;
            try {
              const response = await fetch("/api/mail-import", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, password }),
              });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(payload.error || "导入失败");

              if (status) {
                const parsed = payload.parsed ?? 0;
                const confirmed = payload.confirmed ?? 0;
                const pending = payload.pending ?? 0;
                const skipped = payload.skipped ?? 0;
                const deduped = payload.deduped ?? 0;
                const parts = [`${name}：解析 ${parsed} 笔`];
                if (confirmed) parts.push(`已确认 ${confirmed}`);
                if (pending) parts.push(`待确认 ${pending}`);
                if (deduped) parts.push(`重复跳过 ${deduped}`);
                if (skipped) parts.push(`跳过 ${skipped}`);
                let text = parts.join(" · ");
                if (pending) text += `（点左侧「待确认」补类目）`;
                // 解析到了但一笔没落库，必须说清楚，不能静默
                if (parsed > 0 && confirmed + pending === 0) {
                  if (deduped > 0 && deduped >= parsed - skipped) {
                    text += `。这笔账单之前已经导入过，没有新增。`;
                  } else if (skipped > 0) {
                    text += `。全部被跳过，请检查文件格式。`;
                  }
                }
                status.textContent = text;
              }
              // 导入成功后删掉压缩包，避免重复导入
              await fetch("/api/mail-delete", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name }),
              }).catch(() => {});
              await loadMailPending();
              refresh().catch(() => {});
            } catch (error) {
              if (status) status.textContent = `导入失败：${error.message}`;
              button.disabled = false;
              button.textContent = original;
            }
          };
        });

        box.querySelectorAll("[data-mail-delete]").forEach((button) => {
          button.onclick = async () => {
            const name = button.dataset.mailDelete;
            if (!window.confirm(`删除「${name}」？`)) return;
            button.disabled = true;
            try {
              const response = await fetch("/api/mail-delete", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name }),
              });
              if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || "删除失败");
              }
              await loadMailPending();
            } catch (error) {
              alert(error.message);
              button.disabled = false;
            }
          };
        });
      } catch (error) {
        console.error("待导入列表加载失败", error);
      }
    }

    function initMailSettings() {
      const save = $("mailSave");
      if (save && !save.dataset.bound) {
        save.dataset.bound = "1";
        save.onclick = saveMailSettings;
        loadMailSettings();
      }
    }

    function initMailFetch() {
      const button = $("mailFetch");
      if (!button || button.dataset.bound) return;
      button.dataset.bound = "1";

      button.onclick = async () => {
        const status = $("mailFetchStatus");
        status.textContent = "正在连接邮箱…";
        button.disabled = true;
        try {
          const response = await fetch("/api/mail-fetch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          });
          const payload = await response.json();
          if (!response.ok) {
            const message = payload.error || "收取失败";
            throw new Error(/设置页/.test(message) ? `${message}（点左侧「设置」填写）` : message);
          }

          const savedCount = (payload.saved || []).length;
          const linkCount = (payload.links || []).length;
          const parts = [`最近 ${payload.days || 7} 天，扫描 ${payload.scanned} 封`];
          if (savedCount) parts.push(`保存 ${savedCount} 个附件`);
          if (linkCount) parts.push(`发现 ${linkCount} 个下载链接`);
          status.textContent = parts.join("，") + (savedCount || linkCount ? "" : "，没有新账单");

          // 链接型邮件：逐个下载
          for (const link of payload.links || []) {
            await fetch("/api/mail-download", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url: link.url, uid: link.uid, subject: link.subject }),
            });
          }
          loadMailPending();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };

      loadMailPending();
    }

    async function uploadBill(file, password) {
      const progress = $('importProgress');
      const resultBox = $('importResult');
      const errorBox = $('importError');
      const passwordBox = $('zipPasswordBox');

      errorBox.classList.add('hidden');
      resultBox.classList.add('hidden');
      progress.classList.remove('hidden');
      progress.textContent = `正在解析并入库：${file.name}`;

      const form = new FormData();
      form.append('file', file, file.name);
      if (password) form.append('password', password);

      try {
        const response = await fetch('/api/import-upload', {method: 'POST', body: form});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `导入失败（HTTP ${response.status}）`);

        pendingZipFile = null;
        if (passwordBox) passwordBox.classList.add('hidden');
        renderImportResult(payload);
        await refreshAfterImport();
      } catch (error) {
        const message = error.message || String(error);
        const needsPassword = /加密|密码/.test(message);
        if (needsPassword && passwordBox) {
          // 记住文件，等用户填密码后重试，不必重新选择。
          pendingZipFile = file;
          passwordBox.classList.remove('hidden');
          $('zipPasswordHint').textContent = message;
          $('zipPassword').focus();
        } else {
          errorBox.textContent = message;
          errorBox.classList.remove('hidden');
        }
      } finally {
        progress.classList.add('hidden');
      }
    }

    function initZipPassword() {
      const button = $('zipRetry');
      const input = $('zipPassword');
      if (!button || !input || button.dataset.bound) return;
      button.dataset.bound = '1';
      const retry = () => {
        const password = input.value.trim();
        if (!pendingZipFile) return;
        if (!password) {
          $('zipPasswordHint').textContent = '请填写密码';
          return;
        }
        uploadBill(pendingZipFile, password);
      };
      button.onclick = retry;
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          retry();
        }
      });
    }

    function renderImportResult(result) {
      const box = $('importResult');
      const sourceName = result.source === 'wechat' ? '微信支付' : '支付宝';
      const money = (value) => Number(value || 0).toFixed(2);

      const rows = Object.entries(result.totals || {})
        .map(([kind, value]) => `<li><span>${esc(kind)}</span><strong>${money(value)}</strong></li>`)
        .join('');

      const warnings = (result.warnings || [])
        .map((text) => `<p class="import-warning">${esc(text)}</p>`)
        .join('');

      const fromZip = result.unpacked_from
        ? `<p class="muted">来自压缩包：${esc(result.unpacked_from)}</p>`
        : "";
      box.innerHTML = `
        <h4>导入完成：${esc(result.filename)}</h4>
        ${fromZip}
        <p class="muted">识别为 ${sourceName}，共解析 ${result.parsed} 笔</p>
        <div class="import-stats">
          <div><span>新增已确认</span><strong>${result.confirmed}</strong></div>
          <div><span>待确认</span><strong>${result.pending}</strong></div>
          <div><span>跳过</span><strong>${result.skipped}</strong></div>
        </div>
        <h5>按类型合计（元）</h5>
        <ul class="import-totals">${rows}</ul>
        ${warnings}
        <button class="primary" id="goConfirm" type="button">去处理待确认</button>
      `;
      box.classList.remove('hidden');

      const goConfirm = $('goConfirm');
      if (goConfirm) goConfirm.onclick = () => switchView('confirm');
    }

    async function refreshAfterImport() {
      // 导入本身已经成功；刷新失败不应让用户误以为导入失败。
      try {
        await refresh();
        $('status').textContent = '已更新';
      } catch (error) {
        $('status').textContent = '导入成功，刷新看板失败，请手动刷新页面';
      }
    }

    const titles = {home: '流水', entries: '账单', import: '导入账单', confirm: '待确认分类', assets: '账户', settings: '设置'};
    async function switchView(view) {
      await commitPendingDeletes({refreshAfter: true});
      document.querySelectorAll('.spine-nav button').forEach(b => b.classList.remove('active'));
      const btn = document.querySelector(`.spine-nav button[data-view="${view}"]`);
      if (!btn) return;
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      $(view).classList.remove('hidden');
      $('pageTitle').textContent = titles[view] || '账簿';
      $('app').dataset.view = view;
      syncPanel();
      if (view === 'entries') renderEntries();
      if (view === 'import') {
        initImportView();
        // 每次进入都刷新待导入列表：邮件可能刚收完，或上一次加载时还没登录。
        loadMailPending().catch(() => {});
      }
      if (view === 'settings') {
        applyUserChrome();
        initUserAdmin();
        initMailSettings();
        initCategoryRulesFold();
        // 首次进入设置页时 refresh() 可能还没跑完；没有分组就补一次。
        if (!document.querySelector('#categoryRules .category-fold')) {
          refresh().catch(() => {});
        }
        loadUsers();
      }
      if (view === 'confirm') {
        snapshotPendingSuggestions();
        // 首次 refresh() 可能还没跑完（9 个接口经隧道要 2s+）。
        // 此时列表是空的，不能就此显示「没有待确认条目」，补一次加载。
        if (!pendingItems.length) {
          const el = $('pendingList');
          if (el) el.innerHTML = '<div class="section muted">正在加载待确认条目…</div>';
          refreshAfterConfirm().catch(() => {});
        } else {
          renderPending();
        }
      }
    }
    document.querySelectorAll('.spine-nav button').forEach(btn => btn.onclick = () => switchView(btn.dataset.view).catch(err => alert(err.message)));

    document.querySelectorAll('#modeSeg button').forEach(btn => {
      btn.onclick = () => {
        panelMode = btn.dataset.mode;
        localStorage.setItem(PANEL_MODE_KEY, panelMode);
        syncPanel();
      };
    });
    $('spineHome').onclick = () => switchView('home').catch(err => alert(err.message));
    $('pendingLink').onclick = () => switchView('confirm').catch(err => alert(err.message));
    bindDonutHover();
    syncPanel();

    // 启动：拉取当前用户，应用账号相关界面，并绑定用户管理交互
    (async () => {
      await loadMe();
      if (!currentUser) {
        window.location.replace("/login");
        return;
      }
      const scopeEl = $("scopeSwitch");
      if (scopeEl) {
        try {
          const saved = localStorage.getItem("myledger.scope");
          if (saved === "all" && currentUser.is_admin) scopeEl.value = "all";
        } catch {}
      }
      applyUserChrome();
      initUserAdmin();
      loadUsers();
      // 启动时必须拉一次数据：此前只做了用户相关初始化，
      // refresh() 从未被调用，首屏一直是 0.00 与 --/--/--。
      await refresh();
    })();

    window.addEventListener('pagehide', () => {
      commitPendingDeletes({keepalive: true, silent: true});
    });

    function jumpToEntriesByTone(tone) {
      const range = currentRange();
      entryFilters = {year: '', month: '', day: '', type: '', category: '', account: '', transaction_object: '', tone, start: range.start, end: range.end};
      entryPage = 1;
      switchView('entries');
    }
    $('incomeKpi').onclick = () => jumpToEntriesByTone('income');
    $('expenseKpi').onclick = () => jumpToEntriesByTone('expense');
    function setExpenseCategoryLevel(level) {
      expenseCategoryLevel = level;
      localStorage.setItem('bookkeeping.expenseCategoryLevel', expenseCategoryLevel);
      updateOverview();
    }
    document.querySelector('.level-switch')?.addEventListener('click', event => {
      event.preventDefault();
      setExpenseCategoryLevel(expenseCategoryLevel === 'major' ? 'minor' : 'major');
    });

    document.querySelectorAll('[data-period-mode]').forEach(btn => btn.onclick = () => {
      periodMode = btn.dataset.periodMode;
      if (periodMode === 'year') yearOffset = 0;
      if (periodMode === 'month') monthOffset = 0;
      if (periodMode === 'more') selectedCycleIndex = 0;
      updateOverview();
    });
    $('rangeStartTrigger').onclick = (event) => openDatePicker('start', event.currentTarget);
    $('rangeEndTrigger').onclick = (event) => openDatePicker('end', event.currentTarget);
    $('datePickerYear').onchange = () => {
      pickerMonth = new Date(Number($('datePickerYear').value), pickerMonth.getMonth(), 1);
      renderDatePicker();
    };
    $('datePickerMonth').onchange = () => {
      pickerMonth = new Date(pickerMonth.getFullYear(), Number($('datePickerMonth').value), 1);
      renderDatePicker();
    };
    $('datePickerGrid').onclick = (event) => {
      const target = event.target.closest('[data-date]');
      if (!target || !activeDateTarget) return;
      const range = currentRange();
      customStart = activeDateTarget === 'start' ? target.dataset.date : range.start;
      customEnd = activeDateTarget === 'end' ? target.dataset.date : range.end;
      if (customStart && customEnd && customStart > customEnd) {
        [customStart, customEnd] = [customEnd, customStart];
      }
      periodMode = 'all';
      closeDatePicker();
      updateOverview();
    };
    document.addEventListener('click', (event) => {
      if ($('datePicker').classList.contains('hidden')) return;
      if (event.target.closest('#datePicker') || event.target.closest('.date-trigger')) return;
      closeDatePicker();
    });
    document.querySelectorAll('[data-cycle]').forEach(btn => btn.onclick = () => {
      cycleMode = btn.dataset.cycle;
      selectedCycleIndex = 0;
      updateOverview();
    });
    $('prevCycle').onclick = () => {
      if (periodMode === 'year') yearOffset -= 1;
      else if (periodMode === 'month') monthOffset -= 1;
      else selectedCycleIndex += 1;
      updateOverview();
    };
    $('nextCycle').onclick = () => {
      if (periodMode === 'year') yearOffset += 1;
      else if (periodMode === 'month') monthOffset += 1;
      else selectedCycleIndex = Math.max(0, selectedCycleIndex - 1);
      updateOverview();
    };

    $('quickAdd').onclick = () => $('quickForm').classList.toggle('hidden');
    $('toggleQuickMore').onclick = () => {
      const panel = $('quickMoreFields');
      const expanded = panel.classList.toggle('hidden') === false;
      $('toggleQuickMore').textContent = expanded ? '收起' : '展开';
    };
    function applyTheme(dark) {
      document.body.dataset.theme = dark ? 'dark' : '';
      $('themeToggle').checked = dark;
      localStorage.setItem('bookkeeping.theme', dark ? 'dark' : 'light');
      if (summaryData) updateOverview();
    }
    function applyColorMode(inverted) {
      document.body.dataset.colorInverted = inverted ? 'true' : '';
      $('colorInvert').checked = inverted;
      localStorage.setItem('bookkeeping.colorInverted', inverted ? 'true' : 'false');
      if (summaryData) updateOverview();
    }
    $('themeToggle').onchange = () => applyTheme($('themeToggle').checked);
    $('colorInvert').onchange = () => applyColorMode($('colorInvert').checked);
    $('addCategoryRule').onclick = async () => {
      const category = $('newCategoryName').value.trim();
      if (!category) return;
      await api('/api/category-add', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({type: $('categoryRuleType').value, category})
      });
      $('newCategoryName').value = '';
      await refresh();
    };
    applyTheme(localStorage.getItem('bookkeeping.theme') === 'dark');
    applyColorMode(localStorage.getItem('bookkeeping.colorInverted') === 'true');
    $('search').oninput = () => {
      entryPage = 1;
      renderEntries();
    };
    $('fType').onchange = renderQuickCategoryOptions;
    async function addAccountFromQuick(selectId) {
      const select = $(selectId);
      if (select.value !== '__add_account__') return;
      const name = prompt('新增账户名称');
      if (!name || !name.trim()) {
        renderQuickFormOptions();
        return;
      }
      await api('/api/account-add', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({name: name.trim()})
      });
      accountOptions = await api('/api/account-names');
      renderQuickFormOptions();
      select.value = name.trim();
    }

    $('fAccount').onchange = async () => {
      await addAccountFromQuick('fAccount');
    };
    $('fTargetAccount').onchange = async () => {
      await addAccountFromQuick('fTargetAccount');
    };
    $('fCategory').onchange = async () => {
      if ($('fCategory').value !== '__add_category__') return;
      const category = prompt($('fType').value === '支出' ? '新增分类，格式：一级/二级' : '新增分类名称');
      if (!category || !category.trim()) {
        renderQuickCategoryOptions();
        return;
      }
      await api('/api/category-add', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({type: $('fType').value, category: category.trim()})
      });
      [categoryOptions, categoryTree] = await Promise.all([api('/api/categories'), api('/api/category-tree')]);
      entryTypes = Object.keys(categoryTree);
      renderQuickCategoryOptions();
      $('fCategory').value = category.trim();
    };
    $('saveEntry').onclick = async () => {
      const isTransfer = $('fType').value === '转账';
      if ($('fAccount').value === '__add_account__' || (isTransfer && $('fTargetAccount').value === '__add_account__') || (!isTransfer && $('fCategory').value === '__add_category__')) return;
      await api('/api/add', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          type: $('fType').value,
          amount: $('fAmount').value,
          transaction_time: $('fTime').value ? $('fTime').value.replace('T', ' ') : '',
          account: $('fAccount').value,
          target_account: isTransfer ? $('fTargetAccount').value : '',
          category: isTransfer ? '转账' : $('fCategory').value,
          transaction_object: $('fTransactionObject').value.trim(),
          participant: '自己',
          note: $('fNote').value.trim(),
          learn: $('fLearn').checked
        })
      });
      $('fAmount').value = '';
      $('fTransactionObject').value = '';
      $('fNote').value = '';
      $('fTime').value = nowDatetimeLocal();
      refresh();
    };

