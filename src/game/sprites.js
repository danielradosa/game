// Replace procedural drawings with real images. Strict sizing required.
//   const img = new Image(); img.src = '/sprites/player.png'; SPRITES.player = img;
// All character sprites must face RIGHT — renderer mirrors automatically.
export const ASSET_SIZES = {
  player: { w: 48, h: 48, anchor: "bottom-center" },
  tile_ground: { w: 36, h: 36, anchor: "top-left" },
  tile_grass: { w: 36, h: 36, anchor: "top-left" },
  tile_platform: { w: 36, h: 12, anchor: "top-left" },
  collectible: { w: 24, h: 24, anchor: "center" },
  cache: { w: 40, h: 40, anchor: "center" },
  portal_delve: { w: 36, h: 64, anchor: "bottom-center" },
  portal_return: { w: 36, h: 52, anchor: "bottom-center" },
  npc: { w: 36, h: 48, anchor: "bottom-center" },
  tile_ground_delve: { w: 36, h: 36, anchor: "top-left" },
  tile_platform_delve: { w: 36, h: 12, anchor: "top-left" },
};
export const SPRITES = {
  player: null,
  tile_ground: null,
  tile_grass: null,
  tile_platform: null,
  collectible: null,
  cache: null,
  portal_delve: null,
  portal_return: null,
  npc: null,
  tile_ground_delve: null,
  tile_platform_delve: null,
};
export const isReady = (s) => s && s.complete && s.naturalWidth > 0;
export function tryDrawSprite(ctx, name, x, y) {
  const s = SPRITES[name];
  if (!isReady(s)) return false;
  const spec = ASSET_SIZES[name];
  let dx = x,
    dy = y;
  if (spec.anchor === "center") {
    dx = x - spec.w / 2;
    dy = y - spec.h / 2;
  } else if (spec.anchor === "bottom-center") {
    dx = x - spec.w / 2;
    dy = y - spec.h;
  }
  ctx.drawImage(s, Math.round(dx), Math.round(dy), spec.w, spec.h);
  return true;
}
