import type { NotifierApi } from '../../preload/index'

declare global {
  interface Window {
    notifier: NotifierApi
  }
}

export {}
