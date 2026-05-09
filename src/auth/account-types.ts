export type AccountState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "signed-in"; username: string; signedInAt: string; saveCount: number }
  | { status: "error"; message: string }
