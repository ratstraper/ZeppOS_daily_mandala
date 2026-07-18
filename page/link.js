import { createWidget, deleteWidget, widget, align, text_style } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import {
  setPageBrightTime, resetPageBrightTime,
  pauseDropWristScreenOff, resumeDropWristScreenOff
} from '@zos/display'
import { BasePage } from '@zeppos/zml/base-page'
import { WatchApi } from '../utils/watch-api'
import AppStorage from '../utils/config/storage.js';
import { STORAGE_KEYS } from '../utils/config/constants';
import { log as Logger, px } from "@zos/utils";

const logger = Logger.getLogger("mandala_day");
const { width: W, height: H } = getDeviceInfo()
const POLL_MS = 4000

Page(BasePage({
  state: { widgets: [], timer: null, ticks: 0, maxTicks: 150, busy: false },

  build() {
    logger.log(`LINK.JS`);
    this.restore()
  },

  // ── восстановление: сервер — источник истины ────────────────────
  restore() {
    this.stopPolling()
    this.showWait('Loading...')
    WatchApi.linkStatus(this)
      .then(d => {
        logger.log('restore:', d)
        if (!d || d.status !== 'OK') return this.showDone(false, (d && d.error) || 'Error')
        if (d.link === 'pending_watch_confirm' && d.wallet) this.showConfirm(d.wallet)
        else if (d.link === 'linked') this.showDone(true, 'Linked\n' + (d.wallet || ''))
        else this.startLink()
      })
      .catch(() => this.showDone(false, 'Network error'))
  },

  startLink() {
    WatchApi.linkStart(this)
      .then(d => {
        if (!d || d.status !== 'OK' || !d.qr)
          return this.showDone(false, (d && d.error) || 'Error')
        this.state.maxTicks = Math.ceil(((d.ttlSec || 600) * 1000) / POLL_MS)
        this.showQr(d.qr)
        this.startPolling()
      })
      .catch(() => this.showDone(false, 'Network error'))
  },

  startPolling() {
    this.stopPolling()
    this.state.ticks = 0
    this.state.timer = setInterval(() => this.poll(), POLL_MS)
  },
  stopPolling() {
    if (this.state.timer) { clearInterval(this.state.timer); this.state.timer = null }
  },

  poll() {
    if (++this.state.ticks > this.state.maxTicks) {
      this.stopPolling()
      return this.showDone(false, 'QR expired')
    }
    WatchApi.linkStatus(this)
      .then(d => {
        if (!d || d.status !== 'OK') return
        if (d.link === 'pending_watch_confirm' && d.wallet) {
          this.stopPolling()
          this.showConfirm(d.wallet)
        } else if (d.link === 'linked') {
          this.stopPolling()
          this.showDone(true, 'Linked\n' + (d.wallet || ''))
        }
      })
      .catch(() => {})   // сеть моргнула — ждём следующий тик
  },

  confirm(wallet) {
    if (this.state.busy) return
    this.state.busy = true
    WatchApi.linkConfirm(this, { wallet })
      .then(d => d && d.status === 'OK'
        ? this.showDone(true, 'Linked\n' + wallet)
        : this.showDone(false, (d && d.error) || 'Error'))
      .catch(() => this.showDone(false, 'Network error'))
      .finally(() => { this.state.busy = false })
  },

  reject() {
    if (this.state.busy) return
    this.state.busy = true
    WatchApi.linkReject(this)
      .catch(() => {})
      .finally(() => { this.state.busy = false; this.startLink() })
  },

  // UI
  add(type, opts) {
    const w = createWidget(type, opts)
    this.state.widgets.push(w)
    return w
  },
  clear() {
    this.state.widgets.forEach(w => deleteWidget(w))
    this.state.widgets = []
  },

  showWait(msg) {
    this.clear()
    this.add(widget.TEXT, {
      x: 0, y: Math.floor(H * 0.42), w: W, h: 80,
      text: msg, color: 0x888888, text_size: 26,
      align_h: align.CENTER_H, text_style: text_style.WRAP
    })
  },

  showQr(url) {
    this.clear()
    setPageBrightTime({ brightTime: 600000 })       // держим экран, пока висит QR
    pauseDropWristScreenOff({ duration: 600000 })
    const size = Math.floor(Math.min(W, H) * 0.55)
    this.add(widget.TEXT, {
      x: 0, y: Math.floor(H * 0.05), w: W, h: 40,
      text: 'Scan to link', color: 0xffffff, text_size: 28, align_h: align.CENTER_H
    })
      const qrPad = px(10)
      const bgX = Math.floor((W - size) / 2);
      const bgY = Math.floor(H * 0.17);

    this.add(widget.QRCODE, {
      content: url,
      x: bgX + qrPad, 
      y: bgY + qrPad, 
      w: size - qrPad * 2, 
      h: size - qrPad * 2,
      bg_x: bgX,
      bg_y: bgY,
      bg_w: size,
      bg_h: size,
      bg_radius: px(14),
    })
    this.add(widget.TEXT, {
      x: 0, y: Math.floor(H * 0.78), w: W, h: 60,
      text: 'Waiting for wallet...', color: 0x888888, text_size: 22,
      align_h: align.CENTER_H, text_style: text_style.WRAP
    })
  },

  showConfirm(wallet) {
    this.clear()
    this.add(widget.TEXT, {
      x: 0, y: Math.floor(H * 0.10), w: W, h: 140,
      text: 'Link wallet\n' + wallet + '\nto this watch?',
      color: 0xffffff, text_size: 26,
      align_h: align.CENTER_H, text_style: text_style.WRAP
    })
    this.add(widget.BUTTON, {
      x: Math.floor(W * 0.12), y: Math.floor(H * 0.46),
      w: Math.floor(W * 0.76), h: 56, radius: 28,
      text: 'Confirm', normal_color: 0x00a86b, press_color: 0x007a4d,
      click_func: () => this.confirm(wallet)
    })
    this.add(widget.BUTTON, {
      x: Math.floor(W * 0.12), y: Math.floor(H * 0.64),
      w: Math.floor(W * 0.76), h: 56, radius: 28,
      text: 'Cancel', normal_color: 0x333333, press_color: 0x222222,
      click_func: () => this.reject()
    })
  },

  showDone(ok, msg) {
    this.clear()
    this.add(widget.TEXT, {
      x: 0, y: Math.floor(H * 0.30), w: W, h: 140,
      text: msg, color: ok ? 0x00a86b : 0xcc3344, text_size: 28,
      align_h: align.CENTER_H, text_style: text_style.WRAP
    })
    if (!ok) {
      this.add(widget.BUTTON, {
        x: Math.floor(W * 0.2), y: Math.floor(H * 0.62),
        w: Math.floor(W * 0.6), h: 56, radius: 28,
        text: 'Retry', normal_color: 0x2d6cdf, press_color: 0x1f4fa3,
        click_func: () => this.restore()
      })
    }
    AppStorage.setRecord(STORAGE_KEYS.LINKED, ok)
  },

  onDestroy() {
    this.stopPolling()
    resetPageBrightTime()
    resumeDropWristScreenOff({ duration: 0 })
  }
}))