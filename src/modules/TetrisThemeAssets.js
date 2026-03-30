const kimetsuBgUrl = new URL('../assets/image/X1/036543bd-6dab-4ac8-a0f6-e2591fc3a6e2.png', import.meta.url).href;
const kimetsuBoardBgUrl = new URL('../assets/image/X1/bg.png', import.meta.url).href;

const kimetsuAvatarUrls = [
  new URL('../assets/image/X1/3610c459-8d6e-4c90-8229-0635a719f8a6.png', import.meta.url).href,
  new URL('../assets/image/X1/4a35ab4b-e3a0-4c0e-aa51-f1a50c99d1f8.png', import.meta.url).href,
  new URL('../assets/image/X1/58fa0116-164a-4c9b-a8c4-318cf8246d39.png', import.meta.url).href,
  new URL('../assets/image/X1/5b6ceddd-ae48-4141-82a2-7b8dfc0f1f33.png', import.meta.url).href,
  new URL('../assets/image/X1/9c721eb5-cb6a-4a40-a58e-4e2a33c5d9f8.png', import.meta.url).href,
  new URL('../assets/image/X1/b8c270a4-e0ca-42eb-afe5-66c3ceb9d832.png', import.meta.url).href,
  new URL('../assets/image/X1/dbd5ba85-c096-4ee9-af0f-e7499febacee.png', import.meta.url).href
];

const imageCache = new Map();

const layBgUrl = new URL('../assets/image/X2/2498501e-161a-43f0-811c-8a5d780abefb.png', import.meta.url).href;
const layBoardBgUrl = new URL('../assets/image/X2/bg.png', import.meta.url).href;
const layAvatarUrls = [
  new URL('../assets/image/X2/029b7634-6bac-45d5-99fc-9403d7119537.png', import.meta.url).href,
  new URL('../assets/image/X2/069341d9-2b09-4417-87e2-08f3c4607597.png', import.meta.url).href,
  new URL('../assets/image/X2/0cae0c30-a4a8-4de8-bf14-a7288d3a28f8.png', import.meta.url).href,
  new URL('../assets/image/X2/55a032c0-8334-41c3-8352-1c2a0b71468a.png', import.meta.url).href,
  new URL('../assets/image/X2/93471be2-6ba9-47a5-96fd-96875bba0d4d.png', import.meta.url).href,
  new URL('../assets/image/X2/c354f194-a9ca-4159-bb7d-f293ffeebb90.png', import.meta.url).href,
  new URL('../assets/image/X2/cf034c58-a817-40e5-ba77-cfc5a158b796.png', import.meta.url).href
];

export function getKimetsuBgUrl() {
  return kimetsuBgUrl;
}

export function getKimetsuBoardBgUrl() {
  return kimetsuBoardBgUrl;
}

export function getKimetsuAvatarUrls() {
  return kimetsuAvatarUrls.slice();
}

export function getLayBgUrl() {
  return layBgUrl;
}

export function getLayBoardBgUrl() {
  return layBoardBgUrl;
}

export function getLayAvatarUrls() {
  return layAvatarUrls.slice();
}

export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

export async function preloadImages(urls = []) {
  const list = Array.isArray(urls) ? urls : [];
  await Promise.all(list.map((u) => loadImage(u)));
}

export async function getCachedImage(url) {
  return await loadImage(url);
}
