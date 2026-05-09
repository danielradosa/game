function loadSprite(src: string): HTMLImageElement {
  const img = new Image()
  img.src = src
  return img
}

export default loadSprite
