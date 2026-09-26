import { CHARACTERS, ITEM_INFO } from './types';
import type {
  RaceConfig,
  RaceSnapshot,
  Settings,
  CharacterId,
  RaceMode,
  Difficulty,
  Quality,
  RaceEvent,
} from './types';
import { TRACK } from './track';
import { formatTime, SaveStore } from './storage';
export type Screen = 'home' | 'setup' | 'help' | 'playing' | 'pause' | 'settings' | 'results';
interface Actions {
  start: (config: RaceConfig) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  home: () => void;
  settings: (settings: Settings) => void;
  unlock: () => void;
}
const paw =
  '<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="27" rx="10" ry="8"/><ellipse cx="8" cy="16" rx="4" ry="5" transform="rotate(-25 8 16)"/><ellipse cx="16" cy="9" rx="4" ry="5"/><ellipse cx="26" cy="10" rx="4" ry="5"/><ellipse cx="33" cy="18" rx="4" ry="5" transform="rotate(25 33 18)"/></svg>';
const arrow =
  '<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 12h26M19 3l9 9-9 9" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
export class GameUI {
  screen: Screen = 'home';
  private settingsReturn: Screen = 'home';
  private mode: RaceMode = 'race';
  private difficulty: Difficulty;
  private selected: CharacterId;
  private portraits: Record<CharacterId, string>;
  private snapshot: RaceSnapshot | null = null;
  private messageUntil = 0;
  private message = '';
  private newRecord = false;
  private finalSaved = false;
  private lastHudTime = -1;
  private minimap: HTMLCanvasElement | null = null;
  constructor(
    private root: HTMLElement,
    private store: SaveStore,
    portraits: Record<CharacterId, string>,
    private actions: Actions,
  ) {
    this.portraits = portraits;
    this.selected = store.data.settings.characterId;
    this.difficulty = store.data.settings.difficulty;
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!button) return;
      this.actions.unlock();
      const action = button.dataset.action!;
      if (action === 'setup') {
        this.show('setup');
      }
      if (action === 'home') {
        this.actions.home();
      }
      if (action === 'help') {
        this.show('help');
      }
      if (action === 'back-setup') {
        this.show('setup');
      }
      if (action === 'character') {
        this.selected = button.dataset.id as CharacterId;
        this.store.setSettings({ characterId: this.selected });
        this.render();
      }
      if (action === 'mode') {
        this.mode = button.dataset.id as RaceMode;
        this.render();
      }
      if (action === 'difficulty') {
        this.difficulty = button.dataset.id as Difficulty;
        this.store.setSettings({ difficulty: this.difficulty });
        this.render();
      }
      if (action === 'start') {
        this.finalSaved = false;
        this.actions.start({
          characterId: this.selected,
          difficulty: this.difficulty,
          mode: this.mode,
        });
      }
      if (action === 'pause') this.actions.pause();
      if (action === 'resume') this.actions.resume();
      if (action === 'restart') {
        this.finalSaved = false;
        this.actions.restart();
      }
      if (action === 'settings') {
        this.settingsReturn = this.screen;
        this.show('settings');
      }
      if (action === 'close-settings') this.show(this.settingsReturn);
      if (action === 'sound') {
        this.store.setSettings({ sound: !this.store.data.settings.sound });
        this.actions.settings(this.store.data.settings);
        if (this.screen !== 'playing') this.render();
        else
          this.root
            .querySelector('[data-action="sound"]')
            ?.setAttribute('aria-label', this.store.data.settings.sound ? '关闭声音' : '开启声音');
      }
      if (action === 'fullscreen') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      }
    });
    this.root.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.setting === 'sound' || input.dataset.setting === 'music') {
        this.store.setSettings({ [input.dataset.setting]: input.checked });
      }
      if (input.dataset.setting === 'quality')
        this.store.setSettings({ quality: input.value as Quality });
      if (input.dataset.setting === 'volume')
        this.store.setSettings({ volume: Number(input.value) });
      this.actions.settings(this.store.data.settings);
    });
    this.show('home');
  }
  show(screen: Screen) {
    this.screen = screen;
    this.render();
    if (screen === 'playing') this.lastHudTime = -1;
  }
  private button(action: string, text: string, className = 'button secondary') {
    return '<button class="' + className + '" data-action="' + action + '">' + text + '</button>';
  }
  private header() {
    return (
      '<header class="topbar"><a class="brand" href="#" data-action="home" aria-label="返回主菜单">' +
      paw +
      '<span>PAWPRINT<span class="brand-small">ISLAND MOTOR CLUB</span></span></a><nav aria-label="游戏工具">' +
      this.button('sound', this.store.data.settings.sound ? '声音 开' : '声音 关', 'utility') +
      this.button('fullscreen', '全屏 ↗', 'utility') +
      this.button('settings', '设置', 'utility') +
      '</nav></header>'
    );
  }
  private render() {
    this.root.className = 'screen-' + this.screen;
    this.minimap = null;
    if (this.screen === 'home') {
      this.root.innerHTML =
        this.header() +
        '<main class="home"><div class="hero"><p class="eyebrow"><span class="spark">✦</span> SUNBREAK COVE · ROUND 01</p><h1>PAWPRINT<br><em>PARADISE</em><span class="hero-star">✦</span></h1><p class="chinese-title">萌爪海湾 <span>海岛卡丁车大赛</span></p>' +
        this.button('setup', '<span>出发，去兜个风</span>' + arrow, 'button primary start-button') +
        '<div class="key-strip"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 驾驶</span><span><kbd>SPACE</kbd> 漂移</span><span><kbd>E</kbd> 道具</span></div></div><aside class="course-card"><span class="course-number">01</span><div><p class="eyebrow">TODAY’S LITTLE ESCAPE</p><h2>晴浪海湾</h2><p class="course-meta"><span>● ● ●</span> 3 圈 · 8 位车手</p></div><canvas id="course-map" width="190" height="160" aria-label="晴浪海湾赛道示意图"></canvas></aside><footer class="home-footer"><span>一点海风，很多快乐。</span>' +
        this.button('help', '第一次来？看看怎么玩 →', 'text-button') +
        '</footer></main>';
      this.drawMap(this.root.querySelector<HTMLCanvasElement>('#course-map')!, null, true);
    } else if (this.screen === 'setup') {
      const character = CHARACTERS.find((c) => c.id === this.selected)!;
      const record = this.store.record(this.selected, this.mode);
      this.root.innerHTML =
        this.header() +
        '<main class="overlay"><section class="panel setup-panel" aria-labelledby="setup-title"><div class="panel-heading"><div><p class="eyebrow">PICK YOUR CO-PILOT</p><h2 id="setup-title">今天，谁来握方向盘？</h2></div>' +
        this.button('home', '返回海湾', 'text-button') +
        '</div><div class="character-grid">' +
        CHARACTERS.map(
          (c) =>
            '<button class="character-card ' +
            (this.selected === c.id ? 'selected' : '') +
            '" data-action="character" data-id="' +
            c.id +
            '" aria-pressed="' +
            (this.selected === c.id) +
            '" style="--accent:' +
            c.accent +
            '"><span class="selected-mark">✓</span><img src="' +
            this.portraits[c.id] +
            '" alt="' +
            c.title +
            '驾驶卡丁车"><span class="character-name">' +
            c.name +
            '<small>' +
            c.title +
            '</small></span></button>',
        ).join('') +
        '</div><div class="driver-detail"><p><strong>' +
        character.name +
        '</strong> ' +
        character.description +
        '</p><div class="stats"><span>极速 <i style="--value:' +
        ((character.speed - 27) / 6) * 100 +
        '%"></i></span><span>起步 <i style="--value:' +
        ((character.acceleration - 12) / 8) * 100 +
        '%"></i></span><span>转向 <i style="--value:' +
        ((character.handling - 0.75) / 0.4) * 100 +
        '%"></i></span></div></div><div class="race-options"><fieldset><legend>比赛模式</legend><div class="segmented">' +
        this.option('mode', 'race', '道具竞速', this.mode === 'race') +
        this.option('mode', 'time', '计时挑战', this.mode === 'time') +
        '</div><p class="option-help">' +
        (this.mode === 'race'
          ? '和 7 位动物车手一起争夺领奖台。'
          : '独享赛道，刷新自己的三圈纪录。') +
        '</p></fieldset><fieldset><legend>对手难度</legend><div class="segmented ' +
        (this.mode === 'time' ? 'disabled' : '') +
        '">' +
        this.option(
          'difficulty',
          'easy',
          '轻松',
          this.difficulty === 'easy',
          this.mode === 'time',
        ) +
        this.option(
          'difficulty',
          'normal',
          '标准',
          this.difficulty === 'normal',
          this.mode === 'time',
        ) +
        this.option(
          'difficulty',
          'hard',
          '挑战',
          this.difficulty === 'hard',
          this.mode === 'time',
        ) +
        '</div><p class="option-help">晴浪海湾 · 3 圈 · 最佳 ' +
        formatTime(record.race) +
        '</p></fieldset></div><div class="setup-footer">' +
        this.button('help', '操作与漂移技巧 ↗', 'text-button') +
        this.button('start', '<span>驶上发车线</span>' + arrow, 'button primary') +
        '</div></section></main>';
    } else if (this.screen === 'help') {
      this.root.innerHTML =
        this.header() +
        '<main class="overlay"><section class="panel help-panel"><p class="eyebrow">A LITTLE PRACTICE, A LOT OF FUN</p><h2>第一个弯，就会爱上。</h2><div class="instructions"><div><span class="instruction-number">01</span><h3>踩油门，去海边</h3><p><kbd>W / ↑</kbd> 加速，<kbd>S / ↓</kbd> 刹车与倒车<br><kbd>A D / ← →</kbd> 转向，松开油门自然减速。</p></div><div><span class="instruction-number">02</span><h3>把转弯变成加速</h3><p>有速度时，按住 <kbd>空格</kbd> 并转向。<br>蓝色火花是一级蓄力，金色是二级。<br>松开空格，冲出去！</p></div><div><span class="instruction-number">03</span><h3>捡点小惊喜</h3><p>撞上「?」道具箱，用 <kbd>E</kbd> 释放。<br>加速果汁、泡泡护盾、水球和香蕉皮，<br>每一个弯都有新机会。</p></div></div><div class="help-note"><kbd>R</kbd> 回到最近检查点 <span>·</span> <kbd>Esc</kbd> 暂停 <span>·</span> 离开窗口会自动暂停</div>' +
        this.button('back-setup', '知道了，选车手去 ' + arrow, 'button primary') +
        '</section></main>';
    } else if (this.screen === 'playing') {
      this.root.innerHTML =
        '<main class="hud" aria-label="比赛信息"><div class="position-widget"><span class="hud-label">POSITION</span><div><strong id="position">1</strong><span id="racer-count">/ 8</span></div></div><div class="lap-widget"><span class="hud-label">LAP</span><strong id="lap">1 <small>/ 3</small></strong></div><div class="timing-widget"><span class="hud-label">RACE TIME</span><strong id="race-time">0:00.000</strong><span id="best-lap">最佳单圈 — —</span></div>' +
        this.button('pause', 'Ⅱ<span>暂停</span>', 'pause-button') +
        '<div class="map-widget"><span class="hud-label">SUNBREAK COVE</span><canvas id="minimap" width="240" height="200" aria-label="实时赛道位置"></canvas></div><div class="item-widget"><div id="item-icon" class="item-icon">?</div><div><strong id="item-name">寻找道具箱</strong><span id="item-key"><kbd>E</kbd> 使用道具</span></div></div><div class="speed-widget"><div><strong id="speed">0</strong><span>KM/H</span></div><div class="drift-meter"><i id="drift-fill"></i></div><span id="drift-label">按住 空格 + 转向 漂移</span></div><div id="countdown" class="countdown" aria-live="polite"></div><div id="race-message" class="race-message" aria-live="polite"></div><div id="race-tip" class="race-tip"><kbd>W</kbd> 加速 <kbd>A</kbd><kbd>D</kbd> 转向 <kbd>SPACE</kbd> 漂移 <kbd>E</kbd> 道具 <kbd>R</kbd> 回到赛道</div></main>';
      this.minimap = this.root.querySelector('#minimap');
    } else if (this.screen === 'pause') {
      this.root.innerHTML =
        '<main class="overlay"><section class="panel pause-panel"><p class="eyebrow">TAKE A BREATHER</p><h2>海风等你一下。</h2><p class="muted">比赛已暂停。</p>' +
        this.button('resume', '继续比赛 ' + arrow, 'button primary') +
        this.button('restart', '重新发车') +
        this.button('settings', '声音与画面') +
        this.button('home', '返回主菜单', 'text-button') +
        '<p class="pause-hint"><kbd>Esc</kbd> 继续</p></section></main>';
    } else if (this.screen === 'settings') {
      const s = this.store.data.settings;
      this.root.innerHTML =
        '<main class="overlay"><section class="panel settings-panel"><p class="eyebrow">MAKE YOURSELF AT HOME</p><h2>声音与画面</h2><label class="setting-row"><span>游戏声音<small>发动机、海风与比赛反馈</small></span><input type="checkbox" data-setting="sound" ' +
        (s.sound ? 'checked' : '') +
        '></label><label class="setting-row"><span>背景音乐<small>轻快的海岛旋律</small></span><input type="checkbox" data-setting="music" ' +
        (s.music ? 'checked' : '') +
        '></label><label class="setting-row"><span>音量</span><input aria-label="音量" type="range" data-setting="volume" min="0" max="1" step=".05" value="' +
        s.volume +
        '"></label><label class="setting-row"><span>画质<small>降低画质可以提高流畅度</small></span><select data-setting="quality"><option value="low" ' +
        (s.quality === 'low' ? 'selected' : '') +
        '>流畅</option><option value="medium" ' +
        (s.quality === 'medium' ? 'selected' : '') +
        '>标准</option><option value="high" ' +
        (s.quality === 'high' ? 'selected' : '') +
        '>精致</option></select></label>' +
        this.button('close-settings', '完成', 'button primary') +
        '</section></main>';
    } else if (this.screen === 'results' && this.snapshot) {
      const s = this.snapshot,
        player = s.racers[0],
        rank = s.standings.findIndex((r) => r.id === 0) + 1,
        lap = Math.min(...player.lapTimes),
        title =
          s.config.mode === 'time'
            ? '与自己，再快一点。'
            : rank === 1
              ? '冠军，就是你！'
              : rank <= 3
                ? '领奖台上见！'
                : '漂亮地跑完了！';
      if (!this.finalSaved) {
        const records = this.store.updateRecord(
          player.characterId,
          s.config.mode,
          lap,
          player.finishTime!,
        );
        this.newRecord = records.race;
        this.finalSaved = true;
      }
      this.root.innerHTML =
        '<main class="overlay"><section class="panel results-panel"><div class="panel-heading"><div><p class="eyebrow">THAT WAS A GOOD RIDE</p><h2>' +
        title +
        '</h2></div><span class="finish-badge">FINISH</span></div><div class="results-layout"><div class="result-hero"><img src="' +
        this.portraits[player.characterId] +
        '" alt="你的完赛车手"><div class="result-place">' +
        (s.config.mode === 'time' ? '3<span>圈完成</span>' : rank + '<span>/ 8 位</span>') +
        '</div><div class="result-times"><div><span>完赛用时</span><strong>' +
        formatTime(player.finishTime) +
        '</strong></div><div><span>最佳单圈</span><strong>' +
        formatTime(lap) +
        '</strong></div></div>' +
        (this.newRecord ? '<p class="record-badge">✦ 新的个人纪录</p>' : '') +
        '</div><div class="leaderboard">' +
        (s.config.mode === 'race'
          ? '<div class="board-heading"><span>最终排名</span><span>时间 / 状态</span></div>' +
            s.standings
              .map(
                (r, i) =>
                  '<div class="leaderboard-row ' +
                  (r.id === 0 ? 'is-player' : '') +
                  '"><span class="rank">' +
                  (i + 1) +
                  '</span><span class="racer-dot" style="background:' +
                  CHARACTERS.find((c) => c.id === r.characterId)!.accent +
                  '"></span><span class="racer-name">' +
                  r.name +
                  '<small>' +
                  CHARACTERS.find((c) => c.id === r.characterId)!.title +
                  '</small></span><strong>' +
                  formatTime(r.finishTime) +
                  (r.finishTime === null ? '<small>按赛道进度</small>' : '') +
                  '</strong></div>',
              )
              .join('')
          : '<div class="board-heading"><span>每一圈都算数</span></div>' +
            player.lapTimes
              .map(
                (t, i) =>
                  '<div class="lap-result"><span>第 ' +
                  (i + 1) +
                  ' 圈</span><strong>' +
                  formatTime(t) +
                  '</strong>' +
                  (t === lap ? '<small>BEST</small>' : '') +
                  '</div>',
              )
              .join('') +
            '<p class="trial-note">计时挑战没有道具与对手。<br>下一次，在熟悉的弯道再快一点。</p>') +
        '</div></div><div class="setup-footer">' +
        this.button('home', '返回海湾', 'text-button') +
        this.button('restart', '再来一局 ' + arrow, 'button primary') +
        '</div></section></main>';
    }
    if (this.screen !== 'playing' && this.screen !== 'home')
      this.root.querySelector<HTMLButtonElement>('.primary')?.focus({ preventScroll: true });
  }
  private option(action: string, id: string, label: string, active: boolean, disabled = false) {
    return (
      '<button data-action="' +
      action +
      '" data-id="' +
      id +
      '" aria-pressed="' +
      active +
      '" class="' +
      (active ? 'active' : '') +
      '" ' +
      (disabled ? 'disabled' : '') +
      '>' +
      label +
      '</button>'
    );
  }
  events(events: RaceEvent[], time: number) {
    for (const e of events) {
      if (e.racerId !== 0) continue;
      if (e.type === 'drift') this.notify(e.value === 2 ? '超级漂移加速！' : '漂移加速！', time);
      if (e.type === 'pickup')
        this.notify('获得 ' + ITEM_INFO[e.value as keyof typeof ITEM_INFO].name, time);
      if (e.type === 'hit') this.notify('打了个滑！稳住方向', time);
      if (e.type === 'shield') this.notify('泡泡护盾', time);
      if (e.type === 'lap' && Number(e.value) < 3)
        this.notify(e.value === 2 ? '最后一圈，全力冲刺！' : '第二圈，继续保持！', time, 2.5);
      if (e.type === 'recover') this.notify('回到检查点，继续出发', time);
    }
  }
  private notify(text: string, time: number, duration = 1.6) {
    this.message = text;
    this.messageUntil = time + duration;
  }
  update(snapshot: RaceSnapshot, time: number) {
    this.snapshot = snapshot;
    if (this.screen !== 'playing' || time - this.lastHudTime < 0.05) return;
    this.lastHudTime = time;
    const player = snapshot.racers[0],
      rank = snapshot.standings.findIndex((r) => r.id === 0) + 1;
    const set = (id: string, text: string) => {
      const e = this.root.querySelector('#' + id);
      if (e && e.textContent !== text) e.textContent = text;
    };
    set('position', snapshot.config.mode === 'time' ? '⏱' : String(rank));
    set('racer-count', snapshot.config.mode === 'time' ? '计时' : '/ 8');
    const lap = this.root.querySelector('#lap');
    if (lap) lap.innerHTML = Math.min(3, player.laps + 1) + ' <small>/ 3</small>';
    set('race-time', formatTime(snapshot.elapsed));
    set(
      'best-lap',
      '最佳单圈 ' + formatTime(player.lapTimes.length ? Math.min(...player.lapTimes) : null),
    );
    set('speed', String(Math.round(Math.abs(player.speed) * 3.6)));
    set(
      'item-icon',
      player.item ? ITEM_INFO[player.item].icon : snapshot.config.mode === 'time' ? '◷' : '?',
    );
    set(
      'item-name',
      player.item
        ? ITEM_INFO[player.item].name
        : snapshot.config.mode === 'time'
          ? '计时挑战'
          : '寻找道具箱',
    );
    const item = this.root.querySelector<HTMLElement>('.item-widget');
    item?.classList.toggle('has-item', !!player.item);
    const itemKey = this.root.querySelector<HTMLElement>('#item-key');
    if (itemKey) itemKey.style.visibility = snapshot.config.mode === 'time' ? 'hidden' : 'visible';
    const fill = this.root.querySelector<HTMLElement>('#drift-fill');
    if (fill) {
      fill.style.width = Math.min(100, (player.driftCharge / 1.8) * 100) + '%';
      fill.className = player.driftCharge >= 1.8 ? 'charged' : '';
    }
    set(
      'drift-label',
      player.boost > 0
        ? '加速中！'
        : player.driftCharge >= 1.8
          ? '超级蓄力 · 松开空格！'
          : player.driftCharge >= 0.7
            ? '蓄力就绪 · 松开加速'
            : player.drifting
              ? '漂移蓄力中…'
              : '按住 空格 + 转向 漂移',
    );
    set(
      'countdown',
      snapshot.phase === 'countdown'
        ? String(Math.min(3, Math.ceil(snapshot.countdown)))
        : snapshot.elapsed < 0.85
          ? 'GO!'
          : '',
    );
    const countdown = this.root.querySelector('#countdown');
    countdown?.classList.toggle('go', snapshot.phase === 'racing');
    set('race-message', time < this.messageUntil ? this.message : '');
    const tip = this.root.querySelector<HTMLElement>('#race-tip');
    if (tip) tip.style.opacity = snapshot.elapsed < 8 ? '1' : '0';
    if (this.minimap) this.drawMap(this.minimap, snapshot);
  }
  private drawMap(canvas: HTMLCanvasElement, snapshot: RaceSnapshot | null, course = false) {
    const ctx = canvas.getContext('2d')!,
      w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min((w - 26) / 335, (h - 24) / 290),
      cx = w / 2,
      cy = h / 2 + 8;
    const drawPath = () => {
      ctx.beginPath();
      TRACK.samples.forEach((p, i) => {
        const x = cx + p.x * scale,
          y = cy + p.z * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    };
    drawPath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = course ? 'rgba(31,93,91,.15)' : 'rgba(255,255,235,.2)';
    ctx.lineWidth = 12;
    ctx.stroke();
    drawPath();
    ctx.strokeStyle = course ? '#328b87' : '#f7eed4';
    ctx.lineWidth = 4;
    ctx.stroke();
    const start = TRACK.at(0);
    ctx.fillStyle = '#ff9c6e';
    ctx.fillRect(cx + start.x * scale - 3, cy + start.z * scale - 4, 6, 8);
    if (snapshot)
      for (const r of [...snapshot.racers].reverse()) {
        ctx.beginPath();
        ctx.arc(cx + r.x * scale, cy + r.z * scale, r.id === 0 ? 5.5 : 3.1, 0, Math.PI * 2);
        ctx.fillStyle =
          r.id === 0 ? '#ffda67' : CHARACTERS.find((c) => c.id === r.characterId)!.accent;
        ctx.fill();
        ctx.strokeStyle = '#1e4d52';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
  }
}
