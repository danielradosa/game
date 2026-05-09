export interface KeyBindings {
  moveLeft: string
  moveRight: string
  moveUp: string
  moveDown: string
  jump: string
  dash: string
  interact: string
  heal: string
  storm: string
}

export interface Settings {
  volume: number
  muted: boolean
  fullscreen: boolean
  keys: KeyBindings
  showTutorialNextStart: boolean
  syncToAccount?: boolean
}
