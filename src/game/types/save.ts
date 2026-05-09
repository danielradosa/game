// Save types moved to @/shared/save for cross-package use (client + server).
// This file remains as a stable import path for existing call sites.
export type {
  HudState,
  PortalStateSerialized,
  QuestStage,
  SaveData,
  SaveManifest,
  SaveMeta,
} from "@/shared/save"
