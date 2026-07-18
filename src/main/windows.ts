import { app, BrowserWindow, Menu, Tray, nativeImage, screen } from 'electron'
import { join } from 'path'
import { IPC, type InboxState, type InboxStats } from '../shared/types'

const POPUP_W = 420
const POPUP_H = 660

export class WindowManager {
  private popup: BrowserWindow | null = null
  private tray: Tray | null = null

  constructor(private onPopupOpened: () => void) {}

  createAll(): void {
    this.createTray()
    this.createPopup()
  }

  togglePopup(): void {
    if (!this.popup) return
    if (this.popup.isVisible()) {
      this.popup.hide()
      return
    }

    this.positionPopup()
    this.popup.show()
    this.popup.focus()
    this.onPopupOpened()
  }

  showPopup(): void {
    if (this.popup && !this.popup.isVisible()) {
      this.positionPopup()
      this.popup.show()
      this.popup.focus()
      this.onPopupOpened()
      return
    }
    this.popup?.focus()
  }

  broadcastState(state: InboxState): void {
    if (this.popup && !this.popup.isDestroyed()) {
      this.popup.webContents.send(IPC.inboxState, state)
    }
    this.updateTray(state)
  }

  broadcastStats(stats: InboxStats): void {
    if (this.popup && !this.popup.isDestroyed()) {
      this.popup.webContents.send(IPC.inboxStatsUpdate, stats)
    }
  }

  private createTray(): void {
    this.tray = new Tray(this.createTrayImage())
    this.tray.setToolTip('Gmail Docs AI')
    this.tray.on('click', () => this.togglePopup())
    this.tray.on('right-click', () => this.showTrayMenu())
  }

  private createTrayImage(): Electron.NativeImage {
    const image = nativeImage.createFromPath(this.trayIconPath())
    if (image.isEmpty()) {
      console.warn('Tray icon asset was not found or could not be loaded:', this.trayIconPath())
    }
    image.setTemplateImage(true)
    return image
  }

  private trayIconPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'trayTemplate.png')
      : join(process.cwd(), 'build', 'trayTemplate.png')
  }

  private createPopup(): void {
    this.popup = new BrowserWindow({
      width: POPUP_W,
      height: POPUP_H,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      vibrancy: 'menu',
      visualEffectState: 'active',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.popup.on('blur', () => this.popup?.hide())

    this.loadPage(this.popup, 'popup')
  }

  private loadPage(win: BrowserWindow, page: 'popup'): void {
    if (process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}.html`)
    } else {
      win.loadFile(join(__dirname, `../renderer/${page}.html`))
    }
  }

  private positionPopup(): void {
    if (!this.tray || !this.popup) return
    const bounds = this.tray.getBounds()
    const anchorX = bounds.x + bounds.width / 2
    const display = screen.getDisplayNearestPoint({ x: anchorX, y: bounds.y })
    const { workArea } = display

    let x = anchorX - POPUP_W / 2
    x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - POPUP_W - 8))

    const below = bounds.y + bounds.height + 6
    const fitsBelow = below + POPUP_H <= workArea.y + workArea.height - 8
    const y = fitsBelow ? below : Math.max(workArea.y + 8, bounds.y - POPUP_H - 6)

    this.popup.setPosition(Math.round(x), Math.round(y))
  }

  private updateTray(state: InboxState): void {
    if (!this.tray) return
    this.tray.setImage(this.createTrayImage())

    if (state.status === 'signed-out' || state.status === 'signing-in') {
      this.tray.setTitle('')
      this.tray.setToolTip('Gmail Docs AI')
      return
    }

    const unread = state.unreadCount > 99 ? '99+' : String(state.unreadCount)
    this.tray.setTitle(state.unreadCount > 0 ? unread : '')
    this.tray.setToolTip(
      state.newCount > 0
        ? `Gmail Docs AI: ${state.unreadCount} unread, ${state.newCount} new`
        : `Gmail Docs AI: ${state.unreadCount} unread`
    )
  }

  private showTrayMenu(): void {
    if (!this.tray) return
    const menu = Menu.buildFromTemplate([
      { label: 'Open Gmail Docs AI', click: () => this.showPopup() },
      { type: 'separator' },
      { role: 'quit', label: 'Quit Gmail Docs AI' }
    ])
    this.tray.popUpContextMenu(menu)
  }
}
