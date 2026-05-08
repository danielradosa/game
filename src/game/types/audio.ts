export type SoundName =
  | "jump"
  | "doublejump"
  | "dash"
  | "land"
  | "collect"
  | "big_collect"
  | "level_up"
  | "discover"
  | "achievement"
  | "portal"
  | "click"

export type SoundMap = Record<SoundName, HTMLAudioElement | null>

export type VolumeMap = Record<SoundName, number>

export type OscType = OscillatorType
